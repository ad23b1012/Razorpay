import json
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.product import Product
from app.models.order import Order
from app.models.campaign import Campaign
from app.models.experiment import ExperimentSession
from app.services.experiment import CONTROL, TREATMENT, HOLDOUT_SHARE
from app.services import experiment
from app.services import budget as budget_service
from app.core.guardrails import guardrail_engine
from app.core.audit_trail import record_audit_log
from app.agent.gemini_service import gemini_service

logger = logging.getLogger("razoragent.growth_agent")

GROWTH_SYSTEM_PROMPT = """
You are the RazorAgent Autonomous Merchant Growth Optimizer for Razorpay.
Your goal is to maximize merchant Gross Merchandise Value (GMV), Average Order Value (AOV), and conversion rate by proposing bounded, high-converting dynamic upsells and bundle recommendations.

CONSTRAINTS:
1. Every discount must be strictly bounded (Max 20%).
2. The merchant's net profit margin must remain positive (never sell below cost price).
3. Provide a clear, analytical explainability rationale for every recommendation.
"""

# Constrained-decoding schema. Gemini is held to this shape rather than merely
# asked for JSON, so a malformed reply is a transport failure, not a parse bug.
UPSELL_PROPOSAL_SCHEMA = {
    "type": "object",
    "properties": {
        "recommended_product_id": {"type": "string"},
        "discount_percent": {"type": "number"},
        "pitch": {"type": "string"},
        "rationale": {"type": "string"},
    },
    "required": ["recommended_product_id", "discount_percent", "pitch", "rationale"],
}


class GrowthAgent:
    async def evaluate_dynamic_offer(
        self,
        db: AsyncSession,
        session_id: str,
        cart_items: List[Dict[str, Any]],
        cart_total_inr: float,
        shopper_intent: str = "checkout_view",
    ) -> Dict[str, Any]:
        """
        Observes cart and dynamically generates a personalized, high-converting upsell/cross-sell offer.
        """
        if not cart_items or cart_total_inr <= 0:
            return {
                "offer_available": False,
                "reasoning": "Cart is empty. No intervention required.",
                "guardrail_status": "PASSED"
            }

        # The holdout arm is shown nothing, which is what makes the uplift number
        # in the Growth Cockpit mean anything at all.
        enrolled = await experiment.get_or_enroll(db, session_id)
        if enrolled.arm == CONTROL:
            return {
                "offer_available": False,
                "reasoning": (
                    "Session is in the experiment's control arm and is deliberately shown no "
                    "agent offer. It serves as the baseline the treated arm is measured against."
                ),
                "guardrail_status": "PASSED",
            }

        cart_product_ids = [item.get("product_id") for item in cart_items if item.get("product_id")]
        
        # Fetch cart products
        result = await db.execute(select(Product).where(Product.id.in_(cart_product_ids)))
        cart_prods = result.scalars().all()

        # Find complementary upsell candidates
        candidate_upsell_ids = []
        for p in cart_prods:
            if p.upsell_eligible_product_ids:
                for uid in p.upsell_eligible_product_ids:
                    if uid not in cart_product_ids and uid not in candidate_upsell_ids:
                        candidate_upsell_ids.append(uid)

        # Fallback to accessories if no specific upsell configured
        if not candidate_upsell_ids:
            acc_result = await db.execute(
                select(Product).where(
                    Product.category.in_(["Accessories", "Power"]),
                    Product.id.notin_(cart_product_ids),
                    Product.stock_quantity > 0
                ).limit(2)
            )
            candidate_upsell_ids = [p.id for p in acc_result.scalars().all()]

        if not candidate_upsell_ids:
            return {
                "offer_available": False,
                "reasoning": "No eligible upsell inventory found.",
                "guardrail_status": "PASSED"
            }

        # Fetch every candidate so the model has a real choice to reason over.
        cand_result = await db.execute(
            select(Product).where(
                Product.id.in_(candidate_upsell_ids),
                Product.stock_quantity > 0,
                Product.is_active == True,
            )
        )
        candidates = cand_result.scalars().all()

        if not candidates:
            return {
                "offer_available": False,
                "reasoning": "Candidate products are out of stock or inactive.",
                "guardrail_status": "PASSED"
            }

        proposal = await self._propose_offer(
            cart_products=cart_prods,
            candidates=candidates,
            cart_total_inr=cart_total_inr,
            shopper_intent=shopper_intent,
        )

        rec_product = next(
            (p for p in candidates if p.id == proposal["recommended_product_id"]), candidates[0]
        )

        discount_pct = proposal["discount_percent"]
        original_addon_price = rec_product.price_inr
        proposed_discount_inr = (original_addon_price * discount_pct) / 100.0
        
        # Run through Guardrails Engine ("THE BAR")
        campaign, budget_left = await budget_service.remaining_budget(db, rec_product.category)

        eval_result = guardrail_engine.evaluate_discount(
            original_price_inr=original_addon_price,
            proposed_discount_inr=proposed_discount_inr,
            cart_total_inr=cart_total_inr,
            cost_price_inr=rec_product.cost_price_inr,
            product_max_discount_pct=rec_product.max_agent_discount_percent,
            remaining_budget_inr=budget_left,
        )

        effective_discount = eval_result["effective_discount_inr"]
        discounted_addon_price = original_addon_price - effective_discount
        effective_pct = eval_result["effective_discount_pct"]
        
        total_bundle_before = cart_total_inr + original_addon_price
        total_bundle_after = cart_total_inr + discounted_addon_price

        # Construct analytical explainability note
        reasoning = (
            f"[{proposal['source']}] {proposal['rationale']} "
            f"Cart is ₹{cart_total_inr:,.2f} with intent '{shopper_intent}'. "
            f"Proposed '{rec_product.name}' (MRP ₹{rec_product.mrp_inr:,.2f}) at {discount_pct:.1f}% off; "
            f"bundle price ₹{discounted_addon_price:,.2f} after guardrails "
            f"(saving ₹{effective_discount:,.2f} / {effective_pct:.1f}%). "
            f"Guardrail check: {eval_result['reason']}"
        )

        # Record into Immutable Audit Log
        await record_audit_log(
            db=db,
            actor="growth_agent",
            action_type="dynamic_upsell_generated",
            reasoning=reasoning,
            context_data={
                "session_id": session_id,
                "cart_total_inr": cart_total_inr,
                "shopper_intent": shopper_intent,
                "cart_items": cart_product_ids,
            },
            decision_payload={
                "recommended_product_id": rec_product.id,
                "original_price_inr": original_addon_price,
                "discounted_price_inr": discounted_addon_price,
                "discount_inr": effective_discount,
                "discount_pct": effective_pct,
            },
            guardrail_status=eval_result["status"],
            discount_percent_applied=effective_pct,
            financial_impact_inr=discounted_addon_price,
            session_id=session_id
        )

        if eval_result.get("requires_approval"):
            # Held at the gate: surface the add-on at list price rather than
            # advertising a discount no human has authorized yet.
            return {
                "offer_available": False,
                "reasoning": (
                    f"An upsell on '{rec_product.name}' was withheld pending merchant approval. "
                    f"{eval_result['reason']}"
                ),
                "guardrail_status": eval_result["status"],
                "requires_approval": True,
            }

        await budget_service.record_intervention(db, campaign)
        await experiment.record_offer_shown(db, session_id)

        offer_title = "⚡ Exclusive Bundle Offer Unlocked!"
        if shopper_intent == "exit_intent":
            offer_title = "🔥 Wait! Special 1-Click Checkout Perk"

        return {
            "offer_available": True,
            "offer_id": f"off_{rec_product.id}_{int(effective_pct)}",
            "offer_title": offer_title,
            "offer_description": (
                f"{proposal['pitch']} Yours for ₹{discounted_addon_price:,.0f} "
                f"(save ₹{effective_discount:,.0f} / {effective_pct:.0f}%)."
            ),
            "recommended_product_id": rec_product.id,
            "recommended_product_name": rec_product.name,
            "original_bundle_price_inr": round(total_bundle_before, 2),
            "discounted_bundle_price_inr": round(total_bundle_after, 2),
            "discount_amount_inr": round(effective_discount, 2),
            "discount_percent": round(effective_pct, 1),
            "reasoning": reasoning,
            "guardrail_status": eval_result["status"],
            "requires_approval": eval_result.get("requires_approval", False),
            "campaign_id": campaign.id if campaign else None,
            "reasoning_source": proposal["source"],
        }

    async def _propose_offer(
        self,
        cart_products: List[Product],
        candidates: List[Product],
        cart_total_inr: float,
        shopper_intent: str,
    ) -> Dict[str, Any]:
        """
        Chooses which add-on to pitch and how hard to discount it.

        Gemini does the choosing when a key is configured: it sees the cart, the
        eligible add-ons with their specs, and each item's published negotiation
        ceiling, and returns a structured proposal. The model only ever *proposes* —
        the guardrail engine still binds the number that reaches the shopper, so a
        hallucinated 90% costs the merchant nothing.

        Without a key, a deterministic heuristic stands in and says so.
        """
        fallback = {
            "recommended_product_id": candidates[0].id,
            "discount_percent": 20.0 if shopper_intent == "exit_intent" else 15.0,
            "pitch": f"{candidates[0].name} pairs well with what is already in your cart.",
            "rationale": (
                "Deterministic heuristic: first eligible complementary item, with a higher "
                "urgency discount on exit intent."
            ),
            "source": "heuristic",
        }

        if not gemini_service.is_active:
            return fallback

        payload = {
            "cart": [
                {"id": p.id, "name": p.name, "category": p.category, "price_inr": p.price_inr}
                for p in cart_products
            ],
            "cart_total_inr": cart_total_inr,
            "shopper_intent": shopper_intent,
            "eligible_addons": [
                {
                    "id": p.id,
                    "name": p.name,
                    "category": p.category,
                    "price_inr": p.price_inr,
                    "mrp_inr": p.mrp_inr,
                    "specs": p.agent_readable_specs,
                    "max_negotiable_discount_percent": p.max_agent_discount_percent,
                }
                for p in candidates
            ],
        }

        proposal = await gemini_service.generate_json(
            system_instruction=GROWTH_SYSTEM_PROMPT,
            user_prompt=(
                "Choose exactly one add-on from eligible_addons to offer this shopper, and the "
                "discount percentage that maximises the chance they accept without giving away "
                "more margin than necessary. Never exceed an item's "
                "max_negotiable_discount_percent. Explain the choice in terms of product "
                "compatibility and the shopper's intent.\n\n"
                f"{json.dumps(payload)}"
            ),
            response_schema=UPSELL_PROPOSAL_SCHEMA,
            temperature=0.3,
        )

        if not proposal:
            return fallback

        # Never trust the model's choice unchecked: it must name a real candidate,
        # and its discount is clamped before the guardrail engine even sees it.
        candidate_ids = {p.id for p in candidates}
        product_id = proposal.get("recommended_product_id")
        if product_id not in candidate_ids:
            logger.warning(
                f"Gemini proposed '{product_id}', which is not an eligible add-on. Using the heuristic."
            )
            return fallback

        try:
            discount_pct = float(proposal.get("discount_percent", 0.0))
        except (TypeError, ValueError):
            return fallback

        chosen = next(p for p in candidates if p.id == product_id)
        ceiling = chosen.max_agent_discount_percent or 0.0
        clamped = max(0.0, min(discount_pct, ceiling))

        rationale = str(proposal.get("rationale") or "").strip() or "No rationale supplied."
        if clamped < discount_pct:
            rationale += (
                f" (Model asked for {discount_pct:.1f}%; clamped to this item's published "
                f"{ceiling:.1f}% ceiling before policy evaluation.)"
            )

        return {
            "recommended_product_id": product_id,
            "discount_percent": clamped,
            "pitch": str(proposal.get("pitch") or "").strip() or f"Add {chosen.name} to your order.",
            "rationale": rationale,
            "source": f"gemini:{gemini_service.model_name}",
        }

    async def get_growth_metrics(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Reports the growth experiment's readout. Nothing here is invented.

        Every session is assigned to a control or treatment arm on first contact.
        Control sessions are shown no agent offers. Incremental revenue is the
        difference in revenue *per session* between the arms, applied across the
        treated population — not the total value of agent-touched orders, which
        would credit the agent with revenue that would have arrived anyway.

        With no traffic yet, this returns zeros rather than a plausible-looking
        benchmark.
        """
        result = await db.execute(select(ExperimentSession))
        sessions = result.scalars().all()

        camp_result = await db.execute(
            select(func.count(Campaign.id)).where(Campaign.is_active == True)
        )
        active_campaigns = camp_result.scalar() or 0

        def summarise(arm_sessions: List[ExperimentSession]) -> Dict[str, Any]:
            n = len(arm_sessions)
            orders = sum(s.orders_count or 0 for s in arm_sessions)
            converted = sum(1 for s in arm_sessions if (s.orders_count or 0) > 0)
            revenue = sum(s.revenue_inr or 0.0 for s in arm_sessions)
            discount = sum(s.discount_inr or 0.0 for s in arm_sessions)
            return {
                "sessions": n,
                "orders": orders,
                "converted_sessions": converted,
                "conversion_rate_pct": round(converted / n * 100.0, 2) if n else 0.0,
                "revenue_inr": round(revenue, 2),
                "revenue_per_session_inr": round(revenue / n, 2) if n else 0.0,
                "average_order_value_inr": round(revenue / orders, 2) if orders else 0.0,
                "discount_spend_inr": round(discount, 2),
            }

        control = summarise([s for s in sessions if s.arm == CONTROL])
        treatment = summarise([s for s in sessions if s.arm == TREATMENT])

        # What the treated population would have produced at the control arm's rate.
        baseline_revenue = control["revenue_per_session_inr"] * treatment["sessions"]
        incremental_revenue = treatment["revenue_inr"] - baseline_revenue
        uplift_pct = (incremental_revenue / baseline_revenue * 100.0) if baseline_revenue > 0 else 0.0

        discount_spend = treatment["discount_spend_inr"]
        rodi = (incremental_revenue / discount_spend) if discount_spend > 0 else 0.0

        total_revenue = control["revenue_inr"] + treatment["revenue_inr"]
        total_orders = control["orders"] + treatment["orders"]

        seeded = sum(1 for s in sessions if s.is_seed_data)
        min_arm = min(control["sessions"], treatment["sessions"])

        return {
            "total_revenue_inr": round(total_revenue, 2),
            "baseline_revenue_inr": round(baseline_revenue, 2),
            "incremental_revenue_inr": round(incremental_revenue, 2),
            "revenue_uplift_percent": round(uplift_pct, 1),
            "total_orders_count": total_orders,
            "agent_assisted_orders_count": treatment["orders"],
            "conversion_rate_baseline_pct": control["conversion_rate_pct"],
            "conversion_rate_ai_pct": treatment["conversion_rate_pct"],
            "average_order_value_inr": round(total_revenue / total_orders, 2) if total_orders else 0.0,
            "return_on_discount_spend": round(rodi, 2),
            "recent_interventions_count": sum(s.offers_shown or 0 for s in sessions),
            "active_campaigns_count": active_campaigns,
            "experiment": {
                "design": (
                    f"{int(HOLDOUT_SHARE * 100)}% holdout. Sessions are assigned by a hash of the "
                    f"session id, so an arm is stable across requests. Control sessions receive no "
                    f"agent offers."
                ),
                "control": control,
                "treatment": treatment,
                "incremental_definition": (
                    "revenue_per_session(treatment) - revenue_per_session(control), "
                    "multiplied by treated sessions"
                ),
                "discount_spend_inr": discount_spend,
                "total_sessions": len(sessions),
                "seeded_sessions": seeded,
                "live_sessions": len(sessions) - seeded,
                "min_arm_size": min_arm,
                # Small samples produce loud, meaningless uplift numbers. Say so
                # rather than letting the headline stand unqualified.
                "has_sufficient_power": min_arm >= 30,
                "power_note": (
                    "Sample is adequate for a directional read."
                    if min_arm >= 30
                    else f"Only {min_arm} sessions in the smaller arm — treat the uplift as indicative, not significant."
                ),
            },
        }


growth_agent = GrowthAgent()
