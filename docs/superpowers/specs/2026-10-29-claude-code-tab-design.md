# Claude Code tab, OpenRouter and combos: design

Status: approved to build by the owner on 2026-10-29 ("analyze, spec, plan, implement").
Cost and pricing: deferred. See `docs/product/pricing-later.md`.

## 1. Intent

Indian students need strong coding agents without a foreign card. The owner saw Claude Code run on free providers through OmniRoute. The owner wants this inside the Veda browser editor:

1. OpenRouter in the AI chat, with all its models (free and paid).
2. Combos: an ordered list of models with automatic fallback when one fails.
3. A tab in the AI panel that runs the real Claude Code engine (Claude Agent SDK), not a copy.
4. The model selector at the bottom of the panel, not at the top.

## 2. Goals, non-goals, anti-goals

Goals
- Real Claude Code engine on the student's project, with visible, reviewable file changes.
- Any OpenRouter model works in Chat. Claude Code works with OpenRouter models and with the student's Anthropic key.
- The student's API key never enters the sandbox.
- The browser file store stays the single source of truth.

Non-goals
- Running OmniRoute for students. It listens on `localhost:20128`. A Vercel server and a browser tab cannot use it.
- Charging for sandbox time (deferred).
- Running the Claude Code CLI inside WebContainers (it needs real processes and native tools; not possible).
- Claude Code login with a Claude subscription (BYOK API keys only).

Anti-goals (failure even if it "works")
- A key readable by the agent (`echo $KEY` in the sandbox).
- The sandbox changes the student's files without a diff and approval.
- A runaway sandbox that costs Veda money with no cap.
- Chat or billing regressions for the three current providers.

## 3. Findings from the code (where and what)

| Area | Fact | Effect |
|---|---|---|
| Providers | Hard-coded in 4 places: `chat/route.ts:17`, `key-providers.ts`, `api_keys` CHECK in `00002`, `types/database.ts` | One new provider touches all 4. Add `openrouter` to each. |
| Adapter | `ProviderAdapter.streamChat(apiKey, model, messages, signal)` | OpenRouter = OpenAI wire format. New adapter reuses the SSE helpers. |
| Billing | `chat/route.ts` reads `rate_config` for the exact `(provider, model)` pair, else `model_unsupported` | OpenRouter has 400+ changing models. Needs a dynamic rate (see 6.2). |
| Chat panel | `chat-panel.tsx` header holds the model `<select>`; models come from `rate_config` | Move select to the composer. Load OpenRouter list from a new API. |
| History | `use-ai-chat.ts` keeps messages in memory; string-only content | Chat tab keeps this. Claude Code tab needs a richer event list. |
| Layout | Chat is a resizable side panel, 280-560 px wide | The tab header and composer row must fit 280 px. |
| COOP/COEP | `/ide/*` sends `require-corp` | Browser calls only same-origin APIs. No direct calls to the sandbox host. |
| File store | `useFileSystem()`: `files`, `createFile`, `updateFileContent`, `deleteFile`; cloud cap 5 MB | Agent changes apply through these. Snapshot cap = 5 MB. |
| Vercel | `chat/route.ts` has `maxDuration = 60`. Agent runs last minutes. | A run must survive a function end: the sandbox keeps running; the client reconnects. |
| Local dev | Sandbox is remote and cannot reach `localhost` | The LLM proxy needs a public URL. Dev needs a tunnel, or `AGENT_KEY_MODE=direct`. |
| Keys | AES-256-GCM in `api_keys`, decrypted in server routes | The new LLM proxy decrypts the key. The sandbox gets only a short-lived token. |

## 4. Architecture

```
Browser (Claude Code tab)
  POST /api/agent/run  (SSE)  ---> Next.js route
        files snapshot, prompt, model          |
                                               | E2B SDK
                                               v
                                   E2B sandbox  /home/user/project
                                   runner.mjs -> Claude Agent SDK query()
                                               |  ANTHROPIC_BASE_URL = Veda /api/agent/llm
                                               v
                       Veda LLM proxy  (verifies token, adds the real key, combo fallback)
                                               |
                                  OpenRouter  or  Anthropic
```

### 4.1 Run flow
1. Student sends a prompt in the Claude Code tab.
2. Client posts: project files (snapshot), prompt, model choice, and the session id.
3. Server starts or reuses the student's sandbox. It writes the snapshot to `/home/user/project` and starts `runner.mjs` as a background process.
4. `runner.mjs` calls `query()` and appends each SDK message to `events.ndjson` as one JSON line.
5. The route tails `events.ndjson` and streams the lines as SSE. Each line has a sequence number.
6. If the function ends before the run ends, the client reconnects with `from=<seq>`. The run continues in the sandbox.
7. At the end of the run, the runner compares the project folder with the snapshot and emits one `changes` event (path, op, content, size).
8. The client shows each change as a diff. The student accepts or rejects each one. Accepted changes go to the file store. The sandbox is reset from the browser copy at the next run.

### 4.2 Event protocol (server to client)
`{ seq, type, ... }` with these types:
`status` (starting, running, done, error) · `text` (assistant text) · `thinking` · `tool_use` (id, name, input summary) · `tool_result` (id, ok, short output) · `permission` (id, tool, input) · `changes` (list) · `usage` (input, output tokens) · `error` (code, message) · `done`.

### 4.3 Permissions
- Read-only tools (Read, Glob, Grep) run without a prompt.
- Edit and Write run inside the sandbox. They are safe because the browser is the source of truth. Changes still need approval at step 8.
- Bash runs in the sandbox. Default: ask. The student can allow it for the session. The request goes to the client as a `permission` event. The client answers with `POST /api/agent/permission`.
- Network from the sandbox is open (npm install needs it). The key is not in the sandbox, so exfiltration of the key is not possible.

### 4.4 LLM proxy (`/api/agent/llm/v1/messages`)
- Anthropic Messages format in, same out (streaming pass-through).
- Auth: `Authorization: Bearer <token>`. The token is an HMAC-signed value with user id, run id, expiry (15 minutes), and the combo list. Derived key from `ENCRYPTION_SECRET`.
- Upstream for provider `openrouter`: `https://openrouter.ai/api/v1/messages`. For `anthropic`: `https://api.anthropic.com/v1/messages`.
- Combo: if the upstream answers 429, 5xx, or a quota error before the first byte, the proxy tries the next entry. Round-robin mode starts at a rotating index.
- Usage (tokens) is read from the stream and saved in `agent_runs`. No charge.

### 4.5 Sandbox provider seam
`SandboxProvider` interface (`create`, `write files`, `start background command`, `read file from offset`, `kill`). `E2BProvider` is the first and only implementation. Tests use `FakeSandboxProvider`. This keeps a later move to Vercel Sandbox or Fly cheap.

### 4.6 Safety caps (no pricing needed)
One sandbox for each student. `AGENT_DAILY_MINUTES` (default 30). `AGENT_RUN_MAX_SECONDS` (default 600). `maxTurns` 40. Idle kill after 10 minutes. All values come from env.

## 5. UI

### 5.1 Panel layout (width 280 to 560 px)
```
+----------------------------------------+
| [Chat] [Claude Code]          [+ New]  |  header: tabs
+----------------------------------------+
| messages / agent timeline              |
|   Claude Code: tool cards, changes     |
+----------------------------------------+
| est. cost line (Chat) / run state (CC) |
| [ textarea                           ] |
| [Model v]  [Combo]        [Send/Stop]  |  composer: model selector at the BOTTOM
+----------------------------------------+
```
- The model selector moves from the header to the composer row. It grows to fit the width and truncates the name.
- Tabs use `role="tablist"`. Arrow keys switch tabs. Each tab keeps its own state when hidden (the panel never unmounts).
- Claude Code timeline: assistant text, tool cards (collapsed by default), a "Changes" card with per-file diff, Accept, Reject, Accept all.
- Models in the Claude Code tab: Anthropic models (with an Anthropic key) and OpenRouter models (with an OpenRouter key). Models without a key show "no key".
- OpenRouter model picker: searchable list, filter "Free only", price shown per model.
- Design rules: `docs/design-system.md`, semantic tokens only, 44 px touch targets on coarse pointers, Indic IME check on both composers.

### 5.2 Combos UI
A "Combo" button next to the model selector opens a small dialog: ordered list (drag or up/down), strategy (Priority or Round robin), name. Saved in `localStorage` (version 1). Selecting a combo replaces the single model. Chat and Claude Code both use it.

## 6. Data and API changes

### 6.1 Database (migration `00010`)
- `api_keys.provider` CHECK adds `'openrouter'`.
- New table `agent_runs` (id, user_id, project, provider, model, sandbox_seconds, input_tokens, output_tokens, status, created_at). RLS: the student reads own rows. Insert goes through the service role.

### 6.2 OpenRouter in Chat (provisional rate, pricing deferred)
- `GET /api/models/openrouter`: server fetch of `https://openrouter.ai/api/v1/models`, cached 10 minutes. Returns id, name, context length, prompt and completion price, `free` flag.
- Chat route: for provider `openrouter`, no `rate_config` row is needed. The rate comes from the OpenRouter price: `USD per token x OPENROUTER_USD_INR x OPENROUTER_MARGIN` to paise per 1k tokens, rounded up. Free models rate 0. Env defaults: `OPENROUTER_USD_INR=90`, `OPENROUTER_MARGIN=1`. These are placeholders until the owner sets pricing.
- Chat combos: request body gets optional `fallbacks: [{provider, model}]` (maximum 4). On a failure before the first chunk, the route tries the next entry. The hold is computed from the first entry and re-checked on switch.

### 6.3 New routes
`POST /api/agent/run` · `GET /api/agent/run?run=&from=` (reconnect) · `POST /api/agent/stop` · `POST /api/agent/permission` · `POST /api/agent/llm/v1/messages` · `GET /api/models/openrouter`.

### 6.4 Env
`E2B_API_KEY`, `AGENT_PUBLIC_URL` (public base for the proxy; tunnel in dev), `AGENT_KEY_MODE` (`proxy` default, `direct` for local dev only), `AGENT_DAILY_MINUTES`, `AGENT_RUN_MAX_SECONDS`, `OPENROUTER_USD_INR`, `OPENROUTER_MARGIN`.

## 7. Aftermath and risks

| Risk | Effect | Step |
|---|---|---|
| Free OpenRouter models are weak at tool calls | Agent loops or breaks | Show a "works best with strong models" note. Default list puts tool-capable models first. NOT CHECKED: which free models pass. |
| OpenRouter free limit (50 a day, 1000 with $10 credit) | Many 429 | Combos fall back. The message names the limit. |
| Claude Code is tuned for Anthropic models (OpenRouter docs say this) | Odd output with other models | Document it in the tab. |
| Sandbox cost with no pricing | Veda pays | Caps in 4.6. `agent_runs` records usage. |
| Vercel function limit | Stream cut | Run continues in the sandbox. Client reconnects with `from=seq`. |
| Proxy adds latency and a failure point | Slower tokens | Pass-through streaming, no buffering. |
| 5 MB snapshot upload on each run | Slow start | Hash-diff upload in a later step. |
| Agent SDK native binary in the sandbox image | Setup | Custom E2B template with the SDK installed. Needs the owner's E2B account. |
| Terms: Kiro, Antigravity style account reuse | Legal | Not used. Only API-key providers. |
| Existing Chat tests | Regression | Provider list tests updated. Full `npm test` before commit. |

## 8. Blockers (need the owner)

1. `E2B_API_KEY` and one build of the E2B template (`veda-claude-code`).
2. A public URL for the proxy in dev (a tunnel) or `AGENT_KEY_MODE=direct`.
3. An OpenRouter key to test live.
4. Decision on pricing (later).

Everything else is built and tested with fakes in this repo. The live E2B path is NOT CHECKED until the keys exist.

## 9. Left to the builder
Exact E2B SDK calls (check types after install). Exact Agent SDK message fields (check types after install). Visual polish inside the design system.
