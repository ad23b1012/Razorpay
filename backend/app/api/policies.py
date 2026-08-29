import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.policy import GuardrailPolicy
from app.models.pending_approval import PendingApproval
from app.core.guardrails import guardrail_engine
from app.schemas.checkout import CreateOrderRequest
from app.services import approvals as approvals_service
from app.services import order_service

logger = logging.getLogger("razoragent.policies")

router = APIRouter(prefix="/api/v1/policies", tags=["Guardrails & Approval Gates"])


async def load_policy_into_engine(db: AsyncSession) -> None:
    """
    Applies the merchant's saved policy to the live guardrail engine.

    The engine holds its bounds in memory, so without this a restart silently
    reverted enforcement to the .env defaults while the console kept displaying
    the saved values — a merchant could tighten the discount cap, restart, and be
    told 5% while 20% was actually being enforced. Called on startup and after
    every policy write, so the two can never disagree.
    """
    result = await db.execute(select(GuardrailPolicy).limit(1))
    policy = result.scalar_one_or_none()
    if not policy:
        return

    if policy.max_global_discount_percent is not None:
        guardrail_engine.max_discount_pct = policy.max_global_discount_percent
    if policy.approval_threshold_inr is not None:
        guardrail_engine.approval_threshold_inr = policy.approval_threshold_inr
    if policy.min_cart_value_inr is not None:
        guardrail_engine.min_cart_value_inr = policy.min_cart_value_inr
    if policy.daily_budget_inr is not None:
        guardrail_engine.daily_budget_inr = policy.daily_budget_inr

    logger.info(
        f"Guardrail engine loaded from saved policy: max {guardrail_engine.max_discount_pct}%, "
        f"approval gate ₹{guardrail_engine.approval_threshold_inr:,.2f}"
    )


@router.get("")
async def get_guardrail_policy(db: AsyncSession = Depends(get_db)):
    """Fetches the active merchant guardrail policy."""
    result = await db.execute(select(GuardrailPolicy).limit(1))
    policy = result.scalar_one_or_none()
    if not policy:
        return {
            "id": "pol_default",
            "name": "Enterprise Fintech Guardrail Policy",
            "max_global_discount_percent": 20.0,
            "daily_budget_inr": 50000.0,
            "approval_threshold_inr": 5000.0,
            "min_cart_value_inr": 1500.0,
            "prompt_injection_defense_enabled": True
        }
    return policy

@router.put("")
async def update_guardrail_policy(data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """Updates merchant financial boundaries."""
    result = await db.execute(select(GuardrailPolicy).limit(1))
    policy = result.scalar_one_or_none()
    if not policy:
        policy = GuardrailPolicy(id="pol_default_merchant", name="Custom Guardrail Policy")
        db.add(policy)

    if "max_global_discount_percent" in data:
        policy.max_global_discount_percent = float(data["max_global_discount_percent"])
        guardrail_engine.max_discount_pct = policy.max_global_discount_percent
    if "daily_budget_inr" in data:
        policy.daily_budget_inr = float(data["daily_budget_inr"])
    if "approval_threshold_inr" in data:
        policy.approval_threshold_inr = float(data["approval_threshold_inr"])
        guardrail_engine.approval_threshold_inr = policy.approval_threshold_inr
    if "min_cart_value_inr" in data:
        policy.min_cart_value_inr = float(data["min_cart_value_inr"])
        guardrail_engine.min_cart_value_inr = policy.min_cart_value_inr

    await db.commit()
    await db.refresh(policy)
    return policy

@router.get("/pending-approvals")
async def get_pending_approvals(db: AsyncSession = Depends(get_db)):
    """Fetches high-value or high-discount agent interventions requiring human authorization."""
    result = await db.execute(select(PendingApproval).order_by(PendingApproval.created_at.desc()))
    return result.scalars().all()

@router.get("/pending-approvals/{approval_id}")
async def get_pending_approval(approval_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetches one gated action, including its resolution outcome once decided.

    A shopper held at the gate polls this to learn when the merchant has ruled,
    and to pick up the resumed order without starting checkout over.
    """
    approval = await approvals_service.get_approval(db, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Pending approval item not found")
    return approval


@router.post("/pending-approvals/{approval_id}/resolve")
async def resolve_pending_approval(
    approval_id: str,
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    Records a human decision on a gated agent action and, on approval, *resumes*
    the original action rather than asking the shopper to start over.

    An approval can lift a policy cap but never the hard margin floor — the
    guardrail engine re-clamps the approved amount before anything is charged.
    """
    approval = await approvals_service.get_approval(db, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Pending approval item not found")

    if approval.status != "PENDING":
        raise HTTPException(
            status_code=409,
            detail=f"Approval {approval_id} was already {approval.status.lower()}.",
        )

    decision = str(data.get("decision", "APPROVED")).upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="decision must be APPROVED or REJECTED")

    notes = data.get("notes", "Reviewed by merchant admin")
    payload = approval.payload or {}
    outcome: Dict[str, Any] = {"decision": decision, "discount_applied_inr": 0.0}

    if decision == "APPROVED" and approval.proposed_action == approvals_service.ACTION_CHECKOUT_DISCOUNT:
        resume = (payload.get("resume") or {}).get("create_order_request")
        if not resume:
            raise HTTPException(status_code=422, detail="This approval carries no resumable checkout payload.")

        approved_ceiling = float(payload.get("approved_ceiling_inr", 0.0))
        order_result = await order_service.create_order(
            db=db,
            request=CreateOrderRequest(**resume),
            approved_discount_inr=approved_ceiling,
            approval_id=approval.id,
        )
        outcome = {
            "decision": decision,
            "discount_applied_inr": order_result.get("discount_inr", 0.0),
            "order_id": order_result.get("order_id"),
            "razorpay_order_id": order_result.get("razorpay_order_id"),
            "amount_inr": order_result.get("amount_inr"),
            "amount_paise": order_result.get("amount_paise"),
            "razorpay_key_id": order_result.get("razorpay_key_id"),
            "currency": order_result.get("currency", "INR"),
            "is_mock": order_result.get("is_mock", False),
        }

    await approvals_service.mark_resolved(
        db=db,
        approval=approval,
        decision=decision,
        reviewer_notes=notes,
        outcome=outcome,
    )
    await db.commit()

    return {
        "id": approval.id,
        "status": approval.status,
        "message": f"Intervention successfully {approval.status.lower()}.",
        "outcome": outcome,
    }
