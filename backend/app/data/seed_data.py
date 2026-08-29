import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.product import Product
from app.models.campaign import Campaign
from app.models.policy import GuardrailPolicy
from app.models.order import Order, OrderItem
from app.models.experiment import ExperimentSession
from app.services.experiment import assign_arm, CONTROL, TREATMENT

logger = logging.getLogger("razoragent.seed")

SEED_PRODUCTS = [
    {
        "id": "prod_aura_anc_pro",
        "name": "Aura Pro Wireless ANC Headphones",
        "slug": "aura-pro-anc-headphones",
        "category": "Audio",
        "description": "Flagship over-ear headphones featuring 42dB Hybrid Active Noise Cancellation, custom 40mm Beryllium acoustic drivers, LDAC high-res audio codec, and 38-hour battery with rapid USB-C charging.",
        "price_inr": 7999.00,
        "cost_price_inr": 3400.00,
        "mrp_inr": 12999.00,
        "stock_quantity": 85,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "driver": "40mm Beryllium Dynamic",
            "anc_depth_db": 42,
            "battery_life_hours": 38,
            "bluetooth_version": "5.3 Multi-point",
            "codec_support": ["LDAC", "AAC", "SBC"],
            "weight_grams": 245,
            "fast_charge": "10 min charge gives 5 hrs playback"
        },
        "upsell_eligible_product_ids": ["prod_hard_travel_case", "prod_gan_65w_charger"],
        "max_agent_discount_percent": 15.0
    },
    {
        "id": "prod_nova_chrono",
        "name": "Nova Chrono Titanium Smartwatch",
        "slug": "nova-chrono-smartwatch",
        "category": "Wearables",
        "description": "Premium aerospace-grade titanium smartwatch with 1.43\" Sapphire AMOLED Display, continuous SpO2/ECG cardiac tracking, standalone GPS navigation, 5ATM water resistance, and 14-day battery life.",
        "price_inr": 14999.00,
        "cost_price_inr": 6800.00,
        "mrp_inr": 22999.00,
        "stock_quantity": 42,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "case_material": "Grade 5 Titanium",
            "display": "1.43 inch AMOLED Sapphire Glass (1000 nits)",
            "sensors": ["Dual-frequency GPS", "Optical Bio-Tracker 4.0", "ECG", "Skin Temperature"],
            "waterproof_rating": "5ATM (50 meters)",
            "battery_life_days": 14
        },
        "upsell_eligible_product_ids": ["prod_aura_dock_3in1", "prod_gan_65w_charger"],
        "max_agent_discount_percent": 12.0
    },
    {
        "id": "prod_aura_dock_3in1",
        "name": "Aura MagCharge 3-in-1 Wireless Dock",
        "slug": "aura-magcharge-3in1-dock",
        "category": "Power",
        "description": "Sleek aircraft-grade aluminum magnetic charging stand that simultaneously powers your Phone (15W MagSafe), Smartwatch (5W), and Wireless Earbuds (5W) with intelligent thermal dissipation.",
        "price_inr": 3499.00,
        "cost_price_inr": 1450.00,
        "mrp_inr": 5999.00,
        "stock_quantity": 120,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "total_output_watts": 25,
            "phone_output_watts": 15,
            "watch_output_watts": 5,
            "earbuds_output_watts": 5,
            "material": "Anodized Space Gray Aluminum",
            "safety_certifications": ["Qi-Certified", "FOD Protection", "Over-voltage Shield"]
        },
        "upsell_eligible_product_ids": ["prod_gan_65w_charger"],
        "max_agent_discount_percent": 20.0
    },
    {
        "id": "prod_gan_65w_charger",
        "name": "Apex 65W Dual USB-C GaN Fast Charger",
        "slug": "apex-65w-gan-fast-charger",
        "category": "Power",
        "description": "Ultra-compact Gallium Nitride (GaN III) fast charger with 2x USB-C Power Delivery 3.0 ports and 1x USB-A QC 4.0. Charges laptops, tablets, and phones at peak speed with zero excess heat.",
        "price_inr": 1999.00,
        "cost_price_inr": 820.00,
        "mrp_inr": 3499.00,
        "stock_quantity": 210,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "technology": "Gallium Nitride (GaN III)",
            "max_output_watts": 65,
            "ports": "2x USB-C (PD 3.0 PPS) + 1x USB-A (QC 4.0)",
            "compatibility": ["MacBook Air/Pro", "iPhone 15/16", "Samsung Galaxy", "Pixel", "iPad Pro"]
        },
        "upsell_eligible_product_ids": ["prod_hard_travel_case"],
        "max_agent_discount_percent": 15.0
    },
    {
        "id": "prod_aura_buds_lite",
        "name": "Aura Pods Pro Spatial Earbuds",
        "slug": "aura-pods-pro-earbuds",
        "category": "Audio",
        "description": "True wireless earbuds featuring 3D Spatial Audio with dynamic head tracking, 6-mic beamforming ENC for studio-clear calls, wireless charging case, and IPX5 sweat resistance.",
        "price_inr": 2999.00,
        "cost_price_inr": 1150.00,
        "mrp_inr": 5499.00,
        "stock_quantity": 160,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "spatial_audio": "3D Dynamic Head-Tracking",
            "microphones": "6-Mic Environmental Noise Cancellation (ENC)",
            "water_resistance": "IPX5",
            "total_battery_hrs": 32
        },
        "upsell_eligible_product_ids": ["prod_aura_dock_3in1", "prod_hard_travel_case"],
        "max_agent_discount_percent": 15.0
    },
    {
        "id": "prod_hard_travel_case",
        "name": "Armored Tech Organizer Travel Case",
        "slug": "armored-tech-travel-case",
        "category": "Accessories",
        "description": "Shockproof EVA hardshell organizer case lined with velvet interior and waterproof YKK zippers. Perfectly houses headphones, chargers, cables, and smart accessories during transit.",
        "price_inr": 899.00,
        "cost_price_inr": 280.00,
        "mrp_inr": 1499.00,
        "stock_quantity": 300,
        "is_active": True,
        "image_url": None,  # Frontend renders local category artwork.
        "agent_readable_specs": {
            "material": "High-density EVA + Waterproof Oxford",
            "zipper": "YKK AquaGuard",
            "compartments": ["Headphone cradle", "4x Cable elastic loops", "Powerbank pouch"]
        },
        "upsell_eligible_product_ids": [],
        "max_agent_discount_percent": 25.0
    }
]

async def seed_database_if_empty(db: AsyncSession):
    """Populates the database with initial catalog, campaigns, and guardrail policies."""
    # Check if products exist
    result = await db.execute(select(Product).limit(1))
    if result.scalar_one_or_none() is not None:
        return

    logger.info("Seeding initial catalog, campaigns, and guardrails...")

    # Insert Products
    for p_data in SEED_PRODUCTS:
        product = Product(**p_data)
        db.add(product)

    # Insert Default Campaigns
    camp_audio = Campaign(
        id="cmp_audio_cross_sell",
        name="Audio Ecosystem Bundle Growth",
        description="Autonomously cross-sells MagCharge Dock and Fast Chargers on premium audio checkouts.",
        target_category="Audio",
        strategy="dynamic_upsell",
        allocated_budget_inr=50000.0,
        spent_discount_inr=0.0,
        max_discount_percent=15.0,
        min_order_value_inr=2500.0,
        impressions=0,
        interventions=0,
        conversions=0,
        gross_revenue_inr=0.0,
        incremental_revenue_inr=0.0,
        is_active=True
    )
    db.add(camp_audio)

    camp_exit = Campaign(
        id="cmp_exit_intent_save",
        name="High-Intent Cart Abandonment Saver",
        description="Offers bounded 1-click urgency discount when shopper shows cart exit signals.",
        target_category="All",
        strategy="cart_abandonment",
        allocated_budget_inr=30000.0,
        spent_discount_inr=0.0,
        max_discount_percent=20.0,
        min_order_value_inr=1500.0,
        impressions=0,
        interventions=0,
        conversions=0,
        gross_revenue_inr=0.0,
        incremental_revenue_inr=0.0,
        is_active=True
    )
    db.add(camp_exit)

    # Insert Default Guardrail Policy
    policy = GuardrailPolicy(
        id="pol_default_merchant",
        name="Enterprise Fintech Guardrails Policy",
        description="Razorpay compliant financial safety policy with hard discount ceilings and approval gates.",
        max_global_discount_percent=20.0,
        max_single_item_discount_percent=25.0,
        daily_budget_inr=50000.0,
        spent_today_inr=0.0,
        approval_threshold_inr=5000.0,
        min_cart_value_inr=1500.0,
        prompt_injection_defense_enabled=True,
        require_human_gate_for_high_value=True,
        rate_limit_requests_per_minute=60,
        is_active=True
    )
    db.add(policy)

    await db.commit()
    logger.info("Database seeding complete!")


# ---------------------------------------------------------------------------
# Seeded experiment history
# ---------------------------------------------------------------------------
#
# A live demo generates a handful of sessions, and an A/B readout over five
# sessions is noise. So the database ships with two weeks of prior traffic,
# every row flagged `is_seed_data=True` and reported separately in the cockpit,
# so nobody can mistake it for activity that happened during the demo.
#
# The rates below are deliberately ordinary: the treated arm converts a little
# better and carries a slightly larger basket because of accepted upsells. That
# produces an uplift in the low teens, which is what a working growth agent
# actually looks like.

# Both arms draw baskets from the same distribution, so the only systematic
# difference between them is the agent's behaviour. That means arm size has to
# be large enough that basket-mix noise does not swamp the effect: at a ~3%
# conversion rate, a few hundred sessions yields ~10 orders per arm and an AOV
# that swings by thousands of rupees on a single smartwatch.
SEED_SESSIONS_PER_ARM = 5000
SEED_HISTORY_DAYS = 14

SEED_BEHAVIOUR = {
    CONTROL: {"conversion_rate": 0.032, "upsell_accept_rate": 0.0},
    TREATMENT: {"conversion_rate": 0.0335, "upsell_accept_rate": 0.26},
}

# The agent discounts the add-on it is trying to place, not the whole basket —
# which is exactly what GrowthAgent.evaluate_dynamic_offer does at runtime.
SEED_UPSELL_DISCOUNT_PCT = 18.0


async def seed_experiment_history(db: AsyncSession) -> None:
    """
    Pre-loads two weeks of A/B traffic so the growth readout has statistical
    power on day one. Idempotent: it does nothing once any session exists.
    """
    existing = await db.execute(select(func.count(ExperimentSession.session_id)))
    if (existing.scalar() or 0) > 0:
        return

    product_result = await db.execute(select(Product).where(Product.is_active == True))
    products = product_result.scalars().all()
    if not products:
        return

    # Campaigns that will be credited for the seeded agent activity below,
    # keyed by the category each one targets.
    campaign_result = await db.execute(select(Campaign))
    campaigns = campaign_result.scalars().all()
    campaign_for = {c.target_category: c for c in campaigns}

    # Real storefronts sell far more cheap accessories than flagship items.
    # Weighting inversely to price reproduces that long tail and keeps a single
    # smartwatch sale from dominating an arm's average order value.
    product_weights = [1.0 / max(1.0, p.price_inr) ** 0.5 for p in products]

    logger.info("Seeding two weeks of A/B experiment history...")

    # Fixed seed so the demo shows the same numbers every time it is set up.
    rng = random.Random(20260101)
    now = datetime.now(timezone.utc)
    generated = 0

    for arm in (CONTROL, TREATMENT):
        behaviour = SEED_BEHAVIOUR[arm]

        for _ in range(SEED_SESSIONS_PER_ARM):
            # Keep hunting for an id that hashes into the arm we are filling, so
            # the seeded rows obey the same assignment rule as live traffic.
            while True:
                session_id = f"sess_seed_{uuid.uuid4().hex[:12]}"
                if assign_arm(session_id) == arm:
                    break

            assigned_at = now - timedelta(
                days=rng.uniform(0, SEED_HISTORY_DAYS), hours=rng.uniform(0, 24)
            )
            session = ExperimentSession(
                session_id=session_id,
                arm=arm,
                assigned_at=assigned_at,
                is_seed_data=True,
                offers_shown=rng.randint(1, 3) if arm == TREATMENT else 0,
            )

            if rng.random() < behaviour["conversion_rate"]:
                product = rng.choices(products, weights=product_weights, k=1)[0]
                quantity = 1 if rng.random() < 0.85 else 2
                subtotal = product.price_inr * quantity

                # Treated baskets sometimes carry an accepted upsell line. The
                # discount lands on that line alone, so the base basket is
                # identical in both arms and the arms stay comparable.
                upsell_item = None
                discount = 0.0
                if arm == TREATMENT and rng.random() < behaviour["upsell_accept_rate"]:
                    candidates = [
                        p for p in products
                        if p.id != product.id and (
                            p.id in (product.upsell_eligible_product_ids or [])
                            or p.category in ("Accessories", "Power")
                        )
                    ]
                    if candidates:
                        upsell_item = rng.choice(candidates)
                        subtotal += upsell_item.price_inr
                        discount = round(upsell_item.price_inr * SEED_UPSELL_DISCOUNT_PCT / 100.0, 2)
                        session.offers_accepted = 1

                total = round(subtotal - discount, 2)

                order = Order(
                    id=f"ord_seed_{uuid.uuid4().hex[:10]}",
                    razorpay_order_id=f"order_seed{uuid.uuid4().hex[:12]}",
                    status="captured",
                    currency="INR",
                    subtotal_inr=subtotal,
                    discount_inr=discount,
                    total_amount_inr=total,
                    is_agent_assisted=arm == TREATMENT,
                    agent_type="growth_agent" if arm == TREATMENT else "organic",
                    incremental_revenue_inr=(
                        max(0.0, upsell_item.price_inr - discount) if upsell_item else 0.0
                    ),
                    discount_rationale=(
                        "Seeded history: bounded agent bundle discount"
                        if arm == TREATMENT
                        else "Seeded history: organic checkout"
                    ),
                    session_id=session_id,
                    is_seed_data=True,
                    created_at=assigned_at,
                    order_metadata={"seeded": True, "arm": arm},
                    items=[
                        OrderItem(
                            product_id=product.id,
                            product_name=product.name,
                            quantity=quantity,
                            unit_price_inr=product.price_inr,
                            total_price_inr=product.price_inr * quantity,
                            is_upsell_item=False,
                        )
                    ] + ([
                        OrderItem(
                            product_id=upsell_item.id,
                            product_name=upsell_item.name,
                            quantity=1,
                            unit_price_inr=upsell_item.price_inr,
                            total_price_inr=upsell_item.price_inr,
                            is_upsell_item=True,
                        )
                    ] if upsell_item else []),
                )
                db.add(order)

                # Credit the campaign that would have funded this discount, so
                # the cockpit's campaign figures are derived from the seeded
                # orders rather than being numbers nobody can trace.
                if arm == TREATMENT:
                    # Credited by what the shopper was buying, matching how
                    # GrowthAgent resolves the funding campaign at runtime.
                    funder = campaign_for.get(product.category) or campaign_for.get("All")
                    if funder:
                        funder.impressions = (funder.impressions or 0) + 1
                        if upsell_item:
                            funder.interventions = (funder.interventions or 0) + 1
                            funder.conversions = (funder.conversions or 0) + 1
                            funder.spent_discount_inr = (funder.spent_discount_inr or 0.0) + discount
                            funder.incremental_revenue_inr = (
                                funder.incremental_revenue_inr or 0.0
                            ) + max(0.0, upsell_item.price_inr - discount)
                        funder.gross_revenue_inr = (funder.gross_revenue_inr or 0.0) + total

                session.orders_count = 1
                session.revenue_inr = total
                session.discount_inr = discount
                generated += 1

            db.add(session)

    await db.commit()
    logger.info(
        f"Seeded {SEED_SESSIONS_PER_ARM * 2} sessions and {generated} historical orders "
        f"across both experiment arms."
    )
