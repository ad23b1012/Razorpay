import logging
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.campaign import Campaign

logger = logging.getLogger("razoragent.budget")


async def resolve_campaign(db: AsyncSession, category: Optional[str] = None) -> Optional[Campaign]:
    """
    Picks the campaign whose budget funds a discount: the most specific active
    campaign for the category, falling back to an 'All' campaign.
    """
    if category:
        result = await db.execute(
            select(Campaign)
            .where(Campaign.is_active == True, Campaign.target_category == category)
            .limit(1)
        )
        campaign = result.scalar_one_or_none()
        if campaign:
            return campaign

    result = await db.execute(
        select(Campaign).where(Campaign.is_active == True).order_by(Campaign.target_category == "All").limit(1)
    )
    return result.scalar_one_or_none()


async def remaining_budget(db: AsyncSession, category: Optional[str] = None) -> Tuple[Optional[Campaign], Optional[float]]:
    """
    Returns the funding campaign and how much of its budget is left.

    A `None` budget means no campaign is funding this discount, and the budget
    constraint simply does not apply.
    """
    campaign = await resolve_campaign(db, category)
    if not campaign:
        return None, None

    left = max(0.0, (campaign.allocated_budget_inr or 0.0) - (campaign.spent_discount_inr or 0.0))
    return campaign, left


async def record_spend(
    db: AsyncSession,
    campaign: Optional[Campaign],
    discount_inr: float,
    revenue_inr: float = 0.0,
    incremental_inr: float = 0.0,
    converted: bool = False,
) -> None:
    """Draws a granted discount down against its campaign's budget."""
    if not campaign or discount_inr <= 0:
        return

    campaign.spent_discount_inr = (campaign.spent_discount_inr or 0.0) + discount_inr
    campaign.gross_revenue_inr = (campaign.gross_revenue_inr or 0.0) + revenue_inr
    campaign.incremental_revenue_inr = (campaign.incremental_revenue_inr or 0.0) + incremental_inr
    if converted:
        campaign.conversions = (campaign.conversions or 0) + 1

    exhausted = campaign.spent_discount_inr >= (campaign.allocated_budget_inr or 0.0)
    if exhausted:
        logger.warning(
            f"Campaign '{campaign.id}' has exhausted its ₹{campaign.allocated_budget_inr:,.2f} budget; "
            f"further discounts on it will be bounded to zero."
        )


async def record_intervention(db: AsyncSession, campaign: Optional[Campaign], shown: bool = True) -> None:
    """Counts an offer the agent surfaced, for campaign-level conversion reporting."""
    if not campaign:
        return
    campaign.impressions = (campaign.impressions or 0) + 1
    if shown:
        campaign.interventions = (campaign.interventions or 0) + 1
