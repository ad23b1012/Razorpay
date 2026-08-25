import hmac
import hashlib
import time
import uuid
import logging
from typing import Dict, Any, Optional, Tuple, List
import razorpay
from app.config import settings

logger = logging.getLogger("razoragent.razorpay")

# Placeholder key prefixes that indicate no real Razorpay credentials are present.
PLACEHOLDER_KEY_PREFIXES = ("rzp_test_demo", "rzp_test_xxx", "")

# Gateways time out. Orders are retried with backoff before anything gives up,
# and the receipt doubles as the dedupe key so a retry cannot double-book.
MAX_ORDER_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = (0.25, 0.75)


class InjectedGatewayFailure(Exception):
    """Raised by the fault injector so the retry path can be exercised for real."""


class RazorpayService:
    """
    Wraps Razorpay's Orders API and payment-signature verification.

    Two modes, and the difference is always visible to the caller:

      * live test mode — real `rzp_test_*` credentials. Orders are created on
        Razorpay, and payment signatures are verified by Razorpay's own SDK.
      * simulation mode — no credentials configured. Orders are emulated locally
        and marked `is_mock: true`. Signature verification still performs a real
        HMAC-SHA256 check against a locally-minted signature, so the verification
        path is genuinely exercised rather than bypassed.

    There is no branch anywhere that accepts an unverified signature.
    """

    def __init__(self):
        self.key_id = settings.RAZORPAY_KEY_ID or ""
        self.key_secret = settings.RAZORPAY_KEY_SECRET or ""
        self.webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET or ""

        has_real_keys = (
            self.key_id.startswith("rzp_")
            and not self.key_id.startswith(PLACEHOLDER_KEY_PREFIXES[0])
            and len(self.key_secret) >= 16
        )
        self.is_mock_mode = settings.RAZORPAY_MOCK_MODE or not has_real_keys

        self.client = None
        if not self.is_mock_mode:
            try:
                self.client = razorpay.Client(auth=(self.key_id, self.key_secret))
                logger.info(f"Razorpay client initialized in live test mode ({self.key_id}).")
            except Exception as e:
                logger.warning(f"Razorpay client init failed: {e}. Falling back to simulation mode.")
                self.is_mock_mode = True

        if self.is_mock_mode:
            logger.warning(
                "Razorpay running in SIMULATION mode — no live test credentials. "
                "Orders are emulated locally; signatures are still HMAC-verified."
            )

        # Fault injection for the Resilience Lab. Nothing consults this unless a
        # failure has been explicitly armed.
        self._injected_failures = 0
        self._injected_error = ""

    def inject_failures(self, count: int, error: str) -> None:
        """Arms the next `count` order attempts to fail, so the retry path runs for real."""
        self._injected_failures = max(0, count)
        self._injected_error = error

    def _consume_injected_failure(self) -> None:
        if self._injected_failures > 0:
            self._injected_failures -= 1
            raise InjectedGatewayFailure(self._injected_error)

    @property
    def mode(self) -> str:
        return "simulation" if self.is_mock_mode else "razorpay_test_mode"

    def create_order(
        self,
        amount_inr: float,
        currency: str = "INR",
        receipt: Optional[str] = None,
        notes: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Creates an order on Razorpay. Amount is given in INR and sent in paise.
        """
        amount_paise = int(round(amount_inr * 100))
        # The receipt is stable across retries, so a retried call after a timeout
        # is deduplicated by Razorpay rather than creating a second order.
        receipt = receipt or f"rcpt_{uuid.uuid4().hex[:8]}"
        notes = notes or {}

        attempts: List[Dict[str, Any]] = []

        for attempt in range(1, MAX_ORDER_ATTEMPTS + 1):
            started = time.monotonic()
            try:
                self._consume_injected_failure()

                if self.client and not self.is_mock_mode:
                    order_response = self.client.order.create(data={
                        "amount": amount_paise,
                        "currency": currency,
                        "receipt": receipt,
                        "notes": notes,
                        "payment_capture": 1,
                    })
                    result = {
                        "id": order_response.get("id"),
                        "amount": order_response.get("amount"),
                        "currency": order_response.get("currency", "INR"),
                        "receipt": order_response.get("receipt"),
                        "status": order_response.get("status", "created"),
                        "is_mock": False,
                    }
                else:
                    result = {
                        "id": f"order_{uuid.uuid4().hex[:14]}",
                        "amount": amount_paise,
                        "currency": currency,
                        "receipt": receipt,
                        "status": "created",
                        "is_mock": True,
                    }

                attempts.append({
                    "attempt": attempt,
                    "outcome": "succeeded",
                    "elapsed_ms": round((time.monotonic() - started) * 1000, 1),
                })
                result["attempts"] = attempts
                if attempt > 1:
                    logger.info(f"Razorpay order {result['id']} succeeded on attempt {attempt}.")
                return result

            except Exception as e:
                elapsed_ms = round((time.monotonic() - started) * 1000, 1)
                is_last = attempt == MAX_ORDER_ATTEMPTS
                backoff = 0.0 if is_last else RETRY_BACKOFF_SECONDS[min(attempt - 1, len(RETRY_BACKOFF_SECONDS) - 1)]

                attempts.append({
                    "attempt": attempt,
                    "outcome": "failed",
                    "error": str(e),
                    "elapsed_ms": elapsed_ms,
                    "retry_in_ms": round(backoff * 1000, 1) if not is_last else None,
                })
                logger.warning(
                    f"Razorpay order attempt {attempt}/{MAX_ORDER_ATTEMPTS} failed: {e}"
                    + (f"; retrying in {backoff}s" if not is_last else "; no attempts left")
                )

                if is_last:
                    break
                time.sleep(backoff)

        # Every attempt failed. The shopper keeps their cart and their price; the
        # order is emulated locally and flagged so it is never mistaken for a
        # confirmed Razorpay booking.
        logger.error(f"All {MAX_ORDER_ATTEMPTS} Razorpay order attempts failed for receipt {receipt}.")
        return {
            "id": f"order_{uuid.uuid4().hex[:14]}",
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "status": "created",
            "is_mock": True,
            "degraded": True,
            "attempts": attempts,
        }

    def expected_payment_signature(self, razorpay_order_id: str, razorpay_payment_id: str) -> str:
        """
        Razorpay's payment signature: HMAC-SHA256 of "<order_id>|<payment_id>"
        keyed by the API secret.
        """
        msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
        return hmac.new(self.key_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()

    def mint_simulated_payment(self, razorpay_order_id: str) -> Dict[str, str]:
        """
        Simulation mode only: mints a payment id and a correctly-computed signature
        for it, so the offline demo still travels the real verification path.

        Refuses to run when live credentials are configured — a real payment must
        come from Razorpay, never from us.
        """
        if not self.is_mock_mode:
            raise RuntimeError(
                "Simulated payments are disabled while live Razorpay credentials are configured."
            )

        payment_id = f"pay_sim_{uuid.uuid4().hex[:14]}"
        return {
            "razorpay_payment_id": payment_id,
            "razorpay_signature": self.expected_payment_signature(razorpay_order_id, payment_id),
            "simulated": "true",
        }

    def verify_payment_signature(
        self,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> Tuple[bool, str]:
        """
        Verifies a Razorpay payment signature. Returns (is_valid, detail).

        In live mode this defers to Razorpay's own SDK. In simulation mode it runs
        the identical HMAC-SHA256 comparison locally. Neither path has an escape
        hatch for an unsigned or mismatched payment.
        """
        if not (razorpay_order_id and razorpay_payment_id and razorpay_signature):
            return False, "Missing order id, payment id, or signature."

        if self.client and not self.is_mock_mode:
            try:
                self.client.utility.verify_payment_signature({
                    "razorpay_order_id": razorpay_order_id,
                    "razorpay_payment_id": razorpay_payment_id,
                    "razorpay_signature": razorpay_signature,
                })
                return True, "Signature verified by the Razorpay SDK (live test mode)."
            except razorpay.errors.SignatureVerificationError:
                logger.error("Razorpay signature verification failed.")
                return False, "HMAC-SHA256 signature did not match the order and payment id."
            except Exception as e:
                logger.error(f"Error during signature verification: {e}")
                return False, f"Signature verification error: {e}"

        expected = self.expected_payment_signature(razorpay_order_id, razorpay_payment_id)
        if hmac.compare_digest(expected, razorpay_signature):
            return True, "HMAC-SHA256 signature verified locally (simulation mode)."

        return False, "HMAC-SHA256 signature did not match the order and payment id."

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> Tuple[bool, str]:
        """
        Verifies the `X-Razorpay-Signature` header on an inbound webhook:
        HMAC-SHA256 of the raw request body keyed by the webhook secret.
        """
        if not self.webhook_secret:
            return False, "No webhook secret configured; refusing to trust the payload."
        if not signature:
            return False, "Missing X-Razorpay-Signature header."

        expected = hmac.new(
            self.webhook_secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()

        if hmac.compare_digest(expected, signature):
            return True, "Webhook signature verified."
        return False, "Webhook signature mismatch."


razorpay_service = RazorpayService()
