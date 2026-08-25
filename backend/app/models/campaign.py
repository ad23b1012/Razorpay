from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String(64), primary_key=True, index=True) # e.g. "cmp_audio_cross_sell"
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    target_category = Column(String(100), nullable=True)
    strategy = Column(String(50), default="dynamic_upsell") # "dynamic_upsell", "cart_abandonment", "volume_bundle"
    
    # Financial Budget & Caps
    allocated_budget_inr = Column(Float, default=50000.0)
    spent_discount_inr = Column(Float, default=0.0) # Total discount subsidies granted
    max_discount_percent = Column(Float, default=15.0)
    min_order_value_inr = Column(Float, default=1000.0)
    
    # Performance & ROI Metrics
    impressions = Column(Integer, default=0)
    interventions = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    gross_revenue_inr = Column(Float, default=0.0)
    incremental_revenue_inr = Column(Float, default=0.0)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
