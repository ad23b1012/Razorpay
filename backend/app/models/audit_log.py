from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class AuditLog(Base):
    """
    Immutable explainable audit trail for every agent action and financial decision ("THE BAR").
    """
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, index=True) # e.g. "aud_9a8b7c6d"
    session_id = Column(String(128), nullable=True, index=True)
    actor = Column(String(50), nullable=False) # "growth_agent", "buyer_agent", "merchant_admin", "razorpay_webhook"
    action_type = Column(String(100), nullable=False, index=True) # "dynamic_discount_proposed", "order_created", "payment_captured", "guardrail_blocked", "approval_requested"
    
    # Explainability Rationale ("THE BAR")
    reasoning = Column(Text, nullable=False) # Detailed LLM or rule reasoning
    context_data = Column(JSON, default=dict) # Input signals (cart value, customer profile, items)
    decision_payload = Column(JSON, default=dict) # Output (discount applied, product bundle, razorpay order payload)
    
    # Guardrail & Financial Validation
    guardrail_status = Column(String(50), default="PASSED") # "PASSED", "BLOCKED", "GATED_PENDING_APPROVAL", "FAILED_RECOVERED"
    discount_percent_applied = Column(Float, default=0.0)
    financial_impact_inr = Column(Float, default=0.0)
    margin_impact_percent = Column(Float, default=0.0)
    
    # Tamper-evidence. Each record hashes its own contents *and* the hash of the
    # record before it, so the log is a chain: altering or removing any entry
    # breaks every link after it. `sequence` is unique, which is what stops two
    # concurrent writers from both claiming the same position in the chain.
    sequence = Column(Integer, nullable=True, unique=True, index=True)
    previous_hash = Column(String(128), nullable=True)
    verification_hash = Column(String(128), nullable=True)

    # The exact timestamp string that went into the hash, stored verbatim.
    # `created_at` cannot serve here: SQLite drops the timezone on the way back
    # out, so re-deriving the string at verification time would never match.
    recorded_at_iso = Column(String(40), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
