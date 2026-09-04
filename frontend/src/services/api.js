const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export const FALLBACK_CATALOG = [
  {
    id: "prod_nexus_neo_5g",
    name: "Nexus Neo 5G Smartphone (8GB/256GB)",
    slug: "nexus-neo-5g",
    category: "Smartphones",
    description: "Flagship-tier 5G smartphone featuring a 6.7-inch 120Hz AMOLED display, Snapdragon 7s Gen 2, 50MP Sony IMX882 OIS camera, and 68W TurboCharging.",
    price_inr: 18999.0,
    cost_price_inr: 13500.0,
    mrp_inr: 24999.0,
    stock_quantity: 43,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      screen: "6.7-inch 120Hz FHD+ AMOLED",
      processor: "Qualcomm Snapdragon 7s Gen 2",
      ram_storage: "8GB LPDDR4X / 256GB UFS 2.2",
      camera: "50MP Sony IMX882 OIS + 8MP Ultrawide",
      battery: "5000mAh with 68W TurboCharging"
    },
    upsell_eligible_product_ids: ["prod_gan_65w_charger", "prod_braided_usbc_cable"],
    max_agent_discount_percent: 12.0
  },
  {
    id: "prod_aura_dock_3in1",
    name: "Aura MagCharge 3-in-1 Wireless Dock",
    slug: "aura-magcharge-3in1-dock",
    category: "Power",
    description: "Sleek aircraft-grade aluminum magnetic charging stand that simultaneously powers your Phone (15W MagSafe), Smartwatch (5W), and Wireless Earbuds (5W) with intelligent thermal dissipation.",
    price_inr: 3499.0,
    cost_price_inr: 1450.0,
    mrp_inr: 5999.0,
    stock_quantity: 120,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      total_output_watts: 25,
      phone_output_watts: 15,
      watch_output_watts: 5,
      earbuds_output_watts: 5,
      material: "Anodized Space Gray Aluminum"
    },
    upsell_eligible_product_ids: ["prod_gan_65w_charger"],
    max_agent_discount_percent: 20.0
  },
  {
    id: "prod_aura_buds_lite",
    name: "Aura Buds Lite TWS",
    slug: "aura-buds-lite",
    category: "Audio",
    description: "Ultra-low latency 38ms gaming & everyday true wireless earbuds with 10mm titanium dynamic drivers, environmental noise cancellation (ENC), and 32-hour playback.",
    price_inr: 1499.0,
    cost_price_inr: 650.0,
    mrp_inr: 2999.0,
    stock_quantity: 85,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      battery_life_hours: 32,
      latency_ms: 38,
      driver_size_mm: 10,
      bluetooth_version: "5.3"
    },
    upsell_eligible_product_ids: ["prod_braided_usbc_cable"],
    max_agent_discount_percent: 15.0
  },
  {
    id: "prod_aura_anc_pro",
    name: "Aura Pro ANC Wireless Headphones",
    slug: "aura-pro-anc-headphones",
    category: "Audio",
    description: "Studio-grade over-ear active noise-cancelling headphones with 45dB hybrid ANC, 40mm beryllium drivers, LDAC high-res audio codec, and plush memory foam ear cushions.",
    price_inr: 6999.0,
    cost_price_inr: 3200.0,
    mrp_inr: 11999.0,
    stock_quantity: 42,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      anc_depth_db: 45,
      battery_life_hours: 50,
      codecs_supported: ["LDAC", "AAC", "SBC"],
      driver_size_mm: 40
    },
    upsell_eligible_product_ids: ["prod_aura_dock_3in1"],
    max_agent_discount_percent: 20.0
  },
  {
    id: "prod_nova_chrono",
    name: "Nova Chrono GPS Smartwatch",
    slug: "nova-chrono-smartwatch",
    category: "Wearables",
    description: "Premium titanium GPS multisport smartwatch featuring dual-frequency GNSS, 1.43-inch sapphire crystal AMOLED display, 14-day battery life, and comprehensive biometric tracking.",
    price_inr: 14999.0,
    cost_price_inr: 7800.0,
    mrp_inr: 22999.0,
    stock_quantity: 30,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      battery_life_days: 14,
      display: "1.43-inch Sapphire AMOLED",
      water_resistance: "5ATM (50 meters)",
      gps: "Dual-Frequency L1+L5 GNSS"
    },
    upsell_eligible_product_ids: ["prod_aura_anc_pro"],
    max_agent_discount_percent: 18.0
  },
  {
    id: "prod_gan_65w_charger",
    name: "HyperCharge 65W GaN Fast Charger",
    slug: "hypercharge-65w-gan",
    category: "Power",
    description: "Next-generation Gallium Nitride (GaN III) compact wall adapter with dual USB-C (Power Delivery 3.0) and USB-A ports. Fast charges laptops, phones, and tablets simultaneously.",
    price_inr: 1999.0,
    cost_price_inr: 820.0,
    mrp_inr: 3499.0,
    stock_quantity: 210,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      max_output_watts: 65,
      technology: "GaN III (Gallium Nitride)",
      ports: ["USB-C 1 (65W)", "USB-C 2 (65W)", "USB-A (30W)"],
      protocols: ["PD 3.0", "PPS", "QC 4.0+"]
    },
    upsell_eligible_product_ids: ["prod_braided_usbc_cable"],
    max_agent_discount_percent: 25.0
  },
  {
    id: "prod_braided_usbc_cable",
    name: "TitanShield Braided USB-C to USB-C Cable (2m)",
    slug: "titanshield-usbc-cable-2m",
    category: "Accessories",
    description: "Armored Kevlar-reinforced 100W Power Delivery braided cable with 480Mbps data transfer, gold-plated connectors, and 30,000+ bend lifespan.",
    price_inr: 499.0,
    cost_price_inr: 140.0,
    mrp_inr: 999.0,
    stock_quantity: 340,
    is_active: true,
    image_url: null,
    agent_readable_specs: {
      power_capacity_watts: 100,
      length_meters: 2.0,
      material: "Double-braided ballistic nylon with Kevlar core",
      data_transfer_speed: "480 Mbps"
    },
    upsell_eligible_product_ids: [],
    max_agent_discount_percent: 30.0
  }
];

export async function fetchCatalog() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/catalog`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.warn("fetchCatalog network error, falling back to local catalog:", e);
  }
  return FALLBACK_CATALOG;
}

export async function fetchAgentCatalog() {
  const res = await fetch(`${API_BASE_URL}/agent/v1/catalog`);
  if (!res.ok) throw new Error("Failed to fetch agent catalog");
  return res.json();
}

export async function sendChatMessage(message, sessionId, cartItems = [], history = []) {
  const res = await fetch(`${API_BASE_URL}/agent/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      cart_items: cartItems,
      history,
    }),
  });
  if (!res.ok) throw new Error("Chat request failed");
  return res.json();
}

export async function negotiateA2AProtocol(itemIds, targetBudgetInr, buyerAgentId = "external_ai_buyer") {
  const res = await fetch(`${API_BASE_URL}/agent/v1/negotiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_ids: itemIds,
      target_budget_inr: targetBudgetInr,
      buyer_agent_id: buyerAgentId,
    }),
  });
  if (!res.ok) throw new Error("A2A Negotiation failed");
  return res.json();
}

export async function evaluateDynamicOffer(sessionId, cartItems, cartTotalInr, shopperIntent = "checkout_view") {
  const res = await fetch(`${API_BASE_URL}/api/v1/growth/dynamic-offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      cart_items: cartItems,
      cart_total_inr: cartTotalInr,
      shopper_intent: shopperIntent,
    }),
  });
  if (!res.ok) throw new Error("Failed to evaluate dynamic offer");
  return res.json();
}

export async function fetchGrowthMetrics() {
  const res = await fetch(`${API_BASE_URL}/api/v1/growth/metrics`);
  if (!res.ok) throw new Error("Failed to fetch growth metrics");
  return res.json();
}

export async function fetchCampaigns() {
  const res = await fetch(`${API_BASE_URL}/api/v1/growth/campaigns`);
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return res.json();
}

export async function toggleCampaign(campaignId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/growth/campaigns/${campaignId}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to toggle campaign status");
  return res.json();
}

export async function createOrder(orderPayload) {
  const res = await fetch(`${API_BASE_URL}/api/v1/checkout/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to create Razorpay order");
  }
  return res.json();
}

export async function verifyPayment(verifyPayload) {
  const res = await fetch(`${API_BASE_URL}/api/v1/checkout/verify-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyPayload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Payment verification failed");
  }
  return res.json();
}

export async function fetchPolicies() {
  const res = await fetch(`${API_BASE_URL}/api/v1/policies`);
  if (!res.ok) throw new Error("Failed to fetch policies");
  return res.json();
}

export async function updatePolicies(policyData) {
  const res = await fetch(`${API_BASE_URL}/api/v1/policies`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policyData),
  });
  if (!res.ok) throw new Error("Failed to update policies");
  return res.json();
}

export async function fetchPendingApprovals() {
  const res = await fetch(`${API_BASE_URL}/api/v1/policies/pending-approvals`);
  if (!res.ok) throw new Error("Failed to fetch pending approvals");
  return res.json();
}

export async function resolvePendingApproval(id, decision, notes = "") {
  const res = await fetch(`${API_BASE_URL}/api/v1/policies/pending-approvals/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) throw new Error("Failed to resolve approval");
  return res.json();
}

export async function fetchAuditLogs(limit = 50, actor = null, status = null) {
  let url = `${API_BASE_URL}/api/v1/audit/logs?limit=${limit}`;
  if (actor) url += `&actor=${encodeURIComponent(actor)}`;
  if (status) url += `&guardrail_status=${encodeURIComponent(status)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export async function runFailureSimulation(scenario, prompt = "") {
  const res = await fetch(`${API_BASE_URL}/api/v1/simulation/failure-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, prompt }),
  });
  if (!res.ok) throw new Error("Failed to run failure simulation");
  return res.json();
}

export async function simulatePayment(razorpayOrderId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/checkout/simulate-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ razorpay_order_id: razorpayOrderId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Could not mint a simulated payment");
  }
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error("Backend health check failed");
  return res.json();
}

export async function fetchApproval(approvalId) {
  const res = await fetch(`${API_BASE_URL}/api/v1/policies/pending-approvals/${approvalId}`);
  if (!res.ok) throw new Error("Failed to fetch approval status");
  return res.json();
}

export async function verifyAuditChain() {
  const res = await fetch(`${API_BASE_URL}/api/v1/audit/verify`);
  if (!res.ok) throw new Error("Failed to verify the audit chain");
  return res.json();
}

export async function fetchAgentDiscoveryDocument() {
  const res = await fetch(`${API_BASE_URL}/.well-known/agent-commerce.json`);
  if (!res.ok) throw new Error("Failed to fetch the agent discovery document");
  return res.json();
}

export async function runAgentPurchaseChallenge(productId, buyerAgentId = "ui_inspector_agent") {
  const res = await fetch(`${API_BASE_URL}/agent/v1/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: productId, quantity: 1 }],
      buyer_agent_id: buyerAgentId,
      max_spend_inr: 20000,
      idempotency_key: `ui_${buyerAgentId}_${productId}_${Date.now()}`,
    }),
  });
  // 402 is the expected, successful outcome of the first leg — not an error.
  return { status: res.status, body: await res.json() };
}

export async function settleAndRedeem(challenge, productId, buyerAgentId = "ui_inspector_agent") {
  const terms = challenge.accepts[0];

  const proof = await simulatePayment(terms.razorpay_order_id);

  const res = await fetch(`${API_BASE_URL}/agent/v1/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ product_id: productId, quantity: 1 }],
      buyer_agent_id: buyerAgentId,
      payment: {
        razorpay_order_id: terms.razorpay_order_id,
        razorpay_payment_id: proof.razorpay_payment_id,
        razorpay_signature: proof.razorpay_signature,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Fulfilment refused");
  }
  return res.json();
}

export async function simulateTraffic(cohortSize = 50) {
  const res = await fetch(`${API_BASE_URL}/api/v1/growth/simulate-traffic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cohort_size: cohortSize }),
  });
  if (!res.ok) throw new Error("Traffic simulation failed");
  return res.json();
}
