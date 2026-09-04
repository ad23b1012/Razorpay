from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.audit_trail import record_audit_log
from app.schemas.agent_protocol import (
    ConversationalChatRequest,
    ConversationalChatResponse,
    AgentNegotiateRequest,
    AgentNegotiateResponse,
)
from app.agent.buyer_agent import buyer_agent

router = APIRouter(prefix="/agent/v1", tags=["AI Buyer & Protocol"])

@router.post("/chat", response_model=ConversationalChatResponse)
async def chat_with_buyer_agent(request: ConversationalChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Conversational In-App Buyer Agent endpoint.
    Processes natural language shopping queries, recommends products, and executes cart/checkout actions.
    """
    result = await buyer_agent.process_chat(
        db=db,
        message=request.message,
        session_id=request.session_id,
        cart_items=request.cart_items,
        history=request.history,
    )

    # Record every conversational interaction in the immutable audit trail
    audit_entry = await record_audit_log(
        db=db,
        actor="buyer_conversational_agent",
        action_type=f"chat_{result.get('action', 'NONE')}".lower(),
        reasoning=result.get("reasoning", "Conversational response generated."),
        context_data={
            "user_message": request.message,
            "session_id": request.session_id,
            "action": result.get("action"),
        },
        decision_payload=result.get("action_payload") or {},
        guardrail_status=result.get("guardrail_status", "PASSED"),
        session_id=request.session_id,
    )
    await db.commit()

    cog_trace = result.get("cognitive_trace") or {}
    if audit_entry:
        cog_trace["audit_hash"] = audit_entry.verification_hash
        cog_trace["audit_sequence"] = audit_entry.sequence

    return ConversationalChatResponse(
        reply=result["reply"],
        voice_summary=result.get("voice_summary"),
        action=result.get("action"),
        action_payload=result.get("action_payload"),
        reasoning=result.get("reasoning"),
        guardrail_status=result.get("guardrail_status", "PASSED"),
        cognitive_trace=cog_trace or None,
    )

@router.post("/negotiate", response_model=AgentNegotiateResponse)
async def negotiate_a2a_deal(request: AgentNegotiateRequest, db: AsyncSession = Depends(get_db)):
    """
    Machine-to-Machine Agent Commerce Protocol (UAP/ACP) negotiation endpoint.
    Allows an external AI buyer to request bundle discounts or propose a budget.
    """
    result = await buyer_agent.negotiate_a2a_protocol(
        db=db,
        item_ids=request.item_ids,
        target_budget_inr=request.target_budget_inr,
        buyer_agent_id=request.buyer_agent_id,
        context_notes=request.context_notes
    )

    # Record every A2A negotiation decision in the audit trail
    await record_audit_log(
        db=db,
        actor="a2a_negotiation_engine",
        action_type=f"a2a_negotiate_{result['decision']}".lower(),
        reasoning=result.get("rationale", "A2A negotiation completed."),
        context_data={
            "buyer_agent_id": request.buyer_agent_id,
            "item_ids": request.item_ids,
            "target_budget_inr": request.target_budget_inr,
        },
        decision_payload={
            "decision": result["decision"],
            "offered_price_inr": result["offered_price_inr"],
            "discount_percent": result["discount_percent"],
        },
        guardrail_status=result.get("guardrail_status", "PASSED"),
        discount_percent_applied=result.get("discount_percent", 0.0),
        financial_impact_inr=result.get("offered_price_inr", 0.0),
    )
    await db.commit()

    return AgentNegotiateResponse(**result)
