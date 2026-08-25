from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class ExperimentSession(Base):
    """
    One shopper session enrolled in the growth experiment.

    Uplift is only meaningful against a holdout, so every session is assigned to
    an arm on first contact and stays there. Control sessions are deliberately
    shown no agent offers; the difference in revenue per session between the arms
    is what the Growth Cockpit reports as incremental revenue.
    """
    __tablename__ = "experiment_sessions"

    session_id = Column(String(128), primary_key=True, index=True)
    arm = Column(String(20), nullable=False, index=True)  # "control" | "treatment"

    offers_shown = Column(Integer, default=0)
    offers_accepted = Column(Integer, default=0)
    orders_count = Column(Integer, default=0)
    revenue_inr = Column(Float, default=0.0)
    discount_inr = Column(Float, default=0.0)

    # Seeded history is flagged so the cockpit can state plainly how much of the
    # readout is pre-loaded demo data versus orders placed live.
    is_seed_data = Column(Boolean, default=False, index=True)

    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
