from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class GuardrailPolicy(Base):
    __tablename__ = "guardrail_policies"

    id = Column(String(64), primary_key=True, index=True) # e.g. "pol_default_merchant"
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Hard Bounds
    max_global_discount_percent = Column(Float, default=20.0) # Absolute ceiling
    max_single_item_discount_percent = Column(Float, default=25.0)
    daily_budget_inr = Column(Float, default=50000.0)
    spent_today_inr = Column(Float, default=0.0)
    
    # Approval Gates (The Bar)
    approval_threshold_inr = Column(Float, default=5000.0) # Interventions above this amount require human approval
    min_cart_value_inr = Column(Float, default=1500.0)
    
    # Defensive Controls
    prompt_injection_defense_enabled = Column(Boolean, default=True)
    require_human_gate_for_high_value = Column(Boolean, default=True)
    rate_limit_requests_per_minute = Column(Integer, default=60)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
