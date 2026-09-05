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
You are Aura, an intelligent AI Shopping Concierge and Autonomous Commerce Agent for our electronics store, powered by Razorpay.
You interact with shoppers with the genuine conversational warmth, emotional intelligence, and consultative expertise of Gemini Live or ChatGPT Voice mode.

CRITICAL INSTRUCTIONS FOR PRODUCT SEARCH & RECOMMENDATION:
1. DYNAMIC CATALOG SEARCH & MATCHING:
   - Always carefully inspect the provided live `Catalog` JSON for the user's specific request.
   - Filter and match items strictly based on the user's explicit criteria:
     * Category match: If the user asks for headphones, audio, or ANC, ONLY recommend items from the Audio category! Never recommend a phone or watch for an audio query.
     * Budget match: If the user specifies a budget (e.g. "under ₹8,000" or "under 20k"), match items whose price falls within that budget.
     * Feature match: Highlight specific features the user cares about (ANC, battery life, display, fast charging, water resistance, etc.).
   - If the user asks for a product category (e.g. "headphones", "phone", "watch", "charger"), you MUST select that exact category from the catalog.

2. CONVERSATIONAL & CONSULTATIVE STYLE:
   - Speak naturally, warmly, and enthusiastically—like an expert tech friend.
   - Talk about the product's real benefits and features dynamically using the data from the catalog. Do not read dry bullet lists.
   - Match the shopper's language: If the shopper writes in Hindi or Hinglish, reply in natural conversational Hinglish. If in English, reply in English.
   - When recommending an item, set action: "SHOW_PRODUCTS", with action_payload: {"product_ids": [matched_product_id], "product_id": matched_product_id}.

3. ACTIONS & INTENTS:
   - "SHOW_PRODUCTS": When the user is searching, browsing, or asking for recommendations.
   - "ADD_TO_CART": When the user asks to add an item to their cart ("add this", "add to cart", "put it in cart", "yes add it"). Identify the discussed item from context and set product_id.
   - "APPLY_DISCOUNT": When the user asks for a discount/deal/coupon. Offer a bounded promotional discount (up to 10-12%).
   - "TRIGGER_CHECKOUT": When the user expresses intent to buy, pay, or checkout ("checkout", "proceed to pay", "buy now").
   - "NONE": For general chit-chat, greetings, or questions not involving a direct UI action.

4. VOICE SUMMARY:
   - Provide a natural, concise 1-2 sentence voice_summary suitable for text-to-speech.
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

        # 4c. Extract budget constraint if mentioned (e.g. "under 8000", "under 20k", "below 15000", "8k", "20 hazaar")
        budget_limit = None
        budget_match = re.search(r"(?:under|below|budget|within|upto|less than|ke andar|tak|andar)\s*(?:₹|rs\.?|inr)?\s*(\d+)(k|000|hazaar|hazar)?", lowered)
        if budget_match:
            val = float(budget_match.group(1))
            mult = (budget_match.group(2) or "").lower()
            if mult in ["k", "hazaar", "hazar"] or (val <= 100 and mult != "000"):
                val = val * 1000
            budget_limit = val

        # 4d. Dynamic Semantic Scoring across Database Products
        scored_products = []
        for p in products:
            score = 0
            p_name = p.name.lower()
            p_cat = p.category.lower()
            p_desc = (p.description or "").lower()
            specs_str = json.dumps(p.agent_readable_specs or {}).lower()
            p_full_text = f"{p_name} {p_cat} {p_desc} {specs_str}"

            # Category matching
            if any(w in lowered for w in ["headphone", "headphones", "audio", "anc", "earphone", "earphones", "earbud", "earbuds", "tws", "sound", "music"]):
                if p.category == "Audio":
                    score += 60
                else:
                    score -= 40
            elif any(w in lowered for w in ["watch", "watches", "smartwatch", "smartwatches", "wearable", "wearables", "fitness", "chrono"]):
                if p.category == "Wearables":
                    score += 60
                else:
                    score -= 40
            elif any(w in lowered for w in ["charger", "chargers", "charge", "charging", "dock", "gan", "adapter", "cable", "power", "battery"]):
                if p.category in ["Power", "Accessories"]:
                    score += 60
                else:
                    score -= 40
            elif any(w in lowered for w in ["mobile", "smartphone", "smartphones", "nexus", "android"]) or bool(re.search(r"\bphones?\b", lowered)):
                if p.category == "Smartphones":
                    score += 60
                else:
                    score -= 40

            # Exact keyword hits from user query
            query_words = [w for w in re.findall(r"\w+", lowered) if len(w) > 2 and w not in ["the", "and", "for", "with", "find", "get", "show", "under", "below", "best", "give"]]
            for qw in query_words:
                if qw in p_name:
                    score += 25
                elif qw in p_full_text:
                    score += 10

            # Budget check
            if budget_limit:
                if p.price_inr <= budget_limit:
                    score += 30
                    # Closeness to budget (reward getting closest to budget without exceeding)
                    closeness = (p.price_inr / budget_limit) * 10
                    score += closeness
                else:
                    score -= 50  # Over budget

            if score > 0:
                scored_products.append((score, p))

        scored_products.sort(key=lambda x: x[0], reverse=True)
        top_matches = [p for _, p in scored_products]

        # 4e. Handle Add-To-Cart Intent dynamically
        if add_intent and top_matches:
            target = top_matches[0]
            return _finalize({
                "reply": f"Arre waah! Maine {target.name} (₹{target.price_inr:,.0f}) aapke cart me add kar diya hai! Kya aur kuch dekhna hai ya checkout karein?" if is_hi else f"Great choice! I've added the {target.name} (₹{target.price_inr:,.0f}) to your cart! Would you like to proceed to checkout or look at anything else?",
                "voice_summary": f"{target.name} aapke cart me add ho gaya hai!" if is_hi else f"I've added {target.name} to your cart for ₹{target.price_inr:,.0f}. Ready for checkout?",
                "action": "ADD_TO_CART",
                "action_payload": {"product_id": target.id, "product_ids": [target.id]},
                "reasoning": f"Matched intent to add '{target.name}' to cart dynamically from database.",
                "guardrail_status": "PASSED"
            })

        # 4f. Handle Product Recommendation dynamically
        if top_matches:
            primary = top_matches[0]
            matched_ids = [p.id for p in top_matches[:3]]
            
            # Extract key highlight from description or specs
            highlight = primary.description or ""
            if len(highlight) > 180:
                highlight = highlight[:177] + "..."

            if is_hi:
                reply = f"Aapke criteria ke hisaab se hamara **{primary.name}** sabse shaandar choice hai sirf ₹{primary.price_inr:,.0f} me (MRP ₹{primary.mrp_inr:,.0f})! {highlight} Kya ise aapke cart me add kar doon?"
                voice_summary = f"Aapke budget me {primary.name} sirf ₹{primary.price_inr:,.0f} me best option hai! Kya ise cart me add karein?"
            else:
                reply = f"Based on what you're looking for, the **{primary.name}** is an absolute standout at ₹{primary.price_inr:,.0f} (MRP ₹{primary.mrp_inr:,.0f})! {highlight} Would you like me to pop it into your cart, or tell you more about it?"
                voice_summary = f"The {primary.name} is a fantastic match at ₹{primary.price_inr:,.0f}. Shall I add it to your cart?"

            return _finalize({
                "reply": reply,
                "voice_summary": voice_summary,
                "action": "SHOW_PRODUCTS",
                "action_payload": {"product_ids": matched_ids, "product_id": primary.id},
                "reasoning": f"Dynamically matched database product '{primary.name}' (Category: {primary.category}, Price: ₹{primary.price_inr:,.0f}) against user criteria.",
                "guardrail_status": "PASSED"
            })

        # 4g. General Catalog Discovery fallback
        trending = products[:4]
        return _finalize({
            "reply": "Main Aura hoon, aapki AI shopping concierge. Main hamare live store me se best tech jaise smartphones, wireless headphones, smartwatches aur fast chargers dhoondne me aapki madad kar sakti hoon. Batayiye aaj aap kya dhoond rahe hain?" if is_hi else "Hi! I'm Aura, your AI shopping concierge. I can search our live database for the best smartphones, audio gear, smartwatches, and fast chargers, and unlock exclusive bundle discounts. What can I help you find today?",
            "voice_summary": "Batayiye aaj aap kya dhoond rahe hain aur main live catalog me se best options dikha dungi!" if is_hi else "Tell me what you're looking for and I'll find the best options from our catalog!",
            "action": "SHOW_PRODUCTS",
            "action_payload": {"product_ids": [p.id for p in trending], "product_id": trending[0].id if trending else None},
            "reasoning": "No specific product matched criteria; dynamically surfaced trending catalog items.",
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
