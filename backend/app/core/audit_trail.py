import hashlib
import json
import uuid
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.models.audit_log import AuditLog

logger = logging.getLogger("razoragent.audit")

# The chain's anchor. The first record links to this instead of a predecessor.
GENESIS_HASH = "0" * 64

# Two requests can try to claim the same chain position at once. The unique
# index on `sequence` turns that into an IntegrityError rather than a fork, and
# the loser simply re-reads the tail and tries again.
MAX_APPEND_ATTEMPTS = 5


def _canonical(payload: Any) -> str:
    """Serializes a payload so the same content always hashes identically."""
    return json.dumps(payload or {}, sort_keys=True, separators=(",", ":"), default=str)


def compute_verification_hash(
    sequence: int,
    previous_hash: str,
    log_id: str,
    session_id: Optional[str],
    actor: str,
    action_type: str,
    reasoning: str,
    context_data: Dict[str, Any],
    decision_payload: Dict[str, Any],
    guardrail_status: str,
    discount_percent_applied: float,
    financial_impact_inr: float,
    margin_impact_percent: float,
    timestamp_str: str,
) -> str:
    """
    Hashes a record's full contents together with its predecessor's hash.

    Every field that carries meaning is included — the reasoning, both payloads,
    the guardrail verdict and the money. A hash over only the summary fields
    would let someone rewrite the decision payload of a past discount without
    detection, which defeats the point of keeping the log.
    """
    material = "|".join([
        str(sequence),
        previous_hash,
        log_id,
        str(session_id),
        actor,
        action_type,
        reasoning,
        _canonical(context_data),
        _canonical(decision_payload),
        guardrail_status,
        f"{discount_percent_applied:.4f}",
        f"{financial_impact_inr:.2f}",
        f"{margin_impact_percent:.4f}",
        timestamp_str,
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def _chain_tail(db: AsyncSession) -> Tuple[int, str]:
    """Returns the next free sequence number and the hash it must link to."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.sequence.isnot(None))
        .order_by(AuditLog.sequence.desc())
        .limit(1)
    )
    tail = result.scalar_one_or_none()
    if tail is None:
        return 1, GENESIS_HASH
    return (tail.sequence or 0) + 1, tail.verification_hash or GENESIS_HASH


async def record_audit_log(
    db: AsyncSession,
    actor: str,
    action_type: str,
    reasoning: str,
    context_data: Dict[str, Any],
    decision_payload: Dict[str, Any],
    guardrail_status: str = "PASSED",
    discount_percent_applied: float = 0.0,
    financial_impact_inr: float = 0.0,
    margin_impact_percent: float = 0.0,
    session_id: Optional[str] = None,
) -> AuditLog:
    """
    Appends an explainable record to the tamper-evident audit chain.

    Appending is retried on a sequence collision, so concurrent writers queue up
    behind each other instead of forking the chain.
    """
    log_id = f"aud_{uuid.uuid4().hex[:12]}"
    timestamp_str = datetime.now(timezone.utc).isoformat()

    for attempt in range(1, MAX_APPEND_ATTEMPTS + 1):
        sequence, previous_hash = await _chain_tail(db)

        entry = AuditLog(
            id=log_id,
            sequence=sequence,
            previous_hash=previous_hash,
            session_id=session_id,
            actor=actor,
            action_type=action_type,
            reasoning=reasoning,
            context_data=context_data,
            decision_payload=decision_payload,
            guardrail_status=guardrail_status,
            discount_percent_applied=discount_percent_applied,
            financial_impact_inr=financial_impact_inr,
            margin_impact_percent=margin_impact_percent,
            recorded_at_iso=timestamp_str,
            verification_hash=compute_verification_hash(
                sequence=sequence,
                previous_hash=previous_hash,
                log_id=log_id,
                session_id=session_id,
                actor=actor,
                action_type=action_type,
                reasoning=reasoning,
                context_data=context_data,
                decision_payload=decision_payload,
                guardrail_status=guardrail_status,
                discount_percent_applied=discount_percent_applied,
                financial_impact_inr=financial_impact_inr,
                margin_impact_percent=margin_impact_percent,
                timestamp_str=timestamp_str,
            ),
        )

        try:
            # A savepoint, so losing the race does not poison the caller's
            # transaction — the checkout that triggered this must still commit.
            async with db.begin_nested():
                db.add(entry)
                await db.flush()
        except IntegrityError:
            try:
                db.expunge(entry)
            except Exception:  # noqa: BLE001 - the rollback may already have detached it
                pass
            if attempt == MAX_APPEND_ATTEMPTS:
                logger.error(f"Could not append audit record {log_id} after {attempt} attempts.")
                raise
            logger.debug(f"Audit sequence {sequence} was taken; retrying (attempt {attempt}).")
            continue

        logger.info(
            f"Audit #{sequence} [{log_id}] {action_type} by {actor} (status: {guardrail_status})"
        )
        return entry


async def verify_audit_chain(db: AsyncSession, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Recomputes the whole chain and reports the first place it breaks.

    Three things are checked for every record: that its hash still matches its
    own contents, that it links to its predecessor's hash, and that no sequence
    number is missing. Editing a row, swapping two rows, or deleting one from the
    middle each fail at least one of those.
    """
    query = select(AuditLog).where(AuditLog.sequence.isnot(None)).order_by(AuditLog.sequence.asc())
    if limit:
        query = query.limit(limit)

    result = await db.execute(query)
    records: List[AuditLog] = list(result.scalars().all())

    # Records written before chaining existed carry no sequence. They are counted
    # and excluded rather than quietly reported as verified.
    legacy_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.sequence.is_(None))
    )
    legacy_count = legacy_result.scalar() or 0

    expected_previous = GENESIS_HASH
    expected_sequence = records[0].sequence if records else 1

    for record in records:
        if record.sequence != expected_sequence:
            return _chain_failure(
                record, len(records), legacy_count,
                f"Sequence gap: expected #{expected_sequence} but found #{record.sequence}. "
                f"A record was removed from the chain.",
            )

        if record.previous_hash != expected_previous:
            return _chain_failure(
                record, len(records), legacy_count,
                f"Broken link at #{record.sequence}: it points at a predecessor hash that no "
                f"longer matches the record before it.",
            )

        recomputed = compute_verification_hash(
            sequence=record.sequence,
            previous_hash=record.previous_hash or GENESIS_HASH,
            log_id=record.id,
            session_id=record.session_id,
            actor=record.actor,
            action_type=record.action_type,
            reasoning=record.reasoning,
            context_data=record.context_data,
            decision_payload=record.decision_payload,
            guardrail_status=record.guardrail_status,
            discount_percent_applied=record.discount_percent_applied or 0.0,
            financial_impact_inr=record.financial_impact_inr or 0.0,
            margin_impact_percent=record.margin_impact_percent or 0.0,
            timestamp_str=record.recorded_at_iso or "",
        )

        if recomputed != record.verification_hash:
            return _chain_failure(
                record, len(records), legacy_count,
                f"Contents of #{record.sequence} no longer hash to its stored digest — "
                f"the record was altered after it was written.",
            )

        expected_previous = record.verification_hash
        expected_sequence = record.sequence + 1

    return {
        "valid": True,
        "records_checked": len(records),
        "unchained_legacy_records": legacy_count,
        "head_sequence": records[-1].sequence if records else 0,
        "head_hash": records[-1].verification_hash if records else GENESIS_HASH,
        "detail": (
            (
                f"All {len(records)} chained records verify: every digest matches its contents "
                f"and links to the record before it."
            )
            if records
            else (
                "No chained records yet — the chain starts at genesis. "
                + (
                    f"{legacy_count} record(s) written before chaining was introduced are excluded "
                    "from verification."
                    if legacy_count
                    else "Take any action in the app and it becomes the first link."
                )
            )
        ),
    }


def _chain_failure(record: AuditLog, checked: int, legacy: int, detail: str) -> Dict[str, Any]:
    logger.error(f"Audit chain verification failed at {record.id}: {detail}")
    return {
        "valid": False,
        "records_checked": checked,
        "unchained_legacy_records": legacy,
        "first_broken_record_id": record.id,
        "first_broken_sequence": record.sequence,
        "detail": detail,
    }
