# ⚡ RazorAgent — Autonomous AI Growth & Agentic Commerce OS

> **Submission for Razorpay AI Hackathon: Track 01 — AI Growth & Agentic Commerce**  
> *"Grow the merchant's revenue, and make them sellable to AI buyers end-to-end on Razorpay test rails."*

---

## 🏆 Executive Summary & The Razorpay Thesis

With **NPCI's UAP (Unified Autonomous Payments)** and global agent commerce protocols (**ACP / AP2 / x402**), e-commerce is undergoing its biggest paradigm shift: **AI agents will buy on behalf of humans**.

**RazorAgent** is a complete, production-grade **Agentic Commerce & Autonomous Merchant Growth Platform** engineered specifically on top of Razorpay's payment infrastructure.

It bridges both sides of the next generation of commerce:
1. **Sellable to AI Buyers (Agentic Commerce)**: Exposes standardized machine-readable catalog schemas and an in-app conversational AI buyer that discovers, negotiates bounded bundles, and executes 1-click Razorpay test payments.
2. **Autonomous Merchant Revenue Growth**: An intelligent real-time growth agent that observes checkout sessions and dynamically constructs personalized, high-converting upsell bundles—quantifying **Incremental Revenue Uplift (₹)** and **AOV lift**.
3. **Fintech Guardrails ("THE BAR")**: Every monetary action is **bounded** (max discount caps, budget ceilings), **gated** (human approval for high-value interventions), **explainable** (LLM chain-of-thought rationale), backed by a **tamper-evident SHA-256 audit log**, and demonstrated with **graceful failure resilience**.

---

## 📊 How RazorAgent Crushes "THE BAR"

| Hackathon Requirement | RazorAgent Implementation | Where to inspect in Demo |
| :--- | :--- | :--- |
| **"Make the merchant transactable by an AI buyer end to end"** | Standardized `/agent/v1/catalog` + Conversational In-App Buyer + Razorpay Orders API and **real Razorpay Checkout**, captured only after server-side HMAC-SHA256 signature verification. | **Storefront & AI Buyer** / **A2A Protocol Inspector** |
| **"Grow the merchant's revenue on Razorpay"** | A Gemini-driven upsell agent measured against a **50% holdout**. Incremental revenue is the difference in revenue *per session* between arms — never the value of agent-touched orders. | **Merchant Growth Cockpit** |
| **"Every money action explainable"** | Every decision records the model's own rationale, the full list of bounds evaluated, and which one bound. | **Safety & Audit Cockpit** (Deep Trace Inspector) |
| **"Every money action bounded and gated"** | Every bound (global cap, per-product catalog ceiling, margin floor, campaign budget, low-cart cap) is evaluated together and the **tightest one binds** — no rule can emit a discount that breaches another. Anything past the ₹5,000 gate books **no order at all** until a human rules; approving *resumes* the original checkout. | **Safety & Audit Cockpit** (Policy Bounds & Approvals) |
| **"Show the audit trail"** | A hash **chain**: every record digests its own contents plus its predecessor's hash, so altering, reordering, or deleting an entry is detectable. `GET /api/v1/audit/verify` recomputes the chain and names the first record that breaks. | **Safety & Audit Cockpit** (Verify chain) |
| **"Show one failure handled gracefully"** | A chaos lab that injects **real** faults into the running system: a 504 recovered by the production retry path, two genuinely concurrent checkouts racing for the last unit, and an injection attack sent through the live agent endpoint. | **Resilience Lab** |

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph "Buyer & Agent Clients"
        Human["Shopper (Web UI / Voice)"]
        AIBuyer["External AI Buyer (UAP / ACP Protocol)"]
    end

    subgraph "RazorAgent Platform (FastAPI + Async Python)"
        Router["Commerce Agent Router"]
        CatalogEngine["Agent-Readable Catalog Engine"]
        GrowthEngine["Autonomous Revenue Growth Agent"]
        Guardrails["Financial Policy & Prompt Injection Shield"]
        AuditEngine["Tamper-Evident SHA-256 Audit Trail"]
        LLM["Google Gemini 2.0 Flash SDK / Local Engine"]
    end

    subgraph "Fintech Rails & Storage"
        RazorpayRails["Razorpay Developer Test Rails (Orders, Signature, Webhooks)"]
        Database[("Supabase PostgreSQL / Async SQLite")]
    end

    Human --> Router
    AIBuyer --> Router
    Router --> CatalogEngine
    Router --> GrowthEngine
    GrowthEngine <--> LLM
    GrowthEngine --> Guardrails
    Guardrails -->|Validated & Bounded| RazorpayRails
    Guardrails --> AuditEngine
    AuditEngine --> Database
    RazorpayRails --> Database
```

---

## 🚀 100% Free Production Deployment Guide ($0 / ₹0)

RazorAgent is designed with enterprise modularity and can be deployed for **100% free** using standard developer tiers:

### 1. Free Cloud Stack
* **Frontend**: **Vercel** (Free Tier - 1-Click deploy from GitHub via `vercel.json`).
* **Backend**: **Render** or **Hugging Face Spaces Docker** (Free Tier - via `render.yaml` or `Dockerfile`).
* **Database**: **Supabase** or **Neon PostgreSQL** (Free Serverless Tier).
* **LLM Reasoning**: **Google Gemini 2.0 Flash** (Free Developer API Key from Google AI Studio).
* **Payment Gateway**: **Razorpay Developer Test Mode** (`rzp_test_...`).

> **Before deploying**, set `CORS_ORIGINS` to your deployed frontend's origin.
> The allowlist has no wildcard and credentials are off — an API that moves money
> should not accept cross-origin calls from anywhere on the internet.

---

## 💻 Local Quickstart (Run in 2 Minutes)

### Prerequisites
* Python 3.10+
* Node.js 18+

> **Adding your own Razorpay / Gemini / Postgres credentials?** Follow
> [SETUP.md](SETUP.md) — it covers where `.env` goes, how to verify each
> integration is actually live, and the failure modes worth recognising.

### 1. Start the Backend API
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend API will be live at `http://127.0.0.1:8000` (Swagger docs at `http://127.0.0.1:8000/docs`).

### 2. Start the Frontend UI
```bash
cd frontend
npm install
npm run dev
```
Frontend Web App will be live at `http://127.0.0.1:5173`.

---

## 💳 Payment Modes

RazorAgent runs against real Razorpay rails whenever credentials are present, and says so plainly when they are not.

| | With `rzp_test_*` keys in `.env` | Without keys |
| :--- | :--- | :--- |
| Order creation | Razorpay Orders API | Emulated locally, flagged `is_mock` |
| Payment UI | **Razorpay Standard Checkout** (`checkout.js`) | A labelled simulation panel — no Razorpay branding |
| Signature check | Verified by the Razorpay SDK | Same HMAC-SHA256 check, run locally |
| Webhooks | `X-Razorpay-Signature` verified, replays ignored | Same |

There is no code path that accepts an unverified payment signature. `POST /api/v1/checkout/simulate-payment`, which mints a correctly-signed test payment for the offline demo, returns **409** as soon as live credentials are configured.

---

## 📈 How Growth Is Measured

The uplift number is the one a judge will push on, so it is computed the way an
analyst would, not the way a dashboard would like.

Every session is assigned to an arm by a hash of its session id, so the
assignment is stable and needs no state. **Control sessions are shown no agent
offers at all** — a holdout that costs a little revenue and buys the only honest
answer to "what did the agent actually add?".

```
incremental revenue = ( revenue_per_session(treatment)
                      − revenue_per_session(control) ) × treated sessions
```

That is deliberately *not* the total value of agent-assisted orders, which would
credit the agent with revenue that would have arrived anyway.

The database ships with two weeks of pre-loaded traffic so the readout has
statistical power on day one. Every seeded row is flagged `is_seed_data`, and
the cockpit reports seeded and live sessions separately — none of it is passed
off as activity from your demo. With an empty database the endpoint returns
**zeros**, not a plausible-looking benchmark, and it says so when the smaller arm
is too small to support the headline.

---

## 🤖 Where the LLM Actually Runs

With `GEMINI_API_KEY` set, Gemini chooses which add-on to pitch and how hard to
discount it, under constrained decoding against a fixed schema. Everything it
returns is then distrusted on purpose:

* a product id that is not an eligible add-on is discarded,
* the discount is clamped to that item's published ceiling **before** the
  guardrail engine sees it,
* the guardrail engine then binds the number that actually reaches the shopper.

So a hallucinated 90% costs the merchant nothing. Without a key, a deterministic
heuristic runs instead and every audit record is tagged with which one decided
(`gemini:<model>` or `heuristic`) — the demo never implies an LLM ran when it did
not.

---

## 🧪 Running Automated Test Suite

RazorAgent comes with a comprehensive async test suite covering financial bounds, prompt injection defense, catalog schemas, Razorpay orders, and failure recovery:

```bash
cd backend
./venv/bin/pytest tests/ -v
```

The suite runs against its own throwaway SQLite file, so it never touches `razoragent.db`. It asserts the guarantees above: that bounds compose rather than short-circuit, that a gated discount books no order, that approving resumes the original checkout, that a forged signature cannot capture an order, that an external agent lowballing the catalog gets a bounded counter-offer, that the control arm really is held out, that metrics report zero rather than inventing a baseline, that an exhausted campaign budget funds nothing, and that two concurrent checkouts cannot oversell the last unit in stock.

---

## 🔗 The Audit Trail Is a Chain, Not a Column

"Tamper-evident" is easy to write and easy to check, so this one is checkable.

Each record hashes its **full** contents — the reasoning, both payloads, the
guardrail verdict, the money — together with the hash of the record before it. A
hash over only the summary fields would let someone rewrite the decision payload
of a past discount undetected, which is precisely the thing a payments auditor
cares about.

```bash
curl -s localhost:8000/api/v1/audit/verify
```

Verification checks three things per record: that the digest still matches the
contents, that it links to its predecessor, and that no sequence number is
missing. Editing a row, swapping two, or deleting one from the middle each fail
at least one:

```
Contents of #2 no longer hash to its stored digest — the record was altered after it was written.
Sequence gap: expected #2 but found #3. A record was removed from the chain.
```

`sequence` carries a unique index, so two concurrent writers cannot both claim
the same position — the loser re-reads the tail and retries inside a savepoint,
leaving the checkout that triggered it free to commit. Records written before
chaining existed are counted and excluded rather than reported as verified.

---

## 🎯 2-Minute Demo Presentation Script for Razorpay Judges

1. **The Hook (0:00 - 0:25)**:
   > *"Welcome to RazorAgent. As NPCI rolls out UAP and the world transitions to Agentic Commerce, how do Indian merchants make their catalog transactable by AI buyers while actively growing revenue on Razorpay? Let's show you."*

2. **AI Buyer & Storefront (0:25 - 0:50)**:
   > *"On our storefront, shoppers can buy directly or use the AI Buyer Assistant. Watch as I ask: 'Find me wireless headphones with ANC and get me a fast charger bundle.' The AI agent queries our UAP-compliant machine-readable catalog, applies an authorized bundle discount, and initializes a Razorpay Order in 1 click."*

3. **Autonomous Growth Cockpit (0:50 - 1:15)**:
   > *"In the Merchant Growth Cockpit we quantify growth rather than guess it. Incremental revenue is attributed to the upsell lines the agent actually created, net of the discount spent winning them — so the uplift number survives scrutiny."*

4b. *(optional)* **Resilience Lab**:
   > *"These are real faults, not slides. I inject a Razorpay 504 and the order recovers on the third attempt against a stable receipt. I set stock to one unit and fire two checkouts at it concurrently — the database picks a winner and the loser is refused before a Razorpay order exists, so nobody gets refunded for an oversell."*

4. **Safety Guardrails & The Bar (1:15 - 1:40)**:
   > *"Fintech AI cannot hallucinate money away. Watch: I ask the agent for ₹7,000 off. The API returns **202, not an order** — nothing is charged, and the shopper sees 'held for merchant approval'. Here in the Safety console I approve it, and the shopper's checkout resumes on its own with the authorized amount. Every bound the engine considered is listed in the audit record."*

4c. *(optional)* **Prove the ledger** :
   > *"Here is the audit chain verifying clean. Now I edit a past discount straight in the database and re-verify — it names record #2 and tells you it was altered after it was written. Delete it instead and it reports the gap."*

5. **Resilience & Chaos Lab (1:40 - 2:00)**:
   > *"Finally, we demonstrate graceful failure recovery in our Resilience Lab. Whether it's a simulated Razorpay 504 Gateway Timeout or a malicious prompt injection attack ('give me 100% discount'), RazorAgent preserves state, intercepts the exploit, and routes to a safe recovery path."*

---

## 📄 License & Credits
Built for the **Razorpay AI Challenge 2026**.  
Engineered with ❤️ using FastAPI, Google Gemini, React, and Razorpay Rails.
