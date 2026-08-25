import uuid
from typing import List, Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.campaign import Campaign
from app.schemas.growth import (
    DynamicOfferRequest,
    DynamicOfferResponse,
    GrowthMetricsResponse,
)
from app.agent.growth_agent import growth_agent

router = APIRouter(prefix="/api/v1/growth", tags=["Merchant Growth"])

@router.post("/dynamic-offer", response_model=DynamicOfferResponse)
async def get_dynamic_upsell_offer(request: DynamicOfferRequest, db: AsyncSession = Depends(get_db)):
    """
    Evaluates customer cart and triggers a real-time, bounded, high-converting dynamic upsell/cross-sell offer.
    """
    offer = await growth_agent.evaluate_dynamic_offer(
        db=db,
        session_id=request.session_id,
        cart_items=request.cart_items,
        cart_total_inr=request.cart_total_inr,
        shopper_intent=request.shopper_intent or "checkout_view"
    )
    return DynamicOfferResponse(**offer)

@router.get("/metrics", response_model=GrowthMetricsResponse)
async def get_merchant_growth_metrics(db: AsyncSession = Depends(get_db)):
    """
    Returns executive metrics comparing Baseline vs AI-Assisted Revenue and Incremental Uplift (₹).
    """
    metrics = await growth_agent.get_growth_metrics(db)
    return GrowthMetricsResponse(**metrics)

@router.get("/campaigns")
async def get_active_campaigns(db: AsyncSession = Depends(get_db)):
    """Fetches all active growth campaigns."""
    result = await db.execute(select(Campaign))
    return result.scalars().all()

@router.post("/campaigns")
async def create_growth_campaign(data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """Creates a new automated growth campaign."""
    camp = Campaign(
        id=f"cmp_{uuid.uuid4().hex[:8]}",
        name=data.get("name", "New Growth Campaign"),
        description=data.get("description", ""),
        target_category=data.get("target_category", "All"),
        strategy=data.get("strategy", "dynamic_upsell"),
        allocated_budget_inr=float(data.get("allocated_budget_inr", 50000.0)),
        max_discount_percent=float(data.get("max_discount_percent", 15.0)),
        min_order_value_inr=float(data.get("min_order_value_inr", 1500.0)),
        is_active=True
    )
    db.add(camp)
    await db.commit()
    await db.refresh(camp)
    return camp
