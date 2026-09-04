from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class AgentNegotiateRequest(BaseModel):
    """External AI Buyer proposing a bundle or asking for best offer"""
    item_ids: List[str]
    target_budget_inr: Optional[float] = None
    buyer_agent_id: str = "agent_buyer_01"
    context_notes: Optional[str] = None

class AgentNegotiateResponse(BaseModel):
    # "ACCEPTED", "COUNTER_OFFER", "COUNTER_OFFER_PENDING_APPROVAL", "REJECTED_OUT_OF_BOUNDS"
    decision: str
    total_original_price_inr: float
    offered_price_inr: float
    discount_amount_inr: float
    discount_percent: float
    rationale: str
    checkout_ready_payload: Dict[str, Any]
    guardrail_status: str
    requires_approval: bool = False
    approval_id: Optional[str] = None
    constraints_evaluated: List[Dict[str, Any]] = []

class ConversationalChatRequest(BaseModel):
    message: str
    session_id: str
    cart_items: List[Dict[str, Any]] = Field(default_factory=list)
    customer_profile: Optional[Dict[str, Any]] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)

class ConversationalChatResponse(BaseModel):
    reply: str
    voice_summary: Optional[str] = None
    action: Optional[str] = None # "ADD_TO_CART", "APPLY_DISCOUNT", "TRIGGER_CHECKOUT", "SHOW_PRODUCTS"
    action_payload: Optional[Dict[str, Any]] = None
    reasoning: Optional[str] = None
    guardrail_status: str = "PASSED"
    cognitive_trace: Optional[Dict[str, Any]] = None
