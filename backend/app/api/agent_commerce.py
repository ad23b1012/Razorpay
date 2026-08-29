"""
Machine-facing purchase endpoint built around an HTTP payment challenge.

An external AI buyer does not have a browser, a session, or a human to click
"Pay". What it has is an HTTP client. So the purchase flow is the one primitive
such a client can always follow:

    POST /agent/v1/purchase                 -> 402 Payment Required + how to pay
    ...agent settles the payment...
    POST /agent/v1/purchase (with proof)    -> 200 + signed receipt

This is the challenge/settle pattern x402 popularised, expressed in this
merchant's own documented dialect — see /.well-known/agent-commerce.json. It is
deliberately not presented as a conformant x402 implementation; the field names
here are ours, and the discovery document says so.

Every guarantee the human checkout enforces applies identically: discounts are
bounded by the composed guardrail engine, anything past the approval threshold
returns 202 and books nothing, stock is reserved atomically, and no order is
fulfilled without a verified signature.
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.protocol import PROTOCOL
from app.core.razorpay_client import razorpay_service
from app.core.audit_trail import record_audit_log
from app.models.order import Order
from app.schemas.checkout import CreateOrderRequest, CartItemInput
from app.services import order_service
from app.services.order_service import OutOfStock
from app.config import settings

logger = logging.getLogger("razoragent.agent_commerce")

router = APIRouter(prefix="/agent/v1", tags=["Agentic Commerce (payment challenge)"])


class PaymentProof(BaseModel):
    """What the buyer presents to prove it settled the challenge."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PurchaseItem(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1)


class PurchaseRequest(BaseModel):
    items: List[PurchaseItem]
    buyer_agent_id: str = "external_ai_buyer"

    # The buyer's own spend mandate. It is echoed back in the challenge so the
    # agent can decline before paying, and it is recorded in the audit trail —
    # a bounded agent should be able to prove afterwards that it stayed bounded.
    max_spend_inr: Optional[float] = None

    requested_discount_inr: float = 0.0
    reason: Optional[str] = None

    # Supplied so a retried challenge returns the same order rather than a new one.
    idempotency_key: Optional[str] = None

    # Present only on the second call, once the buyer has settled.
    payment: Optional[PaymentProof] = None


def _challenge_body(
    order: Dict[str, Any],
    request: PurchaseRequest,
    within_mandate: Optional[bool],
) -> Dict[str, Any]:
    """
    The 402 body: everything a machine needs to pay, and nothing it must guess.
    """
    return {
        "protocol": PROTOCOL,
        "error": "payment_required",
        "message": (
            "This order is reserved and awaiting payment. Settle it, then repeat "
            "this request with the `payment` field populated."
        ),
        "resource": "/agent/v1/purchase",
        "accepts": [
            {
                "scheme": "razorpay-order",
                "network": razorpay_service.mode,
                "amount_inr": order["amount_inr"],
                "amount_paise": order["amount_paise"],
                "currency": order["currency"],
                "razorpay_order_id": order["razorpay_order_id"],
                "razorpay_key_id": order["razorpay_key_id"],
                "methods": ["UPI", "CARD", "NETBANKING", "WALLET"],
                "signature_algorithm": "HMAC-SHA256",
                "signature_message": "{razorpay_order_id}|{razorpay_payment_id}",
                # Only reachable while the server has no live credentials. With
                # real keys this endpoint refuses, and payment must come from
                # Razorpay itself.
                "test_settlement_endpoint": (
                    "/api/v1/checkout/simulate-payment" if razorpay_service.is_mock_mode else None
                ),
            }
        ],
        "order": {
            "order_id": order["order_id"],
            "subtotal_before_discount_inr": round(
                order["amount_inr"] + order["discount_inr"], 2
            ),
            "discount_applied_inr": order["discount_inr"],
            "total_due_inr": order["amount_inr"],
            "items_count": order["items_count"],
        },
        "buyer_mandate": {
            "declared_max_spend_inr": request.max_spend_inr,
            "within_mandate": within_mandate,
        },
        "guardrail": {
            "status": order["guardrail_status"],
            "explanation": order["explainability_note"],
            "bounds_evaluated": order["constraints_evaluated"],
        },
        "retry_with": {
            "method": "POST",
            "url": "/agent/v1/purchase",
            "body_addition": {
                "payment": {
                    "razorpay_order_id": order["razorpay_order_id"],
                    "razorpay_payment_id": "<from your settlement>",
                    "razorpay_signature": "<from your settlement>",
                }
            },
        },
    }


@router.post(
    "/purchase",
    responses={
        200: {"description": "Payment verified; the order is captured and fulfilled."},
        202: {"description": "A human must approve the requested discount. Nothing reserved, nothing charged."},
        402: {"description": "Payment required. The order is reserved and the challenge describes how to settle it."},
        409: {"description": "An item sold out while the order was being placed."},
    },
)
async def agent_purchase(
    request: PurchaseRequest,
    db: AsyncSession = Depends(get_db),
    idempotency_key_header: str = Header(default="", alias="Idempotency-Key"),
):
    """
    Buy as a machine, in two calls.

    Call it without `payment` and you get a **402** carrying the amount due and
    the settlement details. Call it again with proof of payment and the signature
    is verified before anything is fulfilled.
    """
    idem = request.idempotency_key or idempotency_key_header or None

    # ---- Second leg: the buyer claims to have paid. -------------------------
    if request.payment:
        is_valid, detail = razorpay_service.verify_payment_signature(
            razorpay_order_id=request.payment.razorpay_order_id,
            razorpay_payment_id=request.payment.razorpay_payment_id,
            razorpay_signature=request.payment.razorpay_signature,
        )

        result = await db.execute(
            select(Order).where(Order.razorpay_order_id == request.payment.razorpay_order_id)
        )
        order = result.scalar_one_or_none()

        if not is_valid:
            if order:
                order.status = "failed"
            await record_audit_log(
                db=db,
                actor=f"agent:{request.buyer_agent_id}",
                action_type="agent_payment_rejected",
                reasoning=f"Refused to fulfil an agent purchase: {detail}",
                context_data={
                    "buyer_agent_id": request.buyer_agent_id,
                    "razorpay_order_id": request.payment.razorpay_order_id,
                },
                decision_payload={"fulfilled": False},
                guardrail_status="BLOCKED",
                session_id=f"agent_{request.buyer_agent_id}",
            )
            await db.commit()
            raise HTTPException(status_code=400, detail=f"Payment signature rejected. {detail}")

        if not order:
            raise HTTPException(status_code=404, detail="No order matches that Razorpay order id.")

        already_captured = order.status == "captured"
        if not already_captured:
            order.status = "captured"
            order.razorpay_payment_id = request.payment.razorpay_payment_id
            order.razorpay_signature = request.payment.razorpay_signature

        audit = await record_audit_log(
            db=db,
            actor=f"agent:{request.buyer_agent_id}",
            action_type="agent_purchase_fulfilled",
            reasoning=(
                f"External agent '{request.buyer_agent_id}' settled order {order.id} "
                f"for ₹{order.total_amount_inr:,.2f}. {detail}"
            ),
            context_data={
                "buyer_agent_id": request.buyer_agent_id,
                "razorpay_order_id": order.razorpay_order_id,
                "declared_max_spend_inr": request.max_spend_inr,
            },
            decision_payload={"order_id": order.id, "status": "captured"},
            guardrail_status="PASSED",
            financial_impact_inr=order.total_amount_inr,
            session_id=f"agent_{request.buyer_agent_id}",
        )
        await db.commit()

        return {
            "protocol": PROTOCOL,
            "status": "fulfilled",
            "already_captured": already_captured,
            "order_id": order.id,
            "razorpay_order_id": order.razorpay_order_id,
            "razorpay_payment_id": order.razorpay_payment_id,
            "amount_paid_inr": round(order.total_amount_inr, 2),
            "discount_applied_inr": round(order.discount_inr or 0.0, 2),
            "items": [
                {
                    "product_id": item.product_id,
                    "name": item.product_name,
                    "quantity": item.quantity,
                    "line_total_inr": item.total_price_inr,
                }
                for item in order.items
            ],
            "signature_verification": detail,
            "audit_trace_id": audit.id,
            "verify_audit_chain_at": "/api/v1/audit/verify",
        }

    # ---- First leg: price it, bound it, reserve it, and issue the challenge. -
    try:
        result = await order_service.create_order(
            db=db,
            request=CreateOrderRequest(
                items=[
                    CartItemInput(product_id=i.product_id, quantity=i.quantity)
                    for i in request.items
                ],
                session_id=f"agent_{request.buyer_agent_id}",
                applied_discount_inr=request.requested_discount_inr,
                discount_rationale=request.reason or f"Agent purchase by {request.buyer_agent_id}",
                is_agent_assisted=True,
                agent_type="external_buyer_agent",
            ),
            idempotency_key=idem,
        )
    except OutOfStock as e:
        raise HTTPException(status_code=409, detail=str(e))

    if result["outcome"] == "pending_approval":
        # The buyer asked for more than the agent may grant alone. Nothing is
        # reserved and nothing is owed until a human rules.
        return JSONResponse(
            status_code=202,
            content={
                "protocol": PROTOCOL,
                "status": "pending_human_approval",
                "message": (
                    "The requested discount exceeds what this merchant's agent may approve "
                    "on its own. No order was created and nothing is owed. Poll the approval "
                    "below, or repeat this request without the discount to buy at list price."
                ),
                "approval_id": result["approval_id"],
                "poll_url": f"/api/v1/policies/pending-approvals/{result['approval_id']}",
                "requested_discount_inr": result["requested_discount_inr"],
                "auto_applicable_discount_inr": result["auto_applicable_discount_inr"],
                "explanation": result["explainability_note"],
            },
        )

    within_mandate = (
        None if request.max_spend_inr is None else result["amount_inr"] <= request.max_spend_inr
    )

    await record_audit_log(
        db=db,
        actor=f"agent:{request.buyer_agent_id}",
        action_type="agent_payment_challenge_issued",
        reasoning=(
            f"Issued a 402 payment challenge to '{request.buyer_agent_id}' for "
            f"₹{result['amount_inr']:,.2f} on order {result['order_id']}. "
            f"{result['explainability_note']}"
        ),
        context_data={
            "buyer_agent_id": request.buyer_agent_id,
            "declared_max_spend_inr": request.max_spend_inr,
            "within_mandate": within_mandate,
            "idempotency_key": idem,
        },
        decision_payload={
            "razorpay_order_id": result["razorpay_order_id"],
            "amount_due_inr": result["amount_inr"],
        },
        guardrail_status=result["guardrail_status"],
        financial_impact_inr=result["amount_inr"],
        session_id=f"agent_{request.buyer_agent_id}",
    )
    await db.commit()

    return JSONResponse(
        status_code=402,
        content=_challenge_body(result, request, within_mandate),
        headers={
            "Cache-Control": "no-store",
            "X-Payment-Protocol": PROTOCOL,
            "X-Payment-Order-Id": result["razorpay_order_id"] or "",
        },
    )
