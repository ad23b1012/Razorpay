from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.protocol import PROTOCOL, PROTOCOL_ID, PROTOCOL_VERSION, ALIGNED_WITH
from app.core.razorpay_client import razorpay_service
from app.models.product import Product
from app.config import settings

router = APIRouter(tags=["Agent Protocol Discovery"])


@router.get("/.well-known/agent-commerce.json")
async def agent_commerce_discovery(db: AsyncSession = Depends(get_db)):
    """
    Discovery document for external AI buyers.

    One unauthenticated fetch tells a buying agent everything it needs to
    transact here: where the catalog lives, how to negotiate, what this merchant
    will and will not agree to on its own authority, and which rails settle the
    payment. Publishing the limits up front means a well-behaved agent never has
    to discover them by being refused.
    """
    count_result = await db.execute(
        select(func.count(Product.id)).where(Product.is_active == True)
    )

    return {
        "protocol": PROTOCOL,
        "protocol_id": PROTOCOL_ID,
        "version": PROTOCOL_VERSION,
        "aligned_with": ALIGNED_WITH,
        "merchant": {
            "name": "Aura Tech Store",
            "platform": "RazorAgent",
            "currency": "INR",
            "country": "IN",
        },
        "catalog": {
            "url": "/agent/v1/catalog",
            "item_url_template": "/agent/v1/product/{item_id}",
            "item_count": count_result.scalar() or 0,
            "format": "json",
        },
        "negotiation": {
            "url": "/agent/v1/negotiate",
            "method": "POST",
            "supports_target_budget": True,
            "supports_counter_offers": True,
        },
        "checkout": {
            "create_order_url": "/api/v1/checkout/create-order",
            "verify_payment_url": "/api/v1/checkout/verify-payment",
            "webhook_url": "/api/v1/checkout/webhook",
        },
        "spend_authority": {
            "description": (
                "What an agent may agree to without a human. Anything beyond this is "
                "accepted as a request, held, and answered only after a merchant decides."
            ),
            "max_discount_percent": settings.MAX_GLOBAL_DISCOUNT_PERCENT,
            "per_item_ceiling_field": "negotiable_discount_limit_pct",
            "human_approval_threshold_inr": settings.APPROVAL_GATE_THRESHOLD_INR,
            "never_below_cost": True,
        },
        "payment": {
            "processor": "Razorpay",
            "mode": razorpay_service.mode,
            "methods": ["UPI", "CARD", "NETBANKING", "WALLET"],
            "signature_algorithm": "HMAC-SHA256",
            "signature_message": "{razorpay_order_id}|{razorpay_payment_id}",
        },
        "guarantees": [
            "Every discount is bounded by the tightest applicable policy, never the first one matched.",
            "A discount above the approval threshold creates no order until a human decides.",
            "No payment is captured without a verified signature.",
            "Inventory is reserved atomically, so a confirmed order is never oversold.",
            "Every money decision is written to a queryable audit trail with its reasoning.",
        ],
    }
