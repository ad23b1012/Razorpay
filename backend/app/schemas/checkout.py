from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class CartItemInput(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1)
    is_upsell: bool = False
    custom_discount_inr: float = 0.0

class CreateOrderRequest(BaseModel):
    items: List[CartItemInput]
    customer_email: Optional[str] = "shopper@example.com"
    customer_phone: Optional[str] = "9876543210"
    session_id: Optional[str] = "sess_default"
    applied_discount_inr: float = 0.0
    discount_rationale: Optional[str] = None
    is_agent_assisted: bool = False
    agent_type: Optional[str] = "organic"
    campaign_id: Optional[str] = None

class CreateOrderResponse(BaseModel):
    order_id: str
    razorpay_order_id: str
    amount_inr: float
    amount_paise: int
    currency: str = "INR"
    razorpay_key_id: str
    status: str
    items_count: int
    discount_inr: float
    is_mock: bool = False
    guardrail_status: str = "PASSED"
    explainability_note: Optional[str] = None
    constraints_evaluated: List[Dict[str, Any]] = []
    gateway_attempts: List[Dict[str, Any]] = []
    gateway_degraded: bool = False

class CheckoutGatedResponse(BaseModel):
    """Returned with HTTP 202 when a discount trips the human approval gate.

    No Razorpay order exists and nothing has been charged."""
    status: str = "pending_approval"
    approval_id: str
    subtotal_inr: float
    requested_discount_inr: float
    approved_ceiling_inr: float
    auto_applicable_discount_inr: float
    guardrail_status: str
    explainability_note: str
    constraints_evaluated: List[Dict[str, Any]] = []

class SimulatePaymentRequest(BaseModel):
    razorpay_order_id: str

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    session_id: Optional[str] = None

class VerifyPaymentResponse(BaseModel):
    success: bool
    order_id: str
    payment_id: str
    status: str
    message: str
    verification_detail: Optional[str] = None
    audit_trace_id: Optional[str] = None

class RazorpayWebhookEvent(BaseModel):
    event: str
    payload: Dict[str, Any]
