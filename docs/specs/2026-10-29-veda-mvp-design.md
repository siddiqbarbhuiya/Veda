# Veda MVP v1.0 — Design Specification

**Document Version:** 1.1
**Date:** 2026-10-29
**Status:** DRAFT — Pending Approval
**Author:** Claude Opus 4.6 (AI-assisted) + Siddiq Barbhuiya

---

## 1. Intent and Why

Indian engineering students cannot use global AI playgrounds (Replit, StackBlitz, OpenRouter). The barriers are:

- No international credit cards for $15–$25/month subscriptions.
- High currency conversion fees on dollar-denominated billing.
- No safety net against runaway token costs from infinite loops.

Veda gives students a zero-infrastructure-cost, browser-executed coding workspace. Students link their own AI API keys, pay via UPI micro-transactions (starting at ₹29), and a server-side circuit breaker prevents runaway billing.

---

## 2. Goals

1. **Zero server compute cost.** All code execution runs in the browser. The server delivers static assets and proxies AI API calls only.
2. **UPI-first payments.** Students add credits via phone scan. Minimum topup: ₹29 (2,900 paise).
3. **Key security.** API keys are AES-256 encrypted at rest. Row Level Security (RLS) isolates each user's data.
4. **Budget safety.** A per-user circuit breaker stops runaway AI calls (10 requests per 60 seconds).
5. **Free-tier hosting.** The platform runs within Vercel + Supabase free tiers for the first 500 users. Max operating cost: ₹1,200/month (domain only).

## 3. Non-Goals

- **No collaborative editing.** MVP is single-user per workspace. No real-time multiplayer.
- **No custom domain per user.** All users share the same Veda domain.
- **No mobile-optimized IDE.** The VS Code-style layout targets desktop/laptop screens (≥1024px).
- **No self-hosted option.** MVP is SaaS only.

## 4. Anti-Goals (Failure Conditions)

- A student's API key is readable by another user or visible in plaintext in the database.
- A student loses more than ₹10 in credits due to an infinite loop or system bug.
- The platform incurs cloud compute costs from user code execution.
- The proxy adds more than 85ms overhead to the AI response round-trip.

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend framework | Next.js 14+ (App Router) | SSR for landing pages, client-side for IDE. Deploys to Vercel free tier. |
| UI components | Tailwind CSS + shadcn/ui | Accessible, themeable, no runtime cost. |
| Code editor | Monaco Editor (@monaco-editor/react) | VS Code's editor engine. File tree, syntax highlighting, IntelliSense. |
| Node.js runtime | WebContainers (@webcontainer/api) | In-browser Node.js. No server compute. |
| Python runtime | Pyodide | In-browser CPython via WASM. No server compute. |
| Auth | Supabase Auth (Google OAuth + GitHub OAuth) | Free tier. Built-in JWT. RLS integration. |
| Database | Supabase PostgreSQL | Free tier. RLS. Real-time subscriptions for balance updates. |
| Payments | Razorpay (UPI) | Indian payment gateway. ₹0 setup. Test mode available. |
| Hosting | Vercel (free tier) | Edge functions for the AI proxy. Global CDN. |
| AI providers | OpenAI, Google Gemini, Anthropic | The three providers specified in the PRD. |

### 5.2 System Data Flow

```
[Student Browser]
    │
    ├── IDE (Monaco Editor + File Tree + Terminal + AI Chat Panel)
    │     │
    │     ├── Code Execution ──► WebContainers (Node.js) or Pyodide (Python)
    │     │                       [Runs on client CPU/RAM. Zero server cost.]
    │     │
    │     └── AI Request (from chat panel or code) ──► Next.js Edge Proxy
    │                                                      │
    │           ┌──────────────────────────────────────────┘
    │           │
    │           ▼
    │     [Edge Proxy Middleware]
    │       1. Authenticate user (JWT from Supabase Auth)
    │       2. Check circuit breaker (10 req / 60s per user_id)
    │       3. Check paise balance (must be >= estimated hold)
    │       4. Deduct estimated hold (atomic: UPDATE WHERE balance >= hold)
    │       5. Fetch encrypted API key from Supabase
    │       6. Decrypt key in memory (AES-256, ENCRYPTION_SECRET)
    │       7. Forward request to AI provider
    │       8. Stream response back via SSE
    │       9. On completion: calculate actual cost, refund (hold - actual)
    │           │
    │           ▼
    │     [AI Provider API (OpenAI / Gemini / Anthropic)]
    │
    └── Payment (UPI topup) ──► Razorpay Checkout ──► Webhook ──► Supabase balance update
```

### 5.3 IDE Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [Logo] [Project Name] [Runtime: Node/Python ▼]    │
│           [Balance: ₹47.00] [Add Credits] [Settings] [User] │
├────────┬─────────────────────────────────┬───────────────────┤
│        │                                 │                   │
│  File  │       Monaco Editor             │   AI Chat Panel   │
│  Tree  │                                 │                   │
│        │                                 │  [Model: GPT-4 ▼] │
│  📁 src│                                 │                   │
│   📄 ..│                                 │  Chat messages... │
│   📄 ..│                                 │                   │
│        │                                 │  [Send message]   │
│        ├─────────────────────────────────┤                   │
│        │  Terminal Panel                 │                   │
│        │  $ node index.js               │                   │
│        │  > Hello World                 │                   │
│        │  $                             │                   │
└────────┴─────────────────────────────────┴───────────────────┘
```

All panels are resizable. The AI Chat Panel collapses with a toggle button.

### 5.4 AI Chat Panel Behavior

The AI Chat Panel sends the current conversation history **and the contents of the currently open file** as context with each request. This gives the AI model full awareness of the code the student works on (similar to Cursor).

The token cost includes both the chat history and the file context. The UI shows an estimated cost before each message is sent.

### 5.5 File Persistence

WebContainers and Pyodide run in-memory. A page refresh loses all files.

**Storage:** Files persist in browser **IndexedDB** via an auto-save mechanism.

- The IDE saves the full file tree to IndexedDB every 5 seconds (debounced on change).
- On page load, the IDE restores the file tree from IndexedDB.
- Each project has a unique IndexedDB key scoped to `user_id + project_name`.
- If IndexedDB is unavailable (incognito mode), the IDE shows a warning banner: "Files will not persist after refresh."

### 5.6 WebContainer CORS Headers

WebContainers require specific HTTP headers. These are set in `next.config.ts`:

```js
headers: [
  {
    source: '/(ide)(.*)',
    headers: [
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ],
  },
]
```

These headers apply only to IDE routes. Other pages (landing, dashboard) are not affected.

### 5.7 Python Runtime — Terminal Integration

The terminal panel provides a shell prompt for Node.js (WebContainers). For Python (Pyodide), the terminal shows a **Python REPL** instead of a shell. A "Run" button in the toolbar executes the currently open `.py` file through Pyodide. Output appears in the terminal panel.

---

## 6. Database Schema

### 6.1 Tables

#### `profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | References `auth.users.id`. |
| `email` | `text` | User email from OAuth. |
| `display_name` | `text` | User display name. |
| `balance_paise` | `integer` DEFAULT 1000 | Wallet balance in paise. New users get ₹10 (1,000 paise). |
| `created_at` | `timestamptz` | Account creation time. |
| `updated_at` | `timestamptz` | Last profile update. |

**Profile creation:** A Supabase database trigger `on_auth_user_created` automatically inserts a `profiles` row with the default 1,000 paise balance when a new user signs up via OAuth.

#### `api_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated. |
| `user_id` | `uuid` FK → profiles.id | Owner. |
| `provider` | `text` CHECK | One of: `openai`, `gemini`, `anthropic`. |
| `encrypted_key` | `text` | AES-256-GCM encrypted API key. |
| `iv` | `text` | Initialization vector for decryption. |
| `auth_tag` | `text` | GCM authentication tag. |
| `label` | `text` | User-defined label (e.g., "My OpenAI key"). |
| `created_at` | `timestamptz` | Key creation time. |
| `updated_at` | `timestamptz` | Last update. |

UNIQUE constraint on `(user_id, provider)` — one key per provider per user.

#### `transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated. |
| `user_id` | `uuid` FK → profiles.id | Owner. |
| `type` | `text` CHECK | One of: `topup`, `ai_usage`, `bonus`. |
| `amount_paise` | `integer` | Positive for credits, negative for debits. |
| `balance_after_paise` | `integer` | Balance snapshot after this transaction. |
| `description` | `text` | Human-readable description. |
| `metadata` | `jsonb` | Provider, model, token counts, Razorpay order ID, etc. |
| `razorpay_payment_id` | `text` UNIQUE NULLABLE | Razorpay payment ID for idempotency on topup webhooks. |
| `created_at` | `timestamptz` | Transaction time. |

#### `rate_config`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated. |
| `provider` | `text` | `openai`, `gemini`, `anthropic`. |
| `model` | `text` | Model identifier (e.g., `gpt-4o`, `gemini-1.5-flash`). |
| `input_paise_per_1k_tokens` | `integer` | Cost per 1,000 input tokens in paise. |
| `output_paise_per_1k_tokens` | `integer` | Cost per 1,000 output tokens in paise. |
| `is_active` | `boolean` DEFAULT true | Whether this model is available. |
| `updated_at` | `timestamptz` | Last rate update. |

UNIQUE constraint on `(provider, model)`.

#### `circuit_breaker_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` PK | Auto-generated. |
| `user_id` | `uuid` FK → profiles.id | Owner. |
| `requested_at` | `timestamptz` | Time of the AI request. |

Used by the proxy to count requests per user in a 60-second sliding window. Rows older than 120 seconds are cleaned up periodically.

### 6.2 Row Level Security Policies

```sql
-- profiles: users can read and update only their own row
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- api_keys: users can read and delete only their own keys
-- INSERT and UPDATE go through the service role (server-side encryption)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own keys"
  ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own keys"
  ON api_keys FOR DELETE USING (auth.uid() = user_id);

-- transactions: users can read only their own transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own transactions"
  ON transactions FOR SELECT USING (auth.uid() = user_id);

-- rate_config: all authenticated users can read
ALTER TABLE rate_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read rates"
  ON rate_config FOR SELECT USING (auth.role() = 'authenticated');

-- circuit_breaker_log: service role only (not accessed by client)
ALTER TABLE circuit_breaker_log ENABLE ROW LEVEL SECURITY;
-- No client-facing policies. Accessed only by the edge proxy via service role key.
```

---

## 7. API Contracts

### 7.1 AI Proxy Endpoint

**`POST /api/ai/chat`**

Request:
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Explain closures in JavaScript" }
  ],
  "stream": true
}
```

Response: Server-Sent Events (SSE) stream.

```
data: {"chunk": "A closure is", "done": false}
data: {"chunk": " a function that", "done": false}
...
data: {"chunk": "", "done": true, "usage": {"input_tokens": 12, "output_tokens": 85, "cost_paise": 3}}
```

Error responses:
- `401` — Not authenticated.
- `402` — Insufficient paise balance.
- `429` — Circuit breaker triggered. Header: `Retry-After: <seconds>`.
- `400` — Invalid provider or model.

### 7.2 Key Management

**`POST /api/keys`** — Store or replace an API key.

Request:
```json
{
  "provider": "openai",
  "key": "sk-abc123...",
  "label": "My OpenAI key"
}
```

Response: `201 Created`
```json
{ "id": "uuid", "provider": "openai", "label": "My OpenAI key" }
```

Behavior: If a key for the same provider already exists, the endpoint upserts (replaces the old key). The plaintext key is never returned.

**`GET /api/keys`** — List stored keys (returns provider + label only, never the key).

Response: `200 OK`
```json
[
  { "id": "uuid", "provider": "openai", "label": "My OpenAI key", "created_at": "..." }
]
```

**`DELETE /api/keys/:id`** — Delete a stored key. Returns `204 No Content`.

### 7.3 Wallet / Payments

**`GET /api/wallet/balance`** — Current balance in paise.
**`GET /api/wallet/transactions`** — Transaction history (paginated).
**`POST /api/wallet/topup`** — Create a Razorpay order for a topup amount.
**`POST /api/webhooks/razorpay`** — Razorpay webhook to confirm payment and credit balance.

---

## 8. Encryption Design

### 8.1 Algorithm

- **AES-256-GCM** (authenticated encryption).
- `ENCRYPTION_SECRET` env var holds a 32-byte hex-encoded key.
- Each API key gets a unique random 12-byte IV.
- The GCM auth tag verifies integrity on decryption.

### 8.2 Encryption Flow

1. User submits plaintext API key via HTTPS.
2. Edge proxy receives the key in memory.
3. Proxy generates a random IV (12 bytes).
4. Proxy encrypts with AES-256-GCM using `ENCRYPTION_SECRET` + IV.
5. Proxy stores `encrypted_key`, `iv`, and `auth_tag` in Supabase.
6. Plaintext key is never written to disk or logs.

### 8.3 Key Rotation

When `ENCRYPTION_SECRET` rotates:

1. Set `ENCRYPTION_SECRET_OLD` to the previous value.
2. Set `ENCRYPTION_SECRET` to the new value.
3. Run the migration script: `npm run rotate-keys`.
4. The script reads each row, decrypts with `_OLD`, re-encrypts with the new secret, and updates the row.
5. Remove `ENCRYPTION_SECRET_OLD` after the migration completes.

---

## 9. Circuit Breaker Design

- **Scope:** Per user ID (shared across all tabs and sessions).
- **Threshold:** 10 AI proxy requests within a rolling 60-second window.
- **Tracking:** The edge proxy inserts a row into `circuit_breaker_log` on each request. It counts rows for the user in the last 60 seconds.
- **Response when triggered:** HTTP 429 with `Retry-After` header. The client shows a warning banner.
- **Cleanup:** A Supabase cron job (pg_cron) deletes rows older than 120 seconds every 5 minutes.

---

## 10. Payment System Design

### 10.1 Micro-Currency Model

- All wallet operations use **paise** (integer). 1 rupee = 100 paise.
- PostgreSQL column type: `integer`. No `float` or `numeric`.
- Display conversion happens only in the UI layer: `(balance_paise / 100).toFixed(2)`.

### 10.2 Topup Packs

| Pack | Price (₹) | Paise credited | Bonus |
|------|----------|----------------|-------|
| Starter | 29 | 2,900 | 0 |
| Standard | 49 | 4,900 | 0 |
| Value | 99 | 10,900 | 1,000 paise bonus |

### 10.3 Payment Mode Flag

`PAYMENT_MODE` env var:

- `simulator` — Topup requests are auto-confirmed. No real money moves. For development and testing.
- `live` — Razorpay checkout flow with real UPI payments.

### 10.4 Razorpay Webhook Flow

1. Student selects a topup pack → frontend calls `POST /api/wallet/topup`.
2. Server creates a Razorpay order → returns `order_id` to the frontend.
3. Frontend opens Razorpay Checkout modal → student scans UPI QR.
4. Razorpay sends webhook to `POST /api/webhooks/razorpay`.
5. Server verifies the webhook signature (`RAZORPAY_WEBHOOK_SECRET`).
6. Server checks `razorpay_payment_id` uniqueness in `transactions`. If the ID already exists, return 200 (idempotent — no double credit).
7. Server credits the paise amount to `profiles.balance_paise` (atomic increment).
8. Server inserts a `topup` row into `transactions` with the `razorpay_payment_id`.

---

## 11. Token Cost Calculation

### 11.0 Pre-Authorization Hold

Before the AI call starts, the proxy deducts an **estimated hold** from the balance:

1. Calculate hold: `hold_paise = estimated_input_tokens * output_paise_per_1k / 1000 * 3` (3x the estimated input cost, covering typical output).
2. Minimum hold: 10 paise. Maximum hold: 500 paise.
3. Atomic deduction: `UPDATE profiles SET balance_paise = balance_paise - $hold WHERE id = $user_id AND balance_paise >= $hold RETURNING balance_paise`.
4. If the `UPDATE` returns zero rows, the balance is insufficient → return HTTP 402.
5. After the AI response completes, calculate the actual cost and refund the difference: `UPDATE profiles SET balance_paise = balance_paise + ($hold - $actual_cost) WHERE id = $user_id`.
6. If the stream is interrupted and no usage metadata is available, refund the full hold.

This atomic pattern prevents the balance from going negative, even under concurrent requests.

### 11.1 Cost Formula

After each AI response, the provider returns token usage metadata.

```
cost_paise = Math.ceil((input_tokens * input_paise_per_1k + 999) / 1000)
           + Math.ceil((output_tokens * output_paise_per_1k + 999) / 1000)
```

- All arithmetic uses **integer math only**. No floating-point division.
- `ceil` is implemented as `(n * rate + 999) / 1000` with integer truncation.
- The rate comes from the `rate_config` table.
- If the rate is not found, the proxy returns a 400 error (does not proceed with an unknown cost).

### 11.1 Default Rate Table (MVP)

| Provider | Model | Input (paise/1K) | Output (paise/1K) |
|----------|-------|-------------------|---------------------|
| openai | gpt-4o | 18 | 72 |
| openai | gpt-4o-mini | 1 | 3 |
| gemini | gemini-1.5-flash | 1 | 3 |
| gemini | gemini-1.5-pro | 10 | 30 |
| anthropic | claude-sonnet-4 | 22 | 110 |
| anthropic | claude-haiku-3.5 | 6 | 18 |

These rates are approximate conversions from USD pricing at ₹84/USD. An admin can update them in the database.

---

## 12. Streaming Design

- **Protocol:** Server-Sent Events (SSE).
- **Edge proxy** opens a streaming connection to the AI provider.
- Each chunk is forwarded to the client as an SSE `data:` event.
- The final event includes `done: true` and the `usage` object with token counts and cost.
- The client renders chunks in real-time in the AI Chat Panel.
- If the stream is interrupted, the client shows an error. The pre-auth hold is refunded in full (no usage metadata is available).
- **Vercel edge runtime note:** Vercel's 10-second CPU limit does not apply to streaming responses. The edge function holds the connection open as long as the upstream AI provider streams data. Long responses (30+ seconds for GPT-4) are supported.

---

## 13. Project Directory Structure

```
veda/
├── docs/
│   ├── specs/                        # Design specifications
│   ├── adr/                          # Architecture Decision Records
│   ├── api/                          # OpenAPI / Swagger specs
│   └── setup/                        # Environment setup guides
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth pages (login, callback)
│   │   ├── (dashboard)/              # Dashboard and settings
│   │   ├── (ide)/                    # IDE workspace
│   │   ├── api/
│   │   │   ├── ai/                   # AI proxy endpoint
│   │   │   ├── keys/                 # Key management endpoints
│   │   │   ├── wallet/               # Wallet and topup endpoints
│   │   │   └── webhooks/             # Razorpay webhook
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Landing page
│   ├── components/
│   │   ├── ide/                      # IDE components (editor, file tree, terminal, chat)
│   │   ├── payments/                 # Razorpay checkout, topup packs
│   │   ├── keys/                     # Key provisioning panel
│   │   └── ui/                       # shadcn/ui primitives
│   ├── lib/
│   │   ├── supabase/                 # Supabase client, server client, types
│   │   ├── crypto/                   # AES-256-GCM encrypt/decrypt
│   │   ├── billing/                  # Token cost calculation
│   │   ├── circuit-breaker/          # Rate limiting logic
│   │   ├── ai-providers/             # Provider adapters (OpenAI, Gemini, Anthropic)
│   │   └── razorpay/                 # Razorpay client, webhook verification
│   ├── hooks/                        # React hooks
│   └── types/                        # TypeScript type definitions
├── supabase/
│   ├── migrations/                   # SQL migration files
│   └── seed.sql                      # Default rate_config data
├── scripts/
│   └── rotate-keys.ts                # Key rotation migration script
├── public/                           # Static assets
├── .env.example                      # Template for all env vars
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── CHANGELOG.md
└── README.md
```

---

## 14. Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | Yes |
| `ENCRYPTION_SECRET` | 32-byte hex key for AES-256-GCM | Yes |
| `ENCRYPTION_SECRET_OLD` | Previous encryption key (during rotation only) | No |
| `RAZORPAY_KEY_ID` | Razorpay API key ID | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signature secret | Yes |
| `PAYMENT_MODE` | `simulator` or `live` | Yes |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app | Yes |

---

## 15. Constraints

- **Vercel free tier:** 100GB bandwidth/month, 10s execution limit on serverless functions, 1MB function size.
- **Supabase free tier:** 500MB database, 50,000 monthly active users, 2GB bandwidth.
- **WebContainers:** Require a modern browser (Chrome 90+, Firefox 100+, Safari 16.4+). Do not work in incognito mode on some browsers.
- **Pyodide:** ~15MB initial download. Cold start of 3–5 seconds. Limited package availability.

---

## 16. Decisions Made by the Builder

These are documented as the builder's (AI-assisted) decisions. The project owner did not specify these.

1. **SSE over WebSocket** for AI streaming — SSE is simpler, works through Vercel edge functions, and the communication is one-directional (server to client).
2. **AES-256-GCM over AES-256-CBC** — GCM provides authenticated encryption (integrity + confidentiality) in one pass. CBC requires a separate HMAC.
3. **Monaco Editor** as the code editor — it is the VS Code editor engine, mature, and well-supported in React.
4. **shadcn/ui** for UI components — accessible, customizable, no runtime JS overhead.
5. **PostgreSQL for circuit breaker** (not Redis) — keeps the stack within Supabase free tier. The minor race (11 requests instead of 10) is acceptable for MVP. Can migrate to Redis later.
6. **Integer-only cost formula** — avoids JavaScript floating-point errors by multiplying before dividing.
7. **Client RLS restricted to SELECT + DELETE on `api_keys`** — prevents clients from writing encrypted columns directly. All writes go through the service role.

---

## 17. Validation Metrics (from PRD)

| Metric | Target |
|--------|--------|
| Cloud compute bills after 50-user stress test | ₹0 |
| Students who link a key or complete a topup within 7 days | > 60% |
| Proxy overhead on AI response round-trip | < 85ms |

---

*End of Design Specification*
