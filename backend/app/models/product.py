from sqlalchemy import Column, Integer, String, Float, Boolean, Text, JSON, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(String(64), primary_key=True, index=True) # e.g. "prod_aura_pro_anc"
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), nullable=False, unique=True)
    category = Column(String(100), nullable=False, index=True) # "Audio", "Wearables", "Power", "Accessories"
    description = Column(Text, nullable=False)
    
    # Financials & Margins (in INR)
    price_inr = Column(Float, nullable=False) # e.g. 7999.00
    cost_price_inr = Column(Float, nullable=False) # e.g. 3500.00
    mrp_inr = Column(Float, nullable=False) # e.g. 12999.00
    
    # Inventory
    stock_quantity = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)
    image_url = Column(String(500), nullable=True)

    # Machine-Readable & Agentic Commerce Specs (UAP / ACP protocol metadata)
    agent_readable_specs = Column(JSON, default=dict) # e.g. {"driver": "40mm Beryllium", "anc_db": 42, "battery_hrs": 38}
    upsell_eligible_product_ids = Column(JSON, default=list) # e.g. ["prod_fast_dock_65w", "prod_travel_case"]
    max_agent_discount_percent = Column(Float, default=15.0) # Maximum discount agent is allowed to negotiate
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
