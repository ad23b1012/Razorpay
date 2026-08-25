from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.core.audit_trail import verify_audit_chain

router = APIRouter(prefix="/api/v1/audit", tags=["Explainability & Audit Trail"])

@router.get("/logs")
async def get_audit_trail_logs(
    actor: Optional[str] = Query(None),
    guardrail_status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the immutable explainability and audit trail for all agent and financial actions ("THE BAR").
    """
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if actor:
        query = query.where(AuditLog.actor == actor)
    if guardrail_status:
        query = query.where(AuditLog.guardrail_status == guardrail_status)

    result = await db.execute(query)
    logs = result.scalars().all()
    return logs


@router.get("/verify")
async def verify_trail_integrity(
    limit: Optional[int] = Query(None, le=5000),
    db: AsyncSession = Depends(get_db),
):
    """
    Recomputes the audit chain and reports whether it is intact.

    Every record hashes its own contents together with the hash of the record
    before it. Editing a past decision, reordering two records, or deleting one
    from the middle all break the chain, and the response names the first record
    where it breaks — so "tamper-evident" is a claim anyone can check rather than
    one they have to take on faith.
    """
    return await verify_audit_chain(db, limit=limit)
