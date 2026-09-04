import hashlib
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.experiment import ExperimentSession

logger = logging.getLogger("razoragent.experiment")

CONTROL = "control"
TREATMENT = "treatment"

# Share of sessions held out with no agent intervention. A holdout costs a little
# revenue and buys the only honest answer to "how much did the agent add?".
HOLDOUT_SHARE = 0.5


def assign_arm(session_id: str) -> str:
    """
    Deterministically assigns a session to an arm.

    Hashing the session id rather than flipping a coin means the same shopper
    always lands in the same arm across requests and restarts, with no state
    needed to make the decision.
    """
    if session_id.startswith("sess_live_"):
        return TREATMENT

    digest = hashlib.sha256(session_id.encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    return CONTROL if bucket < HOLDOUT_SHARE else TREATMENT


async def get_or_enroll(db: AsyncSession, session_id: str) -> ExperimentSession:
    """Returns the session's experiment record, enrolling it on first contact."""
    result = await db.execute(
        select(ExperimentSession).where(ExperimentSession.session_id == session_id)
    )
    enrolled = result.scalar_one_or_none()
    if enrolled:
        return enrolled

    enrolled = ExperimentSession(session_id=session_id, arm=assign_arm(session_id))
    db.add(enrolled)
    await db.flush()
    logger.info(f"Enrolled session {session_id} into the '{enrolled.arm}' arm.")
    return enrolled


async def record_offer_shown(db: AsyncSession, session_id: str) -> None:
    enrolled = await get_or_enroll(db, session_id)
    enrolled.offers_shown = (enrolled.offers_shown or 0) + 1


async def record_offer_accepted(db: AsyncSession, session_id: str) -> None:
    enrolled = await get_or_enroll(db, session_id)
    enrolled.offers_accepted = (enrolled.offers_accepted or 0) + 1


async def record_conversion(
    db: AsyncSession,
    session_id: str,
    revenue_inr: float,
    discount_inr: float = 0.0,
) -> None:
    """Attributes a booked order back to the session's arm."""
    enrolled = await get_or_enroll(db, session_id)
    enrolled.orders_count = (enrolled.orders_count or 0) + 1
    enrolled.revenue_inr = (enrolled.revenue_inr or 0.0) + revenue_inr
    enrolled.discount_inr = (enrolled.discount_inr or 0.0) + discount_inr
