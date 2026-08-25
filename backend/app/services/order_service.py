import asyncio
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException
from app.models.product import Product
from app.models.order import Order, OrderItem
from app.schemas.checkout import CreateOrderRequest
from app.core.razorpay_client import razorpay_service
from app.core.guardrails import guardrail_engine, STATUS_GATED
from app.core.audit_trail import record_audit_log
from app.services import approvals as approvals_service
from app.services import experiment
from app.services import budget as budget_service

logger = logging.getLogger("razoragent.order_service")


class OutOfStock(Exception):
    """Raised when stock ran out between pricing the cart and reserving it."""

    def __init__(self, product_name: str, requested: int):
        self.product_name = product_name
        self.requested = requested
        super().__init__(f"'{product_name}' sold out while the order was being placed.")


async def reserve_stock(db: AsyncSession, order_items: List[OrderItem]) -> None:
    """
    Reserves every line atomically, before any money is involved.

    The check-then-decrement that this replaces had a window between reading
    stock and writing it: two concurrent checkouts could both see the last unit
    and both proceed. A conditional UPDATE that only fires while stock is
    sufficient closes that window — the database decides the winner, and the
    loser is turned away before a Razorpay order exists.

    Lines already reserved are released if a later line fails, so a partial
    reservation never leaks inventory.
    """
    reserved: List[Tuple[str, int]] = []

    # A stable order across concurrent checkouts avoids two carts deadlocking
    # by reserving the same pair of products in opposite orders.
    for item in sorted(order_items, key=lambda oi: oi.product_id):
        result = await db.execute(
            update(Product)
            .where(Product.id == item.product_id, Product.stock_quantity >= item.quantity)
            .values(stock_quantity=Product.stock_quantity - item.quantity)
        )

        if result.rowcount == 0:
            for product_id, quantity in reserved:
                await db.execute(
                    update(Product)
                    .where(Product.id == product_id)
                    .values(stock_quantity=Product.stock_quantity + quantity)
                )
            await db.commit()
            logger.warning(f"Stock reservation lost the race for '{item.product_name}'.")
            raise OutOfStock(item.product_name, item.quantity)

        reserved.append((item.product_id, item.quantity))

    await db.commit()


async def release_stock(db: AsyncSession, order_items: List[OrderItem]) -> None:
    """Returns reserved stock to the shelf when an order never completes."""
    for item in order_items:
        await db.execute(
            update(Product)
            .where(Product.id == item.product_id)
            .values(stock_quantity=Product.stock_quantity + item.quantity)
        )
    await db.commit()


async def price_cart(db: AsyncSession, request: CreateOrderRequest) -> Dict[str, Any]:
    """
    Prices a cart and derives the money bounds that apply to it.

    The per-product negotiation ceilings published in the agent-readable catalog
    are blended into a single cart-level percentage, weighted by line value, so a
    catalog promise of "this item negotiates to 12%" is actually honoured at
    checkout instead of only being advertised.
    """
    if not request.items:
        raise HTTPException(status_code=400, detail="Cart cannot be empty")

    item_ids = [it.product_id for it in request.items]
    result = await db.execute(select(Product).where(Product.id.in_(item_ids)))
    products = {p.id: p for p in result.scalars().all()}

    subtotal = 0.0
    total_cost = 0.0
    weighted_cap_inr = 0.0
    order_items: List[OrderItem] = []

    for it in request.items:
        prod = products.get(it.product_id)
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product '{it.product_id}' not found")
        if prod.stock_quantity < it.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for '{prod.name}'")

        line_total = prod.price_inr * it.quantity
        subtotal += line_total
        total_cost += prod.cost_price_inr * it.quantity
        weighted_cap_inr += line_total * (prod.max_agent_discount_percent or 0.0) / 100.0

        order_items.append(OrderItem(
            product_id=prod.id,
            product_name=prod.name,
            quantity=it.quantity,
            unit_price_inr=prod.price_inr,
            total_price_inr=line_total,
            is_upsell_item=it.is_upsell,
        ))

    blended_product_cap_pct = (weighted_cap_inr / subtotal * 100.0) if subtotal > 0 else 0.0

    # The highest-value line decides which campaign budget funds any discount.
    primary_category = None
    if order_items:
        top_line = max(order_items, key=lambda oi: oi.total_price_inr)
        top_product = products.get(top_line.product_id)
        primary_category = top_product.category if top_product else None

    return {
        "subtotal_inr": subtotal,
        "primary_category": primary_category,
        "total_cost_inr": total_cost,
        "blended_product_cap_pct": round(blended_product_cap_pct, 2),
        "order_items": order_items,
        "item_ids": item_ids,
    }


async def create_order(
    db: AsyncSession,
    request: CreateOrderRequest,
    approved_discount_inr: Optional[float] = None,
    approval_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Prices a cart, runs it through the guardrail engine, and either books a
    Razorpay order or holds the action at the approval gate.

    Returns a discriminated result:
      {"outcome": "created", ...}          — a Razorpay order exists.
      {"outcome": "pending_approval", ...} — nothing charged, a human must decide.

    `approved_discount_inr` is supplied only when resuming a previously gated
    request after a human approved it. It is still clamped to the hard margin
    floor: an approval can lift a policy cap, never the cost floor.
    """
    priced = await price_cart(db, request)
    subtotal = priced["subtotal_inr"]

    campaign, budget_left = await budget_service.remaining_budget(db, priced["primary_category"])

    decision = guardrail_engine.evaluate_discount(
        original_price_inr=subtotal,
        proposed_discount_inr=request.applied_discount_inr,
        cart_total_inr=subtotal,
        cost_price_inr=priced["total_cost_inr"],
        product_max_discount_pct=priced["blended_product_cap_pct"],
        remaining_budget_inr=budget_left,
    )

    if approved_discount_inr is not None:
        # Resuming an approved action. The human decision overrides the soft caps
        # but never the hard ceiling computed by the engine.
        discount_to_apply = max(0.0, min(approved_discount_inr, decision["hard_ceiling_inr"]))
        guardrail_status = "APPROVED_BY_HUMAN"
        decision_reason = (
            f"Resumed after merchant approval {approval_id}: applied ₹{discount_to_apply:,.2f} "
            f"(clamped to the ₹{decision['hard_ceiling_inr']:,.2f} margin floor)."
        )
    elif decision["status"] == STATUS_GATED:
        # THE GATE: nothing is charged and no order is booked. The request is
        # parked for a human, carrying everything needed to replay it verbatim.
        approval = await approvals_service.create_approval_request(
            db=db,
            session_id=request.session_id or "sess_default",
            agent_name=request.agent_type or "buyer_agent",
            proposed_action=approvals_service.ACTION_CHECKOUT_DISCOUNT,
            decision=decision,
            order_amount_inr=subtotal,
            reasoning=decision["reason"],
            resume_payload={"create_order_request": request.model_dump()},
        )
        await db.commit()

        return {
            "outcome": "pending_approval",
            "approval_id": approval.id,
            "status": "pending_approval",
            "subtotal_inr": round(subtotal, 2),
            "requested_discount_inr": decision["requested_discount_inr"],
            "approved_ceiling_inr": decision["approved_ceiling_inr"],
            "auto_applicable_discount_inr": decision["auto_cap_inr"],
            "guardrail_status": decision["status"],
            "explainability_note": decision["reason"],
            "constraints_evaluated": decision["constraints_evaluated"],
        }
    else:
        discount_to_apply = decision["effective_discount_inr"]
        guardrail_status = decision["status"]
        decision_reason = decision["reason"]

    final_total_inr = max(1.0, subtotal - discount_to_apply)
    order_id = f"ord_{uuid.uuid4().hex[:12]}"

    # Inventory is committed before the gateway is called, so a shopper is never
    # charged for something that sold out a moment earlier.
    await reserve_stock(db, priced["order_items"])

    # create_order retries with backoff and sleeps between attempts; keep that
    # off the event loop so one slow gateway does not stall every other request.
    rp_order = await asyncio.to_thread(
        razorpay_service.create_order,
        amount_inr=final_total_inr,
        currency="INR",
        receipt=order_id,
        notes={
            "session_id": request.session_id or "default",
            "agent_assisted": str(request.is_agent_assisted),
            "applied_discount": f"{discount_to_apply:.2f}",
            "guardrail_status": guardrail_status,
            "approval_id": approval_id or "none",
        },
    )

    # Incremental revenue is attributed to upsell lines only — the part of the
    # order the agent actually created — net of the discount spent to win it.
    upsell_revenue = sum(
        oi.total_price_inr for oi in priced["order_items"] if oi.is_upsell_item
    )
    incremental = max(0.0, upsell_revenue - discount_to_apply) if request.is_agent_assisted else 0.0

    order = Order(
        id=order_id,
        razorpay_order_id=rp_order["id"],
        status="created",
        currency="INR",
        subtotal_inr=subtotal,
        discount_inr=discount_to_apply,
        total_amount_inr=final_total_inr,
        is_agent_assisted=request.is_agent_assisted,
        agent_type=request.agent_type,
        campaign_id=request.campaign_id or (campaign.id if campaign else None),
        incremental_revenue_inr=incremental,
        discount_rationale=request.discount_rationale or "Standard checkout",
        customer_email=request.customer_email,
        customer_phone=request.customer_phone,
        session_id=request.session_id,
        items=priced["order_items"],
        order_metadata={
            "guardrail_status": guardrail_status,
            "approval_id": approval_id,
            "binding_constraint": decision.get("binding_constraint"),
            "upsell_revenue_inr": round(upsell_revenue, 2),
        },
    )
    db.add(order)
    await db.flush()

    # Attribute the order to its experiment arm and draw the discount down
    # against the campaign that funded it.
    await experiment.record_conversion(
        db=db,
        session_id=request.session_id or "sess_default",
        revenue_inr=final_total_inr,
        discount_inr=discount_to_apply,
    )
    await budget_service.record_spend(
        db=db,
        campaign=campaign,
        discount_inr=discount_to_apply,
        revenue_inr=final_total_inr,
        incremental_inr=incremental,
        converted=True,
    )

    await record_audit_log(
        db=db,
        actor=request.agent_type or "buyer_agent",
        action_type="order_created",
        reasoning=(
            f"Booked Razorpay order for {len(priced['order_items'])} item(s). "
            f"Subtotal ₹{subtotal:,.2f}, discount applied ₹{discount_to_apply:,.2f}, "
            f"charged ₹{final_total_inr:,.2f}. {decision_reason}"
        ),
        context_data={
            "items": priced["item_ids"],
            "subtotal_inr": subtotal,
            "discount_requested_inr": request.applied_discount_inr,
            "constraints_evaluated": decision["constraints_evaluated"],
            "approval_id": approval_id,
        },
        decision_payload={
            "razorpay_order_id": rp_order["id"],
            "final_amount_inr": final_total_inr,
            "discount_applied_inr": discount_to_apply,
            "binding_constraint": decision.get("binding_constraint"),
        },
        guardrail_status=guardrail_status,
        discount_percent_applied=(discount_to_apply / subtotal * 100.0) if subtotal > 0 else 0.0,
        financial_impact_inr=final_total_inr,
        session_id=request.session_id,
    )
    await db.commit()

    return {
        "outcome": "created",
        "order_id": order_id,
        "razorpay_order_id": rp_order["id"],
        "amount_inr": round(final_total_inr, 2),
        "amount_paise": rp_order["amount"],
        "currency": "INR",
        "razorpay_key_id": razorpay_service.key_id,
        "status": "created",
        "items_count": len(priced["order_items"]),
        "discount_inr": round(discount_to_apply, 2),
        "is_mock": rp_order.get("is_mock", False),
        "guardrail_status": guardrail_status,
        "explainability_note": decision_reason,
        "constraints_evaluated": decision["constraints_evaluated"],
        "gateway_attempts": rp_order.get("attempts", []),
        "gateway_degraded": rp_order.get("degraded", False),
    }
