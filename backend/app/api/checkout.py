import logging
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.product import Product
from app.models.order import Order
from app.models.audit_log import AuditLog
from app.schemas.checkout import (
    CreateOrderRequest,
    CreateOrderResponse,
    CheckoutGatedResponse,
    SimulatePaymentRequest,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)
from app.core.razorpay_client import razorpay_service
from app.core.audit_trail import record_audit_log
from app.services import order_service
from app.services.order_service import OutOfStock

logger = logging.getLogger("razoragent.api.checkout")
router = APIRouter(prefix="/api/v1/checkout", tags=["Checkout & Payments"])


@router.post(
    "/create-order",
    responses={
        200: {"model": CreateOrderResponse, "description": "Razorpay order created."},
        202: {"model": CheckoutGatedResponse, "description": "Held at the approval gate; nothing charged."},
        409: {"description": "An item sold out while the order was being placed."},
    },
)
async def create_order(request: CreateOrderRequest, db: AsyncSession = Depends(get_db)):
    """
    Prices the cart, runs the discount through the guardrail engine, and books a
    Razorpay order.

    If the requested discount trips the human approval gate this returns **202**
    with an approval id and creates no order — nothing is charged until a merchant
    authorizes it from the Safety & Audit console.
    """
    try:
        result = await order_service.create_order(db=db, request=request)
    except OutOfStock as e:
        # Lost the reservation race. No order, no charge, and the shopper is told
        # exactly which item went.
        raise HTTPException(status_code=409, detail=str(e))

    if result["outcome"] == "pending_approval":
        return JSONResponse(
            status_code=202,
            content=CheckoutGatedResponse(**{
                k: v for k, v in result.items() if k != "outcome"
            }).model_dump(),
        )

    return CreateOrderResponse(**{k: v for k, v in result.items() if k != "outcome"})


@router.post("/simulate-payment")
async def simulate_payment(request: SimulatePaymentRequest):
    """
    Simulation mode only: mints a payment id and its correctly-computed HMAC
    signature so the demo can exercise the real verification path without live
    Razorpay credentials.

    Returns 409 once real credentials are configured — at that point payments must
    come from Razorpay Checkout, not from this endpoint.
    """
    try:
        minted = razorpay_service.mint_simulated_payment(request.razorpay_order_id)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {
        **minted,
        "mode": razorpay_service.mode,
        "note": "Simulated payment. The signature below is verified with the same HMAC-SHA256 check Razorpay uses.",
    }


@router.post("/verify-payment", response_model=VerifyPaymentResponse)
async def verify_payment(request: VerifyPaymentRequest, db: AsyncSession = Depends(get_db)):
    """
    Verifies the Razorpay payment signature before marking an order paid.
    A failed signature never captures an order.
    """
    is_valid, detail = razorpay_service.verify_payment_signature(
        razorpay_order_id=request.razorpay_order_id,
        razorpay_payment_id=request.razorpay_payment_id,
        razorpay_signature=request.razorpay_signature,
    )

    result = await db.execute(select(Order).where(Order.razorpay_order_id == request.razorpay_order_id))
    order = result.scalar_one_or_none()

    if not is_valid:
        if order:
            order.status = "failed"

        await record_audit_log(
            db=db,
            actor="razorpay_engine",
            action_type="payment_verification_failed",
            reasoning=f"Refused to capture: {detail}",
            context_data={
                "razorpay_order_id": request.razorpay_order_id,
                "payment_id": request.razorpay_payment_id,
            },
            decision_payload={"status": "failed", "captured": False},
            guardrail_status="BLOCKED",
            session_id=request.session_id,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Invalid Razorpay payment signature. {detail}")

    if not order:
        raise HTTPException(status_code=404, detail="No order found for that Razorpay order id.")

    if order.status == "captured":
        # Idempotent: replaying a verification never double-captures.
        return VerifyPaymentResponse(
            success=True,
            order_id=order.id,
            payment_id=order.razorpay_payment_id or request.razorpay_payment_id,
            status="captured",
            message="Order was already captured; no action taken.",
            verification_detail=detail,
        )

    order.status = "captured"
    order.razorpay_payment_id = request.razorpay_payment_id
    order.razorpay_signature = request.razorpay_signature

    # Stock was already committed when the order was reserved, so capture does
    # not touch it — double-decrementing here would silently lose inventory.

    audit_entry = await record_audit_log(
        db=db,
        actor="razorpay_engine",
        action_type="payment_captured",
        reasoning=(
            f"Captured ₹{order.total_amount_inr:,.2f} for order {order.id} "
            f"(payment {request.razorpay_payment_id}). {detail}"
        ),
        context_data={
            "razorpay_order_id": request.razorpay_order_id,
            "payment_id": request.razorpay_payment_id,
            "mode": razorpay_service.mode,
        },
        decision_payload={"order_id": order.id, "status": "captured"},
        guardrail_status="PASSED",
        financial_impact_inr=order.total_amount_inr,
        session_id=request.session_id,
    )
    await db.commit()

    return VerifyPaymentResponse(
        success=True,
        order_id=order.id,
        payment_id=request.razorpay_payment_id,
        status="captured",
        message="Payment signature verified and order captured.",
        verification_detail=detail,
        audit_trace_id=audit_entry.id,
    )


@router.post("/webhook")
async def handle_razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_razorpay_signature: str = Header(default=""),
    x_razorpay_event_id: str = Header(default=""),
):
    """
    Razorpay webhook receiver. The payload is rejected unless the
    `X-Razorpay-Signature` header verifies against the raw body, and replays of
    the same `X-Razorpay-Event-Id` are acknowledged without reprocessing.
    """
    raw_body = await request.body()

    is_valid, detail = razorpay_service.verify_webhook_signature(raw_body, x_razorpay_signature)
    if not is_valid:
        logger.warning(f"Rejected unverified webhook: {detail}")
        raise HTTPException(status_code=400, detail=f"Webhook signature rejected. {detail}")

    body = await request.json()
    event_name = body.get("event", "unknown")

    if x_razorpay_event_id:
        seen = await db.execute(
            select(AuditLog).where(
                AuditLog.action_type == f"webhook_{event_name}",
                AuditLog.context_data["event_id"].as_string() == x_razorpay_event_id,
            ).limit(1)
        )
        if seen.scalar_one_or_none():
            return {"status": "ok", "event_processed": event_name, "duplicate": True}

    await record_audit_log(
        db=db,
        actor="razorpay_webhook",
        action_type=f"webhook_{event_name}",
        reasoning=f"Processed a signature-verified Razorpay webhook: {event_name}.",
        context_data={"event": event_name, "event_id": x_razorpay_event_id},
        decision_payload=body.get("payload", {}),
        guardrail_status="PASSED",
    )
    await db.commit()

    return {"status": "ok", "event_processed": event_name, "duplicate": False}
