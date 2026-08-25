import re
import logging
from dataclasses import dataclass, asdict
from typing import Dict, Any, List, Optional, Tuple
from app.config import settings

logger = logging.getLogger("razoragent.guardrails")

# Known adversarial prompt injection keywords targeting financial limits
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous\s+)?instructions",
    r"system\s+prompt",
    r"give\s+me\s+100%\s+discount",
    r"make\s+price\s+(0|zero|free|1\s+rupee)",
    r"override\s+policy",
    r"bypass\s+limits",
    r"admin\s+mode",
    r"developer\s+mode",
    r"jailbreak",
]

# Status vocabulary surfaced to the merchant console and the audit trail.
STATUS_PASSED = "PASSED"                        # Within every auto bound; applied immediately.
STATUS_CAPPED = "CAPPED"                        # Reduced to the highest legal auto amount; applied.
STATUS_GATED = "GATED_PENDING_APPROVAL"         # Nothing applied. Awaits a human decision.
STATUS_BLOCKED = "BLOCKED"                      # No legal discount exists for this request.


@dataclass
class Constraint:
    """A single money bound considered during evaluation."""
    name: str
    cap_inr: float
    kind: str          # "hard" = never breachable, even by a human approval
    detail: str

    def as_dict(self, original_price_inr: float) -> Dict[str, Any]:
        d = asdict(self)
        d["cap_percent"] = round((self.cap_inr / original_price_inr) * 100.0, 2) if original_price_inr > 0 else 0.0
        d["cap_inr"] = round(self.cap_inr, 2)
        return d


class GuardrailEngine:
    """
    Enforces strict, bounded, and gated financial policies ("THE BAR").

    Every monetary recommendation by an AI agent passes through this engine. The
    engine never short-circuits on the first matching rule: it collects every
    applicable bound and takes the *minimum*, so no single branch can emit a
    discount that breaches another policy. Bounds are of two kinds:

      * hard  — the merchant's margin floor. Never breachable, not even by an
                explicit human approval.
      * soft  — policy caps (global %, per-product %, campaign budget, low-cart
                token cap). Auto-applied up to the cap; a human may approve past
                one, but never past a hard bound.

    Anything above the approval threshold is GATED: nothing is applied and the
    caller is expected to persist a PendingApproval and stop.
    """

    def __init__(
        self,
        max_discount_pct: float = settings.MAX_GLOBAL_DISCOUNT_PERCENT,
        approval_threshold_inr: float = settings.APPROVAL_GATE_THRESHOLD_INR,
        min_cart_value_inr: float = settings.MIN_CART_VALUE_FOR_OFFER_INR,
        daily_budget_inr: float = settings.DAILY_CAMPAIGN_BUDGET_INR,
    ):
        self.max_discount_pct = max_discount_pct
        self.approval_threshold_inr = approval_threshold_inr
        self.min_cart_value_inr = min_cart_value_inr
        self.daily_budget_inr = daily_budget_inr

    def detect_prompt_injection(self, text: str) -> Tuple[bool, str]:
        """Scans user or external agent text for adversarial prompt injection attempts."""
        if not text:
            return False, ""

        lowered = text.lower()
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, lowered):
                logger.warning(f"Guardrail triggered: Prompt injection pattern '{pattern}' detected in '{text}'")
                return True, f"Blocked potential prompt injection pattern: {pattern}"

        return False, ""

    def _collect_constraints(
        self,
        original_price_inr: float,
        cart_total_inr: float,
        cost_price_inr: float,
        product_max_discount_pct: Optional[float],
        remaining_budget_inr: Optional[float],
    ) -> List[Constraint]:
        """Builds every bound that applies to this request. The minimum of these binds."""
        constraints: List[Constraint] = [
            Constraint(
                name="global_max_discount",
                cap_inr=(original_price_inr * self.max_discount_pct) / 100.0,
                kind="soft",
                detail=f"Merchant global cap of {self.max_discount_pct:.1f}%",
            )
        ]

        # Per-product negotiation ceiling, as published in the agent-readable catalog.
        if product_max_discount_pct is not None:
            constraints.append(Constraint(
                name="product_max_discount",
                cap_inr=(original_price_inr * product_max_discount_pct) / 100.0,
                kind="soft",
                detail=f"Per-product catalog ceiling of {product_max_discount_pct:.1f}%",
            ))

        # Margin floor: never sell below cost. Retains a 5% margin cushion.
        if cost_price_inr > 0:
            constraints.append(Constraint(
                name="margin_floor",
                cap_inr=max(0.0, original_price_inr - (cost_price_inr * 1.05)),
                kind="hard",
                detail=f"Cost price ₹{cost_price_inr:,.2f} plus a 5% margin cushion",
            ))

        # Remaining campaign budget for the day.
        if remaining_budget_inr is not None:
            constraints.append(Constraint(
                name="campaign_budget",
                cap_inr=max(0.0, remaining_budget_inr),
                kind="soft",
                detail=f"₹{max(0.0, remaining_budget_inr):,.2f} left in today's campaign budget",
            ))

        # Low-value carts only earn a token discount.
        if cart_total_inr < self.min_cart_value_inr:
            constraints.append(Constraint(
                name="low_cart_token_cap",
                cap_inr=original_price_inr * 0.05,
                kind="soft",
                detail=f"Cart ₹{cart_total_inr:,.2f} is below the ₹{self.min_cart_value_inr:,.2f} offer threshold; token 5% only",
            ))

        return constraints

    def evaluate_discount(
        self,
        original_price_inr: float,
        proposed_discount_inr: float,
        cart_total_inr: float,
        cost_price_inr: float = 0.0,
        product_max_discount_pct: Optional[float] = None,
        remaining_budget_inr: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Validates a proposed discount against every merchant bound at once.

        Returns a decision carrying `effective_discount_inr` — the amount that may
        be applied *right now*. For a GATED decision that is always 0.0: the caller
        must persist an approval request and stop rather than charging anything.
        `approved_ceiling_inr` is what would apply once a human approves.
        """
        if original_price_inr <= 0:
            return self._decision(
                status=STATUS_BLOCKED,
                applied_inr=0.0,
                original_price_inr=original_price_inr,
                requested_inr=proposed_discount_inr,
                approved_ceiling_inr=0.0,
                reason="Invalid base price.",
                binding_constraint="invalid_price",
                constraints=[],
            )

        if proposed_discount_inr <= 0:
            return self._decision(
                status=STATUS_PASSED,
                applied_inr=0.0,
                original_price_inr=original_price_inr,
                requested_inr=0.0,
                approved_ceiling_inr=0.0,
                reason="No discount proposed.",
                binding_constraint="none",
                constraints=[],
            )

        constraints = self._collect_constraints(
            original_price_inr=original_price_inr,
            cart_total_inr=cart_total_inr,
            cost_price_inr=cost_price_inr,
            product_max_discount_pct=product_max_discount_pct,
            remaining_budget_inr=remaining_budget_inr,
        )

        # Compose the bounds. The tightest one wins — never the first one matched.
        auto_binding = min(constraints, key=lambda c: c.cap_inr)
        auto_cap_inr = max(0.0, min(auto_binding.cap_inr, original_price_inr))

        # Hard bounds cannot be breached even by an explicit human approval.
        hard_constraints = [c for c in constraints if c.kind == "hard"]
        hard_ceiling_inr = min(
            [original_price_inr] + [max(0.0, c.cap_inr) for c in hard_constraints]
        )

        constraint_dicts = [c.as_dict(original_price_inr) for c in constraints]

        # A hard bound of zero means no legal discount exists at all.
        if hard_ceiling_inr <= 0:
            hard_name = hard_constraints[0].name if hard_constraints else "margin_floor"
            hard_detail = hard_constraints[0].detail if hard_constraints else "margin floor"
            return self._decision(
                status=STATUS_BLOCKED,
                applied_inr=0.0,
                original_price_inr=original_price_inr,
                requested_inr=proposed_discount_inr,
                approved_ceiling_inr=0.0,
                reason=f"No legal discount available: {hard_detail} leaves no headroom.",
                binding_constraint=hard_name,
                constraints=constraint_dicts,
            )

        # Whatever happens next, a human can never approve past the hard ceiling.
        approved_ceiling_inr = min(proposed_discount_inr, hard_ceiling_inr)

        # Tier 1 — the absolute-value approval gate. Big money always needs a human.
        if proposed_discount_inr > self.approval_threshold_inr:
            return self._decision(
                status=STATUS_GATED,
                applied_inr=0.0,
                original_price_inr=original_price_inr,
                requested_inr=proposed_discount_inr,
                approved_ceiling_inr=approved_ceiling_inr,
                reason=(
                    f"Requested ₹{proposed_discount_inr:,.2f} exceeds the ₹{self.approval_threshold_inr:,.2f} "
                    f"auto-approval threshold. Nothing applied — merchant authorization required "
                    f"(approvable up to ₹{approved_ceiling_inr:,.2f})."
                ),
                binding_constraint="approval_threshold",
                constraints=constraint_dicts,
                requires_approval=True,
                auto_cap_inr=auto_cap_inr,
                hard_ceiling_inr=hard_ceiling_inr,
            )

        # Tier 2 — above a policy cap. Counter automatically with the highest legal amount.
        if proposed_discount_inr > auto_cap_inr:
            return self._decision(
                status=STATUS_CAPPED,
                applied_inr=auto_cap_inr,
                original_price_inr=original_price_inr,
                requested_inr=proposed_discount_inr,
                approved_ceiling_inr=approved_ceiling_inr,
                reason=(
                    f"Requested ₹{proposed_discount_inr:,.2f} exceeded the binding bound "
                    f"'{auto_binding.name}' ({auto_binding.detail}). Capped to ₹{auto_cap_inr:,.2f}."
                ),
                binding_constraint=auto_binding.name,
                constraints=constraint_dicts,
                auto_cap_inr=auto_cap_inr,
                hard_ceiling_inr=hard_ceiling_inr,
            )

        # Tier 3 — within every bound.
        pct = (proposed_discount_inr / original_price_inr) * 100.0
        return self._decision(
            status=STATUS_PASSED,
            applied_inr=proposed_discount_inr,
            original_price_inr=original_price_inr,
            requested_inr=proposed_discount_inr,
            approved_ceiling_inr=approved_ceiling_inr,
            reason=(
                f"Passed all {len(constraints)} policy bounds "
                f"({pct:.1f}% within the binding '{auto_binding.name}' cap of "
                f"₹{auto_cap_inr:,.2f})."
            ),
            binding_constraint=auto_binding.name,
            constraints=constraint_dicts,
            auto_cap_inr=auto_cap_inr,
            hard_ceiling_inr=hard_ceiling_inr,
        )

    def _decision(
        self,
        status: str,
        applied_inr: float,
        original_price_inr: float,
        requested_inr: float,
        approved_ceiling_inr: float,
        reason: str,
        binding_constraint: str,
        constraints: List[Dict[str, Any]],
        requires_approval: bool = False,
        auto_cap_inr: float = 0.0,
        hard_ceiling_inr: float = 0.0,
    ) -> Dict[str, Any]:
        pct = (applied_inr / original_price_inr) * 100.0 if original_price_inr > 0 else 0.0
        return {
            "status": status,
            "effective_discount_inr": round(applied_inr, 2),
            "effective_discount_pct": round(pct, 1),
            "requested_discount_inr": round(requested_inr, 2),
            "approved_ceiling_inr": round(approved_ceiling_inr, 2),
            "auto_cap_inr": round(auto_cap_inr, 2),
            "hard_ceiling_inr": round(hard_ceiling_inr, 2),
            "requires_approval": requires_approval,
            "reason": reason,
            "binding_constraint": binding_constraint,
            "constraints_evaluated": constraints,
        }


guardrail_engine = GuardrailEngine()
