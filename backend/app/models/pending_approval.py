from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class PendingApproval(Base):
    """
    Approval gates for high-value or high-discount agent recommendations.
    """
    __tablename__ = "pending_approvals"

    id = Column(String(64), primary_key=True, index=True) # e.g. "appr_12345"
    session_id = Column(String(128), nullable=False, index=True)
    agent_name = Column(String(50), nullable=False)
    
    proposed_action = Column(String(100), nullable=False) # e.g. "high_value_bundle_discount"
    proposed_discount_inr = Column(Float, nullable=False)
    order_amount_inr = Column(Float, nullable=False)
    reasoning = Column(Text, nullable=False)
    payload = Column(JSON, default=dict)
    
    status = Column(String(50), default="PENDING") # "PENDING", "APPROVED", "REJECTED", "EXPIRED"
    reviewer_notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
