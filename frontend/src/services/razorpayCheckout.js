/**
 * Loads Razorpay's own Checkout script and opens the real payment modal.
 *
 * Nothing here draws a Razorpay-looking UI: when live test credentials are
 * configured, the modal the shopper sees is Razorpay's, served by Razorpay.
 */

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise = null;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    const script = existing || document.createElement("script");

    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Razorpay Checkout. Check your network connection."));
    };

    if (!existing) document.body.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Opens Razorpay Standard Checkout for an order created by our backend.
 *
 * Resolves with the payment handler payload (order id, payment id, signature),
 * which the caller must send to /verify-payment — the signature is only
 * trustworthy once the server has verified it.
 */
export function openRazorpayCheckout({ orderData, customer, onDismiss }) {
  return loadRazorpayCheckout().then(
    (Razorpay) =>
      new Promise((resolve, reject) => {
        const rzp = new Razorpay({
          key: orderData.razorpay_key_id,
          amount: orderData.amount_paise,
          currency: orderData.currency || "INR",
          order_id: orderData.razorpay_order_id,
          name: "Aura Tech Store",
          description: `Order ${orderData.order_id}`,
          prefill: {
            email: customer?.email || "",
            contact: customer?.phone || "",
          },
          notes: { order_id: orderData.order_id },
          theme: { color: "#0C83FE" },
          handler: (response) => resolve(response),
          modal: {
            ondismiss: () => {
              onDismiss?.();
              reject(new Error("Payment cancelled."));
            },
          },
        });

        rzp.on("payment.failed", (response) => {
          reject(new Error(response?.error?.description || "Payment failed at the gateway."));
        });

        rzp.open();
      })
  );
}
