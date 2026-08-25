const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function fetchCatalog() {
  const res = await fetch(`${API_BASE_URL}/api/v1/catalog`);
  if (!res.ok) throw new Error("Failed to fetch catalog");
  return res.json();
}

export async function fetchAgentCatalog() {
  const res = await fetch(`${API_BASE_URL}/agent/v1/catalog`);
  if (!res.ok) throw new Error("Failed to fetch agent catalog");
  return res.json();
}

export async function sendChatMessage(message, sessionId, cartItems = []) {
  const res = await fetch(`${API_BASE_URL}/agent/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      cart_items: cartItems,
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
