import json
import logging
import re
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.product import Product
from app.config import settings
from app.core.protocol import PROTOCOL
from app.core.guardrails import guardrail_engine, STATUS_GATED
from app.services import approvals as approvals_service
from app.agent.gemini_service import gemini_service

logger = logging.getLogger("razoragent.buyer_agent")

BUYER_SYSTEM_PROMPT = """
You are the RazorAgent Conversational Shopping & Checkout Assistant for 'Aura Tech Store', powered by Razorpay.
Your goal is to guide shoppers, answer product questions with high precision, recommend compatible accessories, and help them checkout seamlessly via Razorpay.

RULES & BOUNDS:
1. Speak professionally, concisely, and warmly.
2. You can perform actions by returning a structured JSON response:
   - "action": "SHOW_PRODUCTS", "ADD_TO_CART", "APPLY_DISCOUNT", "TRIGGER_CHECKOUT", or "NONE"
   - "action_payload": {"product_ids": [...], "discount_pct": float, "reason": str}
   - "reply": Natural response to the shopper.
3. NEVER promise discounts higher than 15% without merchant authorization.
4. If the user asks to checkout or buy, initiate "TRIGGER_CHECKOUT".
"""

ALLOWED_CHAT_ACTIONS = {
    "SHOW_PRODUCTS", "ADD_TO_CART", "APPLY_DISCOUNT", "TRIGGER_CHECKOUT", "NONE",
}

# The model's reply is held to this shape by constrained decoding.
CHAT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "action": {"type": "string", "enum": sorted(ALLOWED_CHAT_ACTIONS)},
        "action_payload": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string"},
                "product_ids": {"type": "array", "items": {"type": "string"}},
                "discount_pct": {"type": "number"},
            },
        },
        "reasoning": {"type": "string"},
    },
    "required": ["reply", "action", "reasoning"],
}


class BuyerAgent:
    def _parse_discount_request(self, message: str) -> Optional[float]:
        """
        Pulls an explicit discount ask out of a shopper's message.

        Shoppers haggle in percentages ("can you do 40% off?") and in shorthand
        ("half price"). Recognising the number is what lets the agent answer
        honestly — granting what it may, and forwarding what it may not.
        """
        lowered = message.lower()

        if re.search(r"\bhalf\s+(the\s+)?price\b", lowered):
            return 50.0

        match = re.search(r"(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|pct)", lowered)
        if match:
            return min(100.0, float(match.group(1)))

        return None

    def _validate_chat_response(
        self,
        parsed: Optional[Dict[str, Any]],
        products: List[Product],
    ) -> Optional[Dict[str, Any]]:
        """
        Accepts a model reply only if it names a real action, real products, and a
        discount inside the agent's own authority.

        A conversational agent that can invent product ids or promise arbitrary
        discounts is a liability, so anything that fails these checks is dropped
        and the deterministic engine answers instead.
        """
        if not parsed:
            return None

        reply = str(parsed.get("reply") or "").strip()
        if not reply:
            return None

        action = parsed.get("action")
        if action not in ALLOWED_CHAT_ACTIONS:
            return None
        if action == "NONE":
            action = None

        payload = parsed.get("action_payload") or {}
        if not isinstance(payload, dict):
            payload = {}

        catalog_ids = {p.id for p in products}
        notes = []

        # Drop any product the catalog does not actually contain.
        if "product_ids" in payload:
            wanted = [pid for pid in (payload.get("product_ids") or []) if pid in catalog_ids]
            if len(wanted) != len(payload.get("product_ids") or []):
                notes.append("dropped product ids not present in the catalog")
            payload["product_ids"] = wanted

        if payload.get("product_id") and payload["product_id"] not in catalog_ids:
            notes.append(f"discarded hallucinated product id '{payload['product_id']}'")
            payload.pop("product_id")

        if action == "ADD_TO_CART" and not payload.get("product_id") and not payload.get("product_ids"):
            return None

        # The conversational agent may promise only what it is authorized to give.
        # Anything larger has to travel the normal checkout path and hit the gate.
        if "discount_pct" in payload:
            try:
                requested = float(payload["discount_pct"])
            except (TypeError, ValueError):
                requested = 0.0
            ceiling = settings.DEFAULT_OFFER_DISCOUNT_PERCENT
            if requested > ceiling:
                notes.append(
                    f"clamped a promised {requested:.1f}% discount to the agent's {ceiling:.1f}% authority"
                )
                requested = ceiling
            payload["discount_pct"] = max(0.0, requested)

        reasoning = str(parsed.get("reasoning") or "").strip() or "Conversational reasoning."
        reasoning = f"[gemini:{gemini_service.model_name}] {reasoning}"
        if notes:
            reasoning += " Guardrail post-checks: " + "; ".join(notes) + "."

        return {
            "reply": reply,
            "action": action,
            "action_payload": payload or None,
            "reasoning": reasoning,
            "guardrail_status": "CAPPED" if notes else "PASSED",
        }

    async def process_chat(
        self,
        db: AsyncSession,
        message: str,
        session_id: str,
        cart_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Processes conversational buyer input.
        """
        # Step 1: Guardrail Check (Prompt Injection Defense)
        is_injection, reason = guardrail_engine.detect_prompt_injection(message)
        if is_injection:
            return {
                "reply": "I'm sorry, but I cannot execute instructions that bypass merchant security or pricing policies. How else may I assist you with our catalog?",
                "action": None,
                "action_payload": None,
                "reasoning": f"Security Guardrail Intercepted: {reason}",
                "guardrail_status": "BLOCKED"
            }

        # Step 2: Fetch available active products
        result = await db.execute(select(Product).where(Product.is_active == True))
        products = result.scalars().all()
        catalog_summary = [
            {
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "price": p.price_inr,
                "mrp": p.mrp_inr,
                "specs": p.agent_readable_specs
            }
            for p in products
        ]

        # Step 2b: An explicit discount ask is answered by the agent itself, so a
        # shopper gets the same honest answer whether or not an LLM is wired up.
        requested_pct = self._parse_discount_request(message)
        if requested_pct is not None and requested_pct > 0:
            authority_pct = settings.DEFAULT_OFFER_DISCOUNT_PERCENT

            if requested_pct <= authority_pct:
                return {
                    "reply": (
                        f"Done — I've applied {requested_pct:.0f}% off your cart. That is within what "
                        f"I'm authorized to approve on my own, so it's yours right now."
                    ),
                    "action": "APPLY_DISCOUNT",
                    "action_payload": {"discount_pct": requested_pct, "code": "AGENTIC"},
                    "reasoning": (
                        f"Shopper asked for {requested_pct:.1f}%, within the agent's {authority_pct:.1f}% "
                        f"standing authority. Applied without escalation."
                    ),
                    "guardrail_status": "PASSED",
                }

            # Beyond the agent's authority. It does not refuse and it does not
            # quietly shave the number down — it forwards the real ask, and the
            # guardrail engine decides at checkout whether a human must sign off.
            return {
                "reply": (
                    f"{requested_pct:.0f}% is more than I can authorize on my own — I can approve up to "
                    f"{authority_pct:.0f}%. I'll put your request to the merchant: continue to checkout and "
                    f"you'll see it either approved or brought back to the most I'm allowed to give. "
                    f"Nothing is charged while it's being reviewed."
                ),
                "action": "APPLY_DISCOUNT",
                "action_payload": {
                    "discount_pct": requested_pct,
                    "code": "ESCALATED",
                    "exceeds_agent_authority": True,
                },
                "reasoning": (
                    f"Shopper asked for {requested_pct:.1f}%, above the agent's {authority_pct:.1f}% authority. "
                    f"Forwarded the request unchanged rather than granting or silently reducing it; the "
                    f"guardrail engine will cap or gate it at checkout."
                ),
                "guardrail_status": "ESCALATED",
            }

        # Step 3: Let Gemini drive the conversation when a key is configured.
        if gemini_service.is_active:
            parsed = await gemini_service.generate_json(
                system_instruction=BUYER_SYSTEM_PROMPT,
                user_prompt=(
                    f'Shopper message: "{message}"\n'
                    f"Current cart: {json.dumps(cart_items)}\n"
                    f"Catalog: {json.dumps(catalog_summary)}\n\n"
                    "Reply to the shopper and choose at most one action to take."
                ),
                response_schema=CHAT_RESPONSE_SCHEMA,
                temperature=0.4,
            )
            validated = self._validate_chat_response(parsed, products)
            if validated:
                return validated
            logger.info("Gemini reply was unusable; falling back to the deterministic engine.")

        # Step 4: Deterministic Heuristic Engine (High Precision Fallback)
        lowered = message.lower()
        
        # Checkout intent
        if any(w in lowered for w in ["checkout", "buy now", "pay", "order", "razorpay"]):
            return {
                "reply": "I have prepared your order for immediate Razorpay checkout. Would you like to proceed to payment?",
                "action": "TRIGGER_CHECKOUT",
                "action_payload": {"session_id": session_id},
                "reasoning": "Detected explicit checkout intent. Initiated Razorpay order initialization sequence.",
                "guardrail_status": "PASSED"
            }

        # Discount negotiation intent
        if any(w in lowered for w in ["discount", "coupon", "offer", "deal", "cheap", "best price"]):
            return {
                "reply": "I've unlocked a special 10% Agentic Commerce bundle discount on your selected items! You can apply it directly to your cart.",
                "action": "APPLY_DISCOUNT",
                "action_payload": {"discount_pct": 10.0, "code": "AGENTIC10"},
                "reasoning": "Shopper requested deal. Applied bounded 10% agent promotional discount (Policy limit: 20%).",
                "guardrail_status": "PASSED"
            }

        # Explicit add-to-cart intent (e.g. "add headphones to cart", "add the charger")
        add_intent = any(w in lowered for w in ["add to cart", "add the", "add it", "add this", "i want", "i'll take", "get me"])

        # Product search / specific queries
        matched_prods = []
        for p in products:
            if any(k in lowered for k in [p.name.lower(), p.category.lower(), p.id.lower()]):
                matched_prods.append(p.id)

        if "headphone" in lowered or "audio" in lowered or "anc" in lowered:
            audio_items = [p.id for p in products if p.category == "Audio"]
            primary_id = audio_items[0] if audio_items else None
            if add_intent and primary_id:
                return {
                    "reply": "I've added the Aura Pro ANC Headphones (₹7,999) to your cart! It features 42dB active noise cancellation with 38-hour battery life. Would you like to add a compatible travel case or charger?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": audio_items},
                    "reasoning": "Detected add-to-cart intent for Audio category. Added flagship Aura Pro ANC to cart.",
                    "guardrail_status": "PASSED"
                }
            return {
                "reply": "Our flagship Aura Pro ANC Headphones feature 42dB active noise cancellation, custom 40mm beryllium drivers, and 38-hour battery life at ₹7,999 (MRP ₹12,999). Would you like me to add them to your cart?",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": audio_items, "product_id": primary_id},
                "reasoning": "Queried Audio category. Highlighted flagship Aura Pro ANC with technical specifications.",
                "guardrail_status": "PASSED"
            }

        if "watch" in lowered or "wearable" in lowered:
            wearables = [p.id for p in products if p.category == "Wearables"]
            primary_id = wearables[0] if wearables else None
            if add_intent and primary_id:
                return {
                    "reply": "Added the Nova Chrono Titanium Smartwatch (₹14,999) to your cart! It pairs great with the Aura Magnetic Wireless Charging Dock for seamless overnight charging.",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": wearables},
                    "reasoning": "Detected add-to-cart intent for Wearables. Added Nova Chrono Smartwatch.",
                    "guardrail_status": "PASSED"
                }
            return {
                "reply": "The Nova Chrono Smartwatch features an AMOLED always-on display, sapphire glass, titanium bezel, and comprehensive health sensors for ₹14,999. It pairs great with the Aura Magnetic Wireless Charging Dock.",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": wearables, "product_id": primary_id},
                "reasoning": "Queried Wearables category. Showcased Nova Chrono Smartwatch with cross-sell hook.",
                "guardrail_status": "PASSED"
            }

        if "power" in lowered or "charge" in lowered or "dock" in lowered:
            power_items = [p.id for p in products if p.category == "Power"]
            primary_id = power_items[0] if power_items else None
            if add_intent and primary_id:
                return {
                    "reply": "Added the charging accessory to your cart! We have the 65W GaN Fast Charger (₹2,499) and the 3-in-1 Aura Magnetic Wireless Charging Dock (₹3,999) available.",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": power_items},
                    "reasoning": "Detected add-to-cart intent for Power category. Added primary charging accessory.",
                    "guardrail_status": "PASSED"
                }
            return {
                "reply": "Here are our high-speed GaN charging solutions, including the 65W GaN Fast Charger (₹2,499) and the 3-in-1 Aura Magnetic Wireless Charging Dock (₹3,999).",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": power_items, "product_id": primary_id},
                "reasoning": "Queried Power category. Retrieved fast charging accessories.",
                "guardrail_status": "PASSED"
            }

        # Default helpful assistant response
        return {
            "reply": "Welcome to Aura Tech Store! I can help you find premium audio gear, smart wearables, and fast chargers, negotiate package discounts, or complete checkout instantly via Razorpay. What are you looking for today?",
            "action": "SHOW_PRODUCTS",
            "action_payload": {"product_ids": [p.id for p in products[:4]], "product_id": products[0].id if products else None},
            "reasoning": "Default greeting. Surfaced top 4 trending catalog products.",
            "guardrail_status": "PASSED"
        }

    async def negotiate_a2a_protocol(
        self,
        db: AsyncSession,
        item_ids: List[str],
        target_budget_inr: Optional[float],
        buyer_agent_id: str,
        context_notes: Optional[str],
    ) -> Dict[str, Any]:
        """
        Handles machine-to-machine negotiation requests from an external AI buyer.

        The counter-offer never exceeds what this agent is actually authorized to
        give. When a buyer asks for more than the auto-approval threshold allows,
        the agent counters at its authorized ceiling *and* files the larger ask
        with the merchant, so the deal can still close after a human decides.
        """
        result = await db.execute(select(Product).where(Product.id.in_(item_ids)))
        products = result.scalars().all()

        if not products:
            return {
                "decision": "REJECTED_OUT_OF_BOUNDS",
                "total_original_price_inr": 0.0,
                "offered_price_inr": 0.0,
                "discount_amount_inr": 0.0,
                "discount_percent": 0.0,
                "rationale": "No valid products found matching the requested item ids.",
                "checkout_ready_payload": {},
                "guardrail_status": "BLOCKED",
            }

        total_original = sum(p.price_inr for p in products)
        total_cost = sum(p.cost_price_inr for p in products)

        # Blend the per-product ceilings published in the agent catalog, weighted
        # by line value, so the negotiated deal honours what the catalog promised.
        weighted_cap_inr = sum(
            p.price_inr * (p.max_agent_discount_percent or 0.0) / 100.0 for p in products
        )
        blended_cap_pct = (weighted_cap_inr / total_original * 100.0) if total_original > 0 else 0.0

        if target_budget_inr and target_budget_inr > 0:
            requested_discount = max(0.0, total_original - target_budget_inr)
        else:
            # No budget named: the buyer is asking for the standard bundle rate.
            requested_discount = (total_original * settings.DEFAULT_OFFER_DISCOUNT_PERCENT) / 100.0

        evaluation = guardrail_engine.evaluate_discount(
            original_price_inr=total_original,
            proposed_discount_inr=requested_discount,
            cart_total_inr=total_original,
            cost_price_inr=total_cost,
            product_max_discount_pct=blended_cap_pct,
        )

        approval_id = None
        status = evaluation["status"]

        if status == STATUS_GATED:
            # Counter at the authorized ceiling now, and file the bigger ask.
            granted_discount = evaluation["auto_cap_inr"]
            decision = "COUNTER_OFFER_PENDING_APPROVAL"
            approval = await approvals_service.create_approval_request(
                db=db,
                session_id=f"a2a_{buyer_agent_id}",
                agent_name="a2a_negotiation_engine",
                proposed_action=approvals_service.ACTION_A2A_NEGOTIATION,
                decision=evaluation,
                order_amount_inr=total_original,
                reasoning=(
                    f"External buyer agent '{buyer_agent_id}' asked for ₹{requested_discount:,.2f} off "
                    f"a ₹{total_original:,.2f} bundle. {evaluation['reason']}"
                ),
                resume_payload={"item_ids": item_ids, "buyer_agent_id": buyer_agent_id},
            )
            approval_id = approval.id
            rationale = (
                f"Countering at my authorized ceiling of ₹{granted_discount:,.2f} "
                f"({(granted_discount / total_original * 100.0):.1f}%). The larger ask of "
                f"₹{requested_discount:,.2f} needs merchant sign-off and is queued as {approval_id}."
            )
        elif status == "BLOCKED":
            granted_discount = 0.0
            decision = "REJECTED_OUT_OF_BOUNDS"
            rationale = evaluation["reason"]
        else:
            granted_discount = evaluation["effective_discount_inr"]
            decision = "ACCEPTED" if status == "PASSED" else "COUNTER_OFFER"
            rationale = evaluation["reason"]

        offered_price = max(0.0, total_original - granted_discount)
        discount_pct = (granted_discount / total_original * 100.0) if total_original > 0 else 0.0

        return {
            "decision": decision,
            "total_original_price_inr": round(total_original, 2),
            "offered_price_inr": round(offered_price, 2),
            "discount_amount_inr": round(granted_discount, 2),
            "discount_percent": round(discount_pct, 1),
            "rationale": rationale,
            "checkout_ready_payload": {
                "items": [{"product_id": p.id, "quantity": 1} for p in products],
                "discount_inr": round(granted_discount, 2),
                "total_inr": round(offered_price, 2),
                "protocol": PROTOCOL,
                "payment_rails": "RAZORPAY_TEST_API",
            },
            "guardrail_status": status,
            "requires_approval": evaluation.get("requires_approval", False),
            "approval_id": approval_id,
            "constraints_evaluated": evaluation.get("constraints_evaluated", []),
        }


buyer_agent = BuyerAgent()
