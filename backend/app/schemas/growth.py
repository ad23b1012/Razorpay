from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class DynamicOfferRequest(BaseModel):
    session_id: str
    cart_items: List[Dict[str, Any]] # [{"product_id": "...", "quantity": 1, "price": 7999.0}]
    cart_total_inr: float
    shopper_intent: Optional[str] = "checkout_view" # "cart_view", "checkout_view", "exit_intent"

class DynamicOfferResponse(BaseModel):
    offer_available: bool
    offer_id: Optional[str] = None
    offer_title: Optional[str] = None
    offer_description: Optional[str] = None
    recommended_product_id: Optional[str] = None
    recommended_product_name: Optional[str] = None
    original_bundle_price_inr: float = 0.0
    discounted_bundle_price_inr: float = 0.0
    discount_amount_inr: float = 0.0
    discount_percent: float = 0.0
    reasoning: str
    guardrail_status: str
    requires_approval: bool = False
    approval_id: Optional[str] = None
    campaign_id: Optional[str] = None

class GrowthMetricsResponse(BaseModel):
    total_revenue_inr: float
    baseline_revenue_inr: float
    incremental_revenue_inr: float
    revenue_uplift_percent: float
    total_orders_count: int
    agent_assisted_orders_count: int
    conversion_rate_baseline_pct: float
    conversion_rate_ai_pct: float
    average_order_value_inr: float
    return_on_discount_spend: float # RODI = incremental_rev / discount_spent
    recent_interventions_count: int
    active_campaigns_count: int
    experiment: Dict[str, Any] = Field(default_factory=dict)
