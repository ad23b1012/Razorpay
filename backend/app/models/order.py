from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(String(64), primary_key=True, index=True) # e.g. "ord_rzp_12345"
    razorpay_order_id = Column(String(128), unique=True, index=True, nullable=True)
    razorpay_payment_id = Column(String(128), nullable=True, index=True)
    razorpay_signature = Column(String(256), nullable=True)
    
    status = Column(String(50), default="created", index=True) # "created", "authorized", "captured", "failed", "refunded"
    currency = Column(String(10), default="INR")
    
    # Financial breakdown (in INR)
    subtotal_inr = Column(Float, nullable=False)
    discount_inr = Column(Float, default=0.0)
    tax_inr = Column(Float, default=0.0)
    total_amount_inr = Column(Float, nullable=False) # Final amount charged via Razorpay

    # Growth & Agent Attribution
    is_agent_assisted = Column(Boolean, default=False)
    agent_type = Column(String(50), nullable=True) # "buyer_conversational", "dynamic_upsell", "recovery_agent", "organic"
    campaign_id = Column(String(64), nullable=True)
    incremental_revenue_inr = Column(Float, default=0.0) # Estimated extra revenue unlocked by agent
    discount_rationale = Column(Text, nullable=True)

    # Customer & Session context
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    session_id = Column(String(128), nullable=True, index=True)

    # Seeded demo history is flagged so it is never passed off as live activity.
    is_seed_data = Column(Boolean, default=False, index=True)

    # Supplied by machine callers so a retried request returns the original order
    # instead of booking a second one. Unique, so the database enforces it even
    # when two retries arrive at once.
    idempotency_key = Column(String(128), nullable=True, unique=True, index=True)

    # Metadata & Items
    order_metadata = Column(JSON, default=dict)
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="selectin")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(String(64), ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(String(64), nullable=False, index=True)
    product_name = Column(String(255), nullable=False)
    quantity = Column(Integer, default=1)
    unit_price_inr = Column(Float, nullable=False)
    total_price_inr = Column(Float, nullable=False)
    is_upsell_item = Column(Boolean, default=False)

    order = relationship("Order", back_populates="items")
