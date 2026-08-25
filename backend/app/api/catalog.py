from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.product import Product
from app.schemas.catalog import ProductOut, AgentCatalogResponse, AgentCatalogItem
from app.core.protocol import PROTOCOL

router = APIRouter(tags=["Catalog"])

@router.get("/api/v1/catalog", response_model=List[ProductOut])
async def get_storefront_catalog(db: AsyncSession = Depends(get_db)):
    """Standard storefront product catalog endpoint."""
    result = await db.execute(select(Product).where(Product.is_active == True))
    return result.scalars().all()

@router.get("/agent/v1/catalog", response_model=AgentCatalogResponse)
async def get_agent_readable_catalog(db: AsyncSession = Depends(get_db)):
    """
    Machine-readable catalog for external AI buyers.

    Shape is documented at /.well-known/agent-commerce.json.
    Allows external AI Buyers to query specs, inventory, and bundle discount bounds.
    """
    result = await db.execute(select(Product).where(Product.is_active == True))
    products = result.scalars().all()
    
    agent_items = [
        AgentCatalogItem(
            item_id=p.id,
            title=p.name,
            category=p.category,
            base_price_inr=p.price_inr,
            available_stock=p.stock_quantity,
            specs=p.agent_readable_specs or {},
            bundle_offers_available=len(p.upsell_eligible_product_ids) > 0,
            negotiable_discount_limit_pct=p.max_agent_discount_percent,
            payment_methods_supported=["UPI", "RAZORPAY_CARD", "NETBANKING"]
        )
        for p in products
    ]

    return AgentCatalogResponse(
        protocol=PROTOCOL,
        merchant_name="Aura Tech Store (Powered by RazorAgent)",
        currency="INR",
        catalog_version="2026.1",
        item_count=len(agent_items),
        items=agent_items
    )

@router.get("/agent/v1/product/{product_id}")
async def get_agent_product_detail(product_id: str, db: AsyncSession = Depends(get_db)):
    """Deep product schema for AI agents evaluating technical specs and compatibility."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {
        "item_id": product.id,
        "name": product.name,
        "category": product.category,
        "price_inr": product.price_inr,
        "mrp_inr": product.mrp_inr,
        "stock": product.stock_quantity,
        "specs": product.agent_readable_specs,
        "bundle_eligible_with": product.upsell_eligible_product_ids,
        "max_discount_pct": product.max_agent_discount_percent,
        "payment_gateway": "RAZORPAY_TEST_MODE"
    }
