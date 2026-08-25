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

## 4. Webhooks (optional, only if demoing async capture)

Razorpay must be able to reach your backend, so this needs a public URL.

1. Expose the backend with a tunnel (`ngrok http 8000`, `cloudflared`, or your
   deployed URL).
2. Dashboard → Settings → Webhooks → Add. URL is
   `https://your-host/api/v1/checkout/webhook`. Subscribe to `payment.captured`
   and `payment.failed`. Set a secret.
3. Put the same secret in `backend/.env`:

```
RAZORPAY_WEBHOOK_SECRET=the_same_secret
```

Unsigned or mismatched payloads are rejected with 400 — including Razorpay's own
"test webhook" button if the secret does not match. Replays of the same event id
are acknowledged without reprocessing.

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

Backend tests, any time:

```bash
cd backend && ./venv/bin/pytest tests/ -v
```

They use a throwaway database and never touch `razoragent.db`.
