import uuid
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.pending_approval import PendingApproval
from app.core.audit_trail import record_audit_log

logger = logging.getLogger("razoragent.approvals")

# Action kinds a gated request can carry. The kind tells the resolver how to
# resume the action once a human authorizes it.
ACTION_CHECKOUT_DISCOUNT = "checkout_discount"
ACTION_A2A_NEGOTIATION = "a2a_bundle_negotiation"
ACTION_DYNAMIC_UPSELL = "dynamic_upsell_discount"


async def create_approval_request(
    db: AsyncSession,
    session_id: str,
    agent_name: str,
    proposed_action: str,
    decision: Dict[str, Any],
    order_amount_inr: float,
    reasoning: str,
    resume_payload: Optional[Dict[str, Any]] = None,
) -> PendingApproval:
    """
    Persists a gated agent action so a human can authorize or refuse it.

    `decision` is the raw guardrail verdict; `resume_payload` carries everything
    needed to replay the action verbatim once approved, so an approval resumes
    the original request rather than asking the shopper to start over.
    """
    approval = PendingApproval(
        id=f"appr_{uuid.uuid4().hex[:10]}",
        session_id=session_id,
        agent_name=agent_name,
        proposed_action=proposed_action,
        proposed_discount_inr=decision.get("requested_discount_inr", 0.0),
        order_amount_inr=order_amount_inr,
        reasoning=reasoning,
        payload={
            "guardrail_decision": decision,
            "approved_ceiling_inr": decision.get("approved_ceiling_inr", 0.0),
            "auto_cap_inr": decision.get("auto_cap_inr", 0.0),
            "resume": resume_payload or {},
        },
        status="PENDING",
    )
    db.add(approval)
    await db.flush()

    await record_audit_log(
        db=db,
        actor=agent_name,
        action_type="approval_gate_triggered",
        reasoning=(
            f"Action held at the approval gate — nothing charged. {reasoning}"
        ),
        context_data={
            "approval_id": approval.id,
            "proposed_action": proposed_action,
            "order_amount_inr": order_amount_inr,
            "binding_constraint": decision.get("binding_constraint"),
        },
        decision_payload={
            "requested_discount_inr": decision.get("requested_discount_inr", 0.0),
            "approved_ceiling_inr": decision.get("approved_ceiling_inr", 0.0),
            "auto_cap_inr": decision.get("auto_cap_inr", 0.0),
            "applied_now_inr": 0.0,
        },
        guardrail_status="GATED_PENDING_APPROVAL",
        discount_percent_applied=0.0,
        financial_impact_inr=0.0,
        session_id=session_id,
    )

    logger.info(
        f"Approval gate engaged [{approval.id}] {proposed_action} "
        f"(requested ₹{approval.proposed_discount_inr:,.2f}, nothing applied)"
    )
    return approval


async def get_approval(db: AsyncSession, approval_id: str) -> Optional[PendingApproval]:
    result = await db.execute(select(PendingApproval).where(PendingApproval.id == approval_id))
    return result.scalar_one_or_none()


async def mark_resolved(
    db: AsyncSession,
    approval: PendingApproval,
    decision: str,
    reviewer_notes: str,
    outcome: Optional[Dict[str, Any]] = None,
) -> PendingApproval:
    """Stamps a human decision onto a gated action and records it in the audit trail."""
    approval.status = decision
    approval.reviewer_notes = reviewer_notes
    approval.resolved_at = datetime.now(timezone.utc)

    payload = dict(approval.payload or {})
    payload["resolution_outcome"] = outcome or {}
    approval.payload = payload

    applied_inr = float((outcome or {}).get("discount_applied_inr", 0.0))

    await record_audit_log(
        db=db,
        actor="merchant_admin",
        action_type=f"approval_{decision.lower()}",
        reasoning=(
            f"Human reviewer {decision.lower()} the gated action '{approval.proposed_action}' "
            f"(requested ₹{approval.proposed_discount_inr:,.2f}). {reviewer_notes}"
        ),
        context_data={
            "approval_id": approval.id,
            "proposed_action": approval.proposed_action,
            "requested_discount_inr": approval.proposed_discount_inr,
        },
        decision_payload=outcome or {"decision": decision},
        guardrail_status="APPROVED_BY_HUMAN" if decision == "APPROVED" else "REJECTED_BY_HUMAN",
        discount_percent_applied=(
            (applied_inr / approval.order_amount_inr * 100.0) if approval.order_amount_inr > 0 else 0.0
        ),
        financial_impact_inr=applied_inr,
        session_id=approval.session_id,
    )
    return approval
