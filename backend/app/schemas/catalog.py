from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict
from app.core.protocol import PROTOCOL

class AgentReadableSpecs(BaseModel):
    driver: Optional[str] = None
    anc_db: Optional[int] = None
    battery_hrs: Optional[int] = None
    connectivity: Optional[str] = None
    compatibility: Optional[List[str]] = None
    power_watts: Optional[int] = None
    warranty_months: Optional[int] = 12

class ProductBase(BaseModel):
    id: str
    name: str
    slug: str
    category: str
    description: str
    price_inr: float
    cost_price_inr: float
    mrp_inr: float
    stock_quantity: int
    is_active: bool = True
    image_url: Optional[str] = None
    agent_readable_specs: Dict[str, Any] = Field(default_factory=dict)
    upsell_eligible_product_ids: List[str] = Field(default_factory=list)
    max_agent_discount_percent: float = 15.0

class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)

class AgentCatalogItem(BaseModel):
    """Machine-readable catalog item for external AI Buyers (UAP / ACP protocol compliant)"""
    item_id: str
    title: str
    category: str
    base_price_inr: float
    available_stock: int
    specs: Dict[str, Any]
    bundle_offers_available: bool
    negotiable_discount_limit_pct: float
    payment_methods_supported: List[str] = ["UPI", "RAZORPAY_CARD", "NETBANKING"]

class AgentCatalogResponse(BaseModel):
    protocol: str = PROTOCOL
    merchant_name: str = "Aura Tech Store (Powered by RazorAgent)"
    currency: str = "INR"
    catalog_version: str = "2026.1"
    item_count: int
    items: List[AgentCatalogItem]
