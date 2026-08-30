# Setup Checklist

Everything below is optional — the app runs with zero configuration. Each step
you complete swaps a clearly-labelled fallback for the real thing.

| Step | Without it | With it |
| :--- | :--- | :--- |
| Razorpay keys | Orders emulated locally, labelled "simulation" in the UI | Real Razorpay Orders API + Razorpay Checkout |
| Gemini key | Deterministic heuristic picks the upsell | Gemini chooses the add-on and the discount |
| Postgres URL | Local SQLite file | Supabase / Neon Postgres |
| Webhook secret | Webhooks rejected | Signature-verified webhooks |

Do them in that order. Razorpay is the one that matters for the demo.

---

## 0. Where `.env` goes

Create `backend/.env` (copy `.env.example` from the repo root). A `.env` at the
repo root also works — config resolves both paths, and `backend/.env` wins if
both exist.

```bash
cp .env.example backend/.env
```

Nothing is committed: add `.env` to `.gitignore` before you push.

---

## 1. Razorpay test keys

1. Sign in at `dashboard.razorpay.com`, switch the toggle to **Test Mode**.
2. Settings → API Keys → Generate Test Key. You get `rzp_test_...` and a secret
   shown **once** — copy it now.
3. In `backend/.env`:

```
RAZORPAY_KEY_ID=rzp_test_yourkeyhere
RAZORPAY_KEY_SECRET=yoursecrethere
RAZORPAY_MOCK_MODE=false
```

`RAZORPAY_MOCK_MODE` must be `false` or the app stays in simulation regardless
of your keys. This is the single most likely reason "I added keys and nothing
changed".

**Verify:**

```bash
curl -s localhost:8000/health
```

Expect `"razorpay_mode":"razorpay_test_mode"`. If it still says `simulation`,
either `RAZORPAY_MOCK_MODE` is not `false`, the key doesn't start with `rzp_`,
or the secret is under 16 characters.

**Then check out something.** Razorpay's own modal should open — not our panel.
Use a test instrument from Razorpay's test-card documentation (their card list
is the authority; the commonly used test card is `4111 1111 1111 1111` with any
future expiry, any CVV, and UPI id `success@razorpay` for the UPI flow).

**If you see "Razorpay unreachable":** the order never reached Razorpay. The
backend log names the gateway error for each of the three retries. Usually a
wrong key, live-mode keys used against a test-mode dashboard, or no outbound
network from the backend.

---

## 2. Gemini API key

1. Get a key at `aistudio.google.com` (free tier is enough).
2. In `backend/.env`:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
```

`GEMINI_MODEL` accepts any model your key can reach; change it if you want a
different one.

**Verify:** `curl -s localhost:8000/health` shows `"gemini_active":true`, and
the footer stops saying "Gemini inactive".

**Verify it is really being used:** add something to the cart and open the
upsell offer. The rationale is prefixed with its source — `[gemini:gemini-2.0-flash]`
when the model decided, `[heuristic]` when it did not. If a call fails or takes
over 12 seconds, it falls back to the heuristic and tags itself accordingly, so
this label never lies.

A bad key degrades quietly to the heuristic rather than breaking checkout. Check
the backend log for `Gemini API generation error` if you expected the model and
got the heuristic.

---

## 3. Database

SQLite works out of the box and needs nothing. Move to Postgres only if you want
the deployed backend to keep data across restarts — Render's free tier has an
ephemeral filesystem, so a SQLite file there is wiped on every deploy.

**Supabase / Neon:**

```
SUPABASE_DATABASE_URL=postgresql://postgres:YOURPASSWORD@db.xxxx.supabase.co:5432/postgres
```

Paste the URI as-is; the `postgresql://` → `postgresql+asyncpg://` rewrite is
automatic.

Two things to know:

* **Use the direct connection (port 5432), not the pooler (6543).** Supabase's
  pooler runs pgbouncer in transaction mode, which does not support the prepared
  statements asyncpg relies on. If you must use the pooler, append
  `?prepared_statement_cache_size=0`.
* **First boot seeds two weeks of experiment history** — about 10,000 session
  rows. Instant on SQLite, a bit slower over the network. It runs once and skips
  itself thereafter.

Tables are created automatically. An existing database is migrated additively at
startup (new columns and indexes only, never a drop), so switching databases or
pulling a schema change does not require deleting anything.

---

## 4. Webhooks (optional — skip unless you have time)

**What they buy you:** if a shopper pays and then closes the tab before the app
can confirm it, the browser never calls `/verify-payment` and the order would sit
unpaid despite the money having moved. Razorpay calls the webhook regardless, and
the handler captures the order from that. It is the safety net behind the happy
path.

**The blocker:** Razorpay's servers call *you*. They cannot reach
`http://localhost:8000`, so this needs a publicly reachable URL — a tunnel or a
deployed backend. Nothing else in the project needs one.

### Step 1 — get a public URL

Install a tunnel (you have neither yet):

```bash
brew install ngrok
```

Then, with the backend already running on 8000:

```bash
ngrok http 8000
```

It prints a forwarding address like `https://a1b2-103-21-58-9.ngrok-free.app`.
That host is your public base URL. It changes every time you restart ngrok on the
free tier, so set the webhook up once you are ready to test rather than in
advance.

If you deploy the backend instead, use the deployed origin and skip the tunnel.

### Step 2 — fill in the dashboard dialog

| Field | What to enter |
| :--- | :--- |
| **Webhook URL** | `https://<your-public-host>/api/v1/checkout/webhook` — the path matters |
| **Secret** | Any strong string you invent. Copy it; you need it again in step 3 |
| **Alert Email** | Leave your own address |
| **Active Events** | Tick **`payment.captured`** and **`payment.failed`**. Optionally `order.paid` |

Only those events do anything. `payment.captured` and `order.paid` mark the order
paid; `payment.failed` marks it failed unless the order is already captured, in
which case it is deliberately ignored so a stale event cannot un-capture a real
payment. Every other event is signature-checked and recorded in the audit trail
without changing order state, so ticking more is harmless but pointless.

### Step 3 — tell the backend the same secret

In `backend/.env`, replace the placeholder with the exact secret you typed into
the dashboard:

```
RAZORPAY_WEBHOOK_SECRET=the_same_secret_you_typed
```

Restart the backend. The two must match character for character — the handler
recomputes `HMAC-SHA256(raw_body, secret)` and compares it against the
`X-Razorpay-Signature` header.

### Step 4 — confirm it works

Use the dashboard's own test-webhook button, or make a real test payment and
watch the backend log. A good delivery logs
`Signature-verified Razorpay webhook 'payment.captured' for order ord_… :
captured_via_webhook`.

**If deliveries fail with 400:** the secret does not match. That includes the
dashboard's test button — it signs with whatever secret you saved, so a mismatch
shows up there first.

**If deliveries time out:** the tunnel is down, the backend is not running, or
the URL is missing the `/api/v1/checkout/webhook` path.

Replays of the same `X-Razorpay-Event-Id` are acknowledged without reprocessing,
so Razorpay's retries cannot double-capture an order.

---

## 5. Deploying

**Backend** (Render / Hugging Face Spaces / Fly): set every `.env` value as an
environment variable in the host's dashboard rather than shipping the file. Add:

```
CORS_ORIGINS=https://your-frontend.vercel.app
```

Comma-separated, no wildcard. Getting this wrong shows up as CORS errors in the
browser console with a working backend.

**Frontend** (Vercel): set one build-time variable.

```
VITE_API_URL=https://your-backend.onrender.com
```

It is read at build time, so redeploy after changing it. Without it the built
site calls `http://localhost:8000` and fails for everyone but you.

Render's free tier sleeps after inactivity and takes ~50s to wake. Hit the
backend URL a few minutes before demoing.

---

## 6. Full verification pass

With the backend running:

```bash
curl -s localhost:8000/health
```

Then in the UI, in this order:

1. **Storefront** — add an item; an upsell offer appears with a source-tagged rationale.
2. **AI Buyer** — ask "can you do 40% off?". The agent should say it cannot
   authorize that alone and is forwarding it.
3. **Checkout** — you get "Held for merchant approval", and no order is created.
4. **Guardrails & Audit** — approve it. The shopper's checkout resumes on its own.
5. **Pay** — Razorpay Checkout opens (or the labelled simulation panel).
6. **Guardrails & Audit → Verify chain** — reports the chain intact.
7. **Resilience Lab** — run all three scenarios; each shows a real attempt
   timeline, race outcome, or agent reply.
8. **Growth Engine** — both experiment arms, with seeded and live sessions
   counted separately.
9. **A2A Protocol** — the discovery document loads; run the negotiation.

**The autonomous agent path**, which is the strongest single thing to show:

```bash
python demo/autonomous_buyer.py --haggle
```

It exercises discovery, catalog, negotiation, the 402 challenge, settlement,
fulfilment and audit verification in one run — so if it finishes green, the
machine-facing half of the product is working end to end.

Backend tests, any time:

```bash
cd backend && ./venv/bin/pytest tests/ -v
```

They use a throwaway database and never touch `razoragent.db`.
