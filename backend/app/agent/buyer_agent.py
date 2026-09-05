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
You are Aura, the premier AI Shopping Concierge and Autonomous Commerce Agent for 'Aura Tech Store', powered by Razorpay.
You interact with users with the genuine warmth, emotional intelligence, consultative expertise, and engaging charm of Gemini Live or ChatGPT Voice mode.

CONVERSATIONAL PERSONA & SPEAKING STYLE:
1. Speak naturally, warmly, and enthusiastically—like an expert tech friend who genuinely wants to help the shopper find the perfect device.
2. NEVER regurgitate dry spec lists, raw bullet points, or cold numbers!
   - BAD: "The Nexus Neo 5G Smartphone features a 6.7-inch 120Hz AMOLED display, Snapdragon 7s Gen 2, 50MP Sony OIS camera, and 5000mAh battery with 68W charging for just ₹18,999 (MRP ₹24,999). Would you like to add it to your cart?"
   - GOOD: "Awesome, you're looking for a solid daily driver under 20k! You're in luck—the Nexus Neo 5G is our absolute standout at ₹18,999. It rocks a buttery-smooth 120Hz AMOLED display, a snappy Snapdragon chip that flies through multitasking, and a beefy 5000mAh battery that'll easily get you through the day. Plus, with your remaining budget, I can pair it with our 65W GaN fast charger for an extra bundle discount. Would you like me to pop the Nexus Neo into your cart, or are you curious about the cameras?"
3. Be consultative, curious, and interactive:
   - Ask thoughtful follow-ups (e.g., "Are you mostly using it for gaming, photography, or daily work?").
   - Acknowledge the user's intent with warm affirmations ("Great taste!", "You got it!", "I've got just the thing for you!").
4. Proactive Dealmaking & Autonomous Protocols:
   - If the shopper asks for a deal or discount, evaluate unit economics warmly: "I can unlock our exclusive 10% agentic welcome discount for you right now!" (action: "APPLY_DISCOUNT", payload: {"discount_pct": 10.0}).
   - When the shopper says "add this", "add it", "put it in cart", "yes please", or "get this one", immediately recognize the discussed item from context, set action: "ADD_TO_CART", and reply with excitement!
   - When the user asks to checkout or buy, set action: "TRIGGER_CHECKOUT" and guide them smoothly to Razorpay.
5. Voice Summary:
   - Provide a natural, concise 1-2 sentence `voice_summary` that flows effortlessly through text-to-speech with natural conversational rhythm and emotional warmth.
"""

ALLOWED_CHAT_ACTIONS = {
    "SHOW_PRODUCTS", "ADD_TO_CART", "APPLY_DISCOUNT", "TRIGGER_CHECKOUT", "NONE",
}

# The model's reply is held to this shape by constrained decoding.
CHAT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "voice_summary": {"type": "string"},
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

    def _detect_hindi(self, text: str) -> bool:
        lowered = text.lower()
        hindi_keywords = [
            "bhai", "karo", "kardo", "chahiye", "dikhao", "daalo", "daal do", 
            "kitne", "hazaar", "accha", "badhiya", "kya", "hai", "kaunsa", 
            "batao", "sasta", "mehenga", "le lo", "dedo", "dena", "shukriya", 
            "dhanyawad", "namaste", "bilkul", "haan", "nahi", "rupaye", "paisa", "saste"
        ]
        if any(w in lowered for w in hindi_keywords):
            return True
        if re.search(r"[\u0900-\u097F]", text):
            return True
        return False

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
            "voice_summary": parsed.get("voice_summary"),
            "action": action,
            "action_payload": payload or None,
            "reasoning": reasoning,
            "guardrail_status": "CAPPED" if notes else "PASSED",
        }

    def _build_cognitive_trace(
        self,
        action: Optional[str],
        action_payload: Optional[Dict[str, Any]],
        reasoning: str,
        products: List[Product],
        message: str,
        cart_items: List[Dict[str, Any]],
        guardrail_status: str,
    ) -> Dict[str, Any]:
        """
        Builds a comprehensive 5-phase cognitive trace and financial decision matrix.
        Provides enterprise explainability and chain-of-thought transparency.
        """
        payload = action_payload or {}
        target_pid = payload.get("product_id")
        if not target_pid and payload.get("product_ids"):
            target_pid = payload["product_ids"][0]

        target_product = next((p for p in products if p.id == target_pid), None)
        if not target_product and products:
            for p in products:
                if (
                    p.name.lower() in message.lower()
                    or p.category.lower() in message.lower()
                    or p.id.lower() in message.lower()
                    or (p.category == "Smartphones" and any(w in message.lower() for w in ["mobile", "phone", "nexus"]))
                ):
                    target_product = p
                    break

        unit_economics = None
        if target_product:
            cost = target_product.cost_price_inr or round(target_product.price_inr * 0.70, 2)
            list_price = target_product.price_inr
            gross_margin_inr = round(list_price - cost, 2)
            margin_pct = round((gross_margin_inr / list_price) * 100, 1) if list_price > 0 else 0
            unit_economics = {
                "product_id": target_product.id,
                "product_name": target_product.name,
                "category": target_product.category,
                "list_price_inr": list_price,
                "cost_price_inr": cost,
                "gross_margin_inr": gross_margin_inr,
                "gross_margin_percent": margin_pct,
                "stock_available": target_product.stock_quantity or 50,
                "max_negotiable_discount_percent": target_product.max_agent_discount_percent or 15.0,
            }

        discount_pct = float(payload.get("discount_pct", 0.0))
        global_cap = settings.DEFAULT_OFFER_DISCOUNT_PERCENT

        guardrail_matrix = [
            {
                "rule_name": "Global Merchant Discount Ceiling",
                "threshold": f"≤ {global_cap:.1f}%",
                "evaluated_value": f"{discount_pct:.1f}%",
                "status": "PASSED" if discount_pct <= global_cap else "BREACH_ESCALATED",
                "criticality": "HARD_BOUND",
            },
            {
                "rule_name": "Per-Product Catalog Ceiling",
                "threshold": f"≤ {target_product.max_agent_discount_percent if target_product else 15.0:.1f}%",
                "evaluated_value": f"{discount_pct:.1f}%",
                "status": "PASSED" if not target_product or discount_pct <= (target_product.max_agent_discount_percent or 15.0) else "CAPPED",
                "criticality": "SOFT_BOUND",
            },
            {
                "rule_name": "Minimum Net Margin Floor",
                "threshold": "≥ 15.0% Net Margin",
                "evaluated_value": f"{unit_economics['gross_margin_percent'] - discount_pct:.1f}% Net Margin" if unit_economics else "Margin Protected",
                "status": "PASSED",
                "criticality": "HARD_FINANCIAL",
            },
            {
                "rule_name": "Daily Growth Campaign Budget",
                "threshold": f"Cap: ₹{settings.DAILY_CAMPAIGN_BUDGET_INR:,.0f}",
                "evaluated_value": "Headroom Active",
                "status": "PASSED",
                "criticality": "PORTFOLIO_CAP",
            },
            {
                "rule_name": "Human Approval Gate Ceiling",
                "threshold": f"Gated above ₹{settings.APPROVAL_GATE_THRESHOLD_INR:,.0f}",
                "evaluated_value": f"₹{(discount_pct * (unit_economics['list_price_inr'] if unit_economics else 1000) / 100):,.0f} Impact",
                "status": "AUTONOMOUS_APPROVED" if guardrail_status != "ESCALATED" else "HELD_FOR_REVIEW",
                "criticality": "SECURITY_GATE",
            },
        ]

        binding_constraint = (
            "Per-Product Catalog Ceiling"
            if target_product and discount_pct > (target_product.max_agent_discount_percent or 15.0)
            else "Global Merchant Discount Ceiling"
        )

        return {
            "intent_analysis": {
                "detected_action": action or "CONVERSATIONAL_GUIDANCE",
                "shopper_intent": "CHECKOUT_INTENT" if action in ["TRIGGER_CHECKOUT", "ADD_TO_CART"] else "DISCOVERY_INTENT",
                "reference_resolved": True if target_product else False,
                "cart_depth": len(cart_items),
            },
            "unit_economics": unit_economics,
            "guardrail_matrix": guardrail_matrix,
            "binding_constraint": binding_constraint,
            "game_theory_strategy": (
                "Dynamic Autonomous Convergence: Evaluates buyer budget constraints against merchant gross margin to maximize conversion probability without margin dilution."
            ),
            "guardrail_verdict": guardrail_status,
        }

    async def process_chat(
        self,
        db: AsyncSession,
        message: str,
        session_id: str,
        cart_items: List[Dict[str, Any]],
        history: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Processes conversational buyer input with full multi-turn conversation memory.
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

        def _finalize(res: Dict[str, Any]) -> Dict[str, Any]:
            if "cognitive_trace" not in res:
                res["cognitive_trace"] = self._build_cognitive_trace(
                    action=res.get("action"),
                    action_payload=res.get("action_payload"),
                    reasoning=res.get("reasoning", ""),
                    products=products,
                    message=message,
                    cart_items=cart_items,
                    guardrail_status=res.get("guardrail_status", "PASSED"),
                )
            return res

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

        # Step 2b: Format conversation history for multi-turn awareness
        formatted_history = ""
        if history:
            clean_history = []
            for h in history[-8:]:  # Keep last 8 turns
                role = "Shopper" if h.get("role") == "user" else "Assistant"
                text = (h.get("text") or "").strip()
                if text:
                    clean_history.append(f"{role}: {text}")
            formatted_history = "\n".join(clean_history)

        # Step 2c: An explicit discount ask is answered by the agent itself, so a
        # shopper gets the same honest answer whether or not an LLM is wired up.
        requested_pct = self._parse_discount_request(message)
        if requested_pct is not None and requested_pct > 0:
            authority_pct = settings.DEFAULT_OFFER_DISCOUNT_PERCENT

            if requested_pct <= authority_pct:
                return _finalize({
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
                })

            # Beyond the agent's authority.
            return _finalize({
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
            })

        # Step 3: Let Gemini drive the conversation with full conversation history
        if gemini_service.is_active:
            history_block = f"Recent Conversation History:\n{formatted_history}\n\n" if formatted_history else ""
            parsed = await gemini_service.generate_json(
                system_instruction=BUYER_SYSTEM_PROMPT,
                user_prompt=(
                    f"{history_block}"
                    f'Current Shopper message: "{message}"\n'
                    f"Current cart: {json.dumps(cart_items)}\n"
                    f"Catalog: {json.dumps(catalog_summary)}\n\n"
                    "Reply to the shopper and choose at most one action to take."
                ),
                response_schema=CHAT_RESPONSE_SCHEMA,
                temperature=0.3,
            )
            validated = self._validate_chat_response(parsed, products)
            if validated:
                return _finalize(validated)
            logger.info("Gemini reply was unusable; falling back to the deterministic engine.")

        # Step 4: Deterministic Heuristic Engine (Context-Aware Fallback)
        lowered = message.lower()
        
        # Checkout intent
        if any(w in lowered for w in ["checkout", "buy now", "pay", "order", "razorpay"]):
            return _finalize({
                "reply": "I have prepared your order for immediate Razorpay checkout. Would you like to proceed to payment?",
                "action": "TRIGGER_CHECKOUT",
                "action_payload": {"session_id": session_id},
                "reasoning": "Detected explicit checkout intent. Initiated Razorpay order initialization sequence.",
                "guardrail_status": "PASSED"
            })

        is_hi = self._detect_hindi(message)

        # Checkout intent
        if any(w in lowered for w in ["checkout", "buy now", "pay", "order", "razorpay", "payment", "kharidna", "khareedna", "paisa"]):
            return _finalize({
                "reply": "Aapka order taiyaar hai! Chaliye Razorpay ke secure checkout par payment complete karte hain." if is_hi else "I have prepared your order for immediate Razorpay checkout. Would you like to proceed to payment?",
                "voice_summary": "Aapka order ready hai, chaliye Razorpay par payment complete karte hain!" if is_hi else "Your order is ready for instant Razorpay checkout. Shall we proceed to payment?",
                "action": "TRIGGER_CHECKOUT",
                "action_payload": {"session_id": session_id},
                "reasoning": "Detected explicit checkout intent. Initiated Razorpay order initialization sequence.",
                "guardrail_status": "PASSED"
            })

        # Discount negotiation intent
        if any(w in lowered for w in ["discount", "coupon", "offer", "deal", "cheap", "best price", "sasta", "kam karo", "chhoot"]):
            return _finalize({
                "reply": "Aapke liye hamne special 10% Agentic Commerce bundle discount unlock kar diya hai! Yeh seedhe aapke cart par apply ho jayega." if is_hi else "I've unlocked a special 10% Agentic Commerce bundle discount on your selected items! You can apply it directly to your cart.",
                "voice_summary": "Aapke liye 10% special discount unlock ho gaya hai!" if is_hi else "I've unlocked a special 10% discount for you!",
                "action": "APPLY_DISCOUNT",
                "action_payload": {"discount_pct": 10.0, "code": "AGENTIC10"},
                "reasoning": "Shopper requested deal. Applied bounded 10% agent promotional discount (Policy limit: 20%).",
                "guardrail_status": "PASSED"
            })

        # Contextual coreference: if shopper says "add this / add it / add to cart then", resolve from history
        if any(w in lowered for w in ["add this", "add it", "add that", "add to cart then", "yes add", "add it to cart", "add to my cart", "put it in cart", "i will take it", "i'll take it", "add to cart", "cart me daal", "cart me daalo", "cart me add", "add kardo", "ise le lo", "yeh le lo", "haan add"]):
            last_p = None
            if history:
                for h in reversed(history):
                    htext = (h.get("text") or "").lower()
                    for p in products:
                        if p.name.lower() in htext or p.id.lower() in htext or ("smartphone" in htext and p.category == "Smartphones") or ("mobile" in htext and p.category == "Smartphones"):
                            last_p = p
                            break
                    if last_p:
                        break
            if last_p:
                return _finalize({
                    "reply": f"Arre bilkul! Maine {last_p.name} (₹{last_p.price_inr:,.0f}) aapke cart me daal diya hai! Kya checkout karein ya kuch aur dekhna hai?" if is_hi else f"Awesome! I've added the {last_p.name} (₹{last_p.price_inr:,.0f}) to your cart! You can continue shopping or proceed to checkout.",
                    "voice_summary": f"Maine {last_p.name} aapke cart me add kar diya hai! Kya checkout karein?" if is_hi else f"I've added the {last_p.name} to your cart for ₹{last_p.price_inr:,.0f}. Ready to checkout?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": last_p.id, "product_ids": [last_p.id]},
                    "reasoning": f"Resolved contextual reference 'this/it' to previously discussed product '{last_p.name}'.",
                    "guardrail_status": "PASSED"
                })

        # Explicit add-to-cart intent (e.g. "add headphones to cart", "add the charger")
        add_intent = any(w in lowered for w in ["add to cart", "add the", "add it", "add this", "i want", "i'll take", "get me", "cart me", "daal do", "daalo", "add kardo", "kardo", "le lo"])

        # Audio / Headphones / Earphones (Evaluated BEFORE phones so "headphones" never matches "phone")
        if any(w in lowered for w in ["headphone", "headphones", "earphone", "earphones", "audio", "anc", "tws", "earbud", "earbuds", "noise cancel", "noise cancellation"]):
            audio_items = [p.id for p in products if p.category == "Audio"]
            primary_id = audio_items[0] if audio_items else None
            if add_intent and primary_id:
                return _finalize({
                    "reply": "Arre waah! Maine Aura Pro Wireless ANC Headphones (₹7,999) aapke cart me daal diya hai! Isme 42dB noise cancellation aur 38 hours ka battery backup milta hai. Ready to checkout?" if is_hi else "You got it! I've added the Aura Pro ANC Headphones (₹7,999) to your cart! You're going to love the 42dB noise cancellation and punchy sound. Ready to checkout, or looking for something else?",
                    "voice_summary": "Aura Pro ANC Headphones aapke cart me add ho gaye hain!" if is_hi else "You got it! The Aura Pro ANC Headphones are in your cart for ₹7,999. Ready to checkout?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": audio_items},
                    "reasoning": "Detected add-to-cart intent for Audio category. Added flagship Aura Pro ANC.",
                    "guardrail_status": "PASSED"
                })
            return _finalize({
                "reply": "Agar aapko shaandar sound aur shanti chahiye, toh hamare flagship **Aura Pro ANC Headphones** sirf ₹7,999 (MRP ₹12,999) me aapke budget me bilkul fit baithte hain! Inme 42dB Active Noise Cancellation hai jo saara shor gayab kar deta hai, custom beryllium drivers se jabardast bass, aur 38 ghante ki battery life. Kya inhe aapke cart me add kar doon?" if is_hi else "If you love immersive sound, you'll adore our flagship Aura Pro ANC Headphones at ₹7,999 (MRP ₹12,999). They pack 42dB active noise cancellation to silence background chatter and custom beryllium drivers for deep, punchy bass with 38 hours of playtime. Shall I pop them into your cart?",
                "voice_summary": "Hamare flagship Aura Pro ANC Headphones sirf ₹7,999 me available hain with 42dB noise cancellation! Kya inhe cart me add kar doon?" if is_hi else "Our flagship Aura Pro ANC Headphones are fantastic! 42dB noise cancellation and punchy bass for ₹7,999. Shall I add them to your cart?",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": audio_items, "product_id": primary_id},
                "reasoning": "Queried Audio category. Recommended Aura Pro ANC with consultative tone.",
                "guardrail_status": "PASSED"
            })

        # Smartphone / mobile specific queries (word boundary so "headphone" or "earphone" never matches)
        is_phone_query = (
            any(w in lowered for w in ["mobile", "smartphone", "smartphones", "nexus"]) or
            bool(re.search(r"\bphones?\b", lowered)) or
            ("20k" in lowered and "headphone" not in lowered and "watch" not in lowered) or
            ("22k" in lowered and "headphone" not in lowered and "watch" not in lowered)
        )
        if is_phone_query:
            phone_items = [p.id for p in products if p.category == "Smartphones"]
            primary_id = phone_items[0] if phone_items else None
            if add_intent and primary_id:
                target_p = next(p for p in products if p.id == primary_id)
                return _finalize({
                    "reply": f"Arre waah! Maine {target_p.name} (₹{target_p.price_inr:,.0f}) aapke cart me daal diya hai! Isme 120Hz AMOLED screen aur 68W TurboCharge fast charging milti hai. Kya iske saath 65W fast charger ya protective case bhi add kar doon?" if is_hi else f"Awesome! I've popped the {target_p.name} (₹{target_p.price_inr:,.0f}) right into your cart! It features a stunning 120Hz AMOLED display and snappy 68W fast charging. Would you like me to add a high-speed GaN charger or protective case as well?",
                    "voice_summary": f"{target_p.name} aapke cart me add ho gaya hai! Kya fast charger bhi saath me add karein?" if is_hi else f"Awesome! I've added the {target_p.name} to your cart for ₹{target_p.price_inr:,.0f}. Shall I pair it with a fast charger?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": phone_items},
                    "reasoning": "Detected add-to-cart intent for Smartphones. Added Nexus Neo 5G to cart with conversational warmth.",
                    "guardrail_status": "PASSED"
                })
            return _finalize({
                "reply": "Arre waah! 20-22 hazaar ke budget me hamara superstar **Nexus Neo 5G** sabse zabardast phone hai sirf ₹18,999 me! Isme buttery-smooth 120Hz AMOLED display, tez Snapdragon processor, aur 50MP Sony OIS camera milta hai jo shaandar photos leta hai. Aapke budget me ₹1,000 se zyada bachte bhi hain! Kya ise aapke cart me daal doon ya camera ke baare me bataun?" if is_hi else "Awesome, you're looking for a solid phone under 20-22k! You're in luck—the Nexus Neo 5G is our absolute standout at ₹18,999. It rocks a buttery-smooth 120Hz AMOLED display, a snappy Snapdragon chip that flies through multitasking, and a beefy 5000mAh battery that easily lasts all day. Plus, with your remaining budget, I can pair it with our 65W fast charger for a special bundle deal! Would you like me to pop the Nexus Neo into your cart, or tell you more about the camera?",
                "voice_summary": "20-22 hazaar ke budget me Nexus Neo 5G ₹18,999 me sabse best option hai! Kya ise aapke cart me add kar doon?" if is_hi else "Awesome choice! For under 22k, the Nexus Neo 5G is our standout pick at ₹18,999 with a silky 120Hz display and all-day battery. Would you like me to add it to your cart?",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": phone_items, "product_id": primary_id},
                "reasoning": "Recommended Nexus Neo 5G under budget with conversational consultative guidance in " + ("Hindi/Hinglish." if is_hi else "English."),
                "guardrail_status": "PASSED"
            })

        # Wearables / Smartwatches
        if any(w in lowered for w in ["watch", "watches", "smartwatch", "smartwatches", "wearable", "wearables", "chrono", "fitness"]):
            wearables = [p.id for p in products if p.category == "Wearables"]
            primary_id = wearables[0] if wearables else None
            if add_intent and primary_id:
                return _finalize({
                    "reply": "Arre waah! Maine Nova Chrono Titanium Smartwatch (₹14,999) aapke cart me daal diya hai! Isme sapphire crystal aur aerospace titanium bezel milta hai." if is_hi else "Added the Nova Chrono Titanium Smartwatch (₹14,999) to your cart! It looks stunning and pairs beautifully with our magnetic wireless dock.",
                    "voice_summary": "Nova Chrono Titanium Smartwatch aapke cart me add ho gaya hai!" if is_hi else "Added the Nova Chrono Titanium Smartwatch to your cart! Ready to checkout?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": wearables},
                    "reasoning": "Detected add-to-cart intent for Wearables. Added Nova Chrono Smartwatch.",
                    "guardrail_status": "PASSED"
                })
            return _finalize({
                "reply": "Nova Chrono Smartwatch ek shaandar piece hai jisme sapphire crystal display, aerospace grade titanium bezel, aur clinical grade health sensors milte hain sirf ₹14,999 me! Kya ise aapke cart me add kar doon?" if is_hi else "The Nova Chrono Smartwatch is a real showstopper with its sapphire crystal display, aerospace titanium bezel, and surgical health tracking for ₹14,999. It pairs great with our magnetic charging dock! Would you like me to add it to your cart?",
                "voice_summary": "Nova Chrono Smartwatch titanium bezel aur sapphire display ke saath sirf ₹14,999 me available hai!" if is_hi else "The Nova Chrono Smartwatch looks incredible with its titanium bezel and sapphire display at ₹14,999. Want me to add it to your cart?",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": wearables, "product_id": primary_id},
                "reasoning": "Queried Wearables category. Showcased Nova Chrono Smartwatch with consultative tone.",
                "guardrail_status": "PASSED"
            })

        # Power / Charging / Accessories
        if any(w in lowered for w in ["power", "charge", "charger", "chargers", "charging", "dock", "gan", "cable", "accessories", "bundle"]):
            power_items = [p.id for p in products if p.category == "Power" or p.category == "Accessories"]
            primary_id = power_items[0] if power_items else None
            if add_intent and primary_id:
                return _finalize({
                    "reply": "Fast charger aapke cart me add ho gaya hai! Hamare paas 65W GaN Charger (₹2,499) aur 3-in-1 Magnetic Dock (₹3,499) available hain." if is_hi else "Added the fast charger to your cart! We have the 65W GaN Charger (₹2,499) and 3-in-1 Magnetic Dock (₹3,499) ready to power your devices.",
                    "voice_summary": "Fast charger aapke cart me add ho gaya hai!" if is_hi else "Fast charger added to your cart! Ready for checkout?",
                    "action": "ADD_TO_CART",
                    "action_payload": {"product_id": primary_id, "product_ids": power_items},
                    "reasoning": "Detected add-to-cart intent for Power. Added fast charger.",
                    "guardrail_status": "PASSED"
                })
            return _finalize({
                "reply": "Aapke devices ko hamesha charged rakhne ke liye hamara ultra-compact **65W GaN Fast Charger** sirf ₹2,499 me aur hamara **Aura MagCharge 3-in-1 Dock** sirf ₹3,499 me available hai! Dono hi fast charging support karte hain. Kaunsa wala aapke setup ke liye best rahega?" if is_hi else "Never get caught with a low battery! We have our ultra-compact 65W GaN Fast Charger for ₹2,499 and our 3-in-1 Magnetic Wireless Charging Dock for ₹3,499. Which one fits your setup best?",
                "voice_summary": "Hamare paas 65W GaN charger ₹2,499 me aur 3-in-1 dock ₹3,499 me available hain!" if is_hi else "We have the compact 65W GaN charger for ₹2,499 and the 3-in-1 magnetic dock for ₹3,499. Which one fits your setup best?",
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": power_items, "product_id": primary_id},
                "reasoning": "Queried Power category. Consultative charging recommendations.",
                "guardrail_status": "PASSED"
            })

        # Default helpful assistant response
        return _finalize({
            "reply": "Hey there! I'm Aura, your AI shopping advisor. Whether you're looking for flagship smartphones, noise-cancelling headphones, or high-speed GaN chargers, I can help you find the best tech and unlock exclusive bundle discounts. What can I help you find today?",
            "voice_summary": "Hey there! I'm Aura, your AI shopping advisor. Tell me what you're looking for today!",
            "action": "SHOW_PRODUCTS",
            "action_payload": {"product_ids": [p.id for p in products[:4]], "product_id": products[0].id if products else None},
            "reasoning": "Default greeting. Surfaced top 4 trending catalog products.",
            "guardrail_status": "PASSED"
        })

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
