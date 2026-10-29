# Claude Code Tab, OpenRouter and Combos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenRouter and combos to the AI chat, and a tab that runs the real Claude Code engine in a cloud sandbox, with the model selector at the bottom of the panel.

**Architecture:** A provider adapter for OpenRouter. A combo list with fallback in the chat route. A `SandboxProvider` seam with an E2B implementation runs `runner.mjs` (Claude Agent SDK). The browser streams events over SSE and applies accepted changes to the file store. A Veda LLM proxy keeps the real key out of the sandbox.

**Tech Stack:** Next.js 16 App Router, Supabase, Vitest, `@anthropic-ai/claude-agent-sdk` (runs in the sandbox only), `e2b`.

**Spec:** `docs/superpowers/specs/2026-10-29-claude-code-tab-design.md`

## Global Constraints

- Pricing is deferred. Do not charge for sandbox time. Record usage in `agent_runs` only.
- Safety caps: `AGENT_DAILY_MINUTES` default 30, `AGENT_RUN_MAX_SECONDS` default 600, `maxTurns` 40, one sandbox for each student, idle kill 10 minutes.
- The API key never enters the sandbox. The sandbox gets a token that expires in 15 minutes.
- The browser file store is the source of truth. Snapshot cap is 5 MB.
- Model selector sits in the composer row at the bottom of the panel.
- Semantic design tokens only. IME check (`e.nativeEvent.isComposing`) on every composer.
- `createServerClient()` is async. Use `await`.
- Commit locally. Do not push.

## Review Focus

- A model id with `/` and `:` (for example `meta-llama/llama-3.3-70b-instruct:free`) passes validation and reaches the adapter unchanged.
- A free OpenRouter model costs 0 paise and the hold is refunded in full.
- A combo whose first entry returns 429 before the first chunk falls to the second entry. After the first chunk, it does not switch.
- A run event stream that reconnects with `from=seq` returns no duplicate and no missing event.
- A change path with `..` or an absolute path is rejected on apply.
- A snapshot over 5 MB is rejected with a clear message.
- The proxy rejects an expired or altered token with 401 and never calls the upstream.

---

### Task 1: OpenRouter provider (keys, types, adapter)

**Files:**
- Modify: `src/lib/key-providers.ts`, `src/types/database.ts`, `src/lib/ai-providers/index.ts`, `src/app/api/keys/route.ts` (only if it lists providers), `src/components/dashboard/provider-icons.tsx`
- Create: `src/lib/ai-providers/openrouter.ts`, `supabase/migrations/00010_openrouter_and_agent_runs.sql`
- Test: `src/lib/ai-providers/__tests__/openrouter.test.ts`

**Interfaces:**
- Produces: `openrouterAdapter: ProviderAdapter`; `getProviderAdapter(provider: 'openai'|'gemini'|'anthropic'|'openrouter')`; `KEY_PROVIDERS` includes `{ value: 'openrouter', label: 'OpenRouter' }`.

- [ ] **Step 1: Write the failing test** `streams text, sends HTTP-Referer and X-Title headers, reads usage` and `throws ProviderError with status on 401` (mock `fetch`, as `openai.test.ts` does).
- [ ] **Step 2: Run** `npx vitest run src/lib/ai-providers/__tests__/openrouter.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `openrouterAdapter` against `https://openrouter.ai/api/v1/chat/completions` (OpenAI format, `stream_options.include_usage`, headers `HTTP-Referer` from `NEXT_PUBLIC_APP_URL`, `X-Title: Veda`). Reuse `readSSEData` and `throwProviderError`.
- [ ] **Step 4: Add `openrouter` to** `KEY_PROVIDERS`, `database.ts` unions, `getProviderAdapter`, icon map. Write migration: drop and re-add the `api_keys.provider` CHECK with `'openrouter'`; create `agent_runs` with RLS (select own rows).
- [ ] **Step 5: Run** `npx vitest run src/lib/ai-providers` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(ai): OpenRouter provider adapter and key support`.

### Task 2: OpenRouter model list and dynamic rate

**Files:**
- Create: `src/lib/openrouter/models.ts`, `src/app/api/models/openrouter/route.ts`
- Test: `src/lib/openrouter/__tests__/models.test.ts`

**Interfaces:**
- Produces: `type OpenRouterModel = { id: string; name: string; context_length: number; free: boolean; prompt_usd_per_token: number; completion_usd_per_token: number }`; `parseModels(json: unknown): OpenRouterModel[]`; `fetchOpenRouterModels(): Promise<OpenRouterModel[]>` (10 minute cache); `rateForModel(m: OpenRouterModel, env?: { usdInr?: number; margin?: number }): { input_paise_per_1k_tokens: number; output_paise_per_1k_tokens: number }`.

- [ ] **Step 1: Failing tests:** `parseModels drops entries without id`; `free is true when both prices are "0"`; `rateForModel returns 0/0 for a free model`; `rateForModel rounds up: 0.000003 USD/token at 90 INR gives 28 paise per 1k input` (0.000003 x 1000 x 90 x 100 = 27, ceil with margin 1 = 27).  Use exact expected `27`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the four exports. Route `GET` requires a signed-in user and returns `{ models }`.
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `feat(ai): OpenRouter model list and paise rate`.

### Task 3: Chat route accepts OpenRouter and combo fallback

**Files:**
- Create: `src/lib/combos.ts`
- Modify: `src/app/api/ai/chat/route.ts`
- Test: `src/lib/__tests__/combos.test.ts`, `src/app/api/ai/chat/__tests__/openrouter.test.ts`

**Interfaces:**
- Produces: `type ComboEntry = { provider: string; model: string }`; `type Combo = { id: string; name: string; strategy: 'priority' | 'round_robin'; entries: ComboEntry[] }`; `orderEntries(combo: Combo, counter: number): ComboEntry[]` (round robin rotates by `counter % length`); `isFallbackStatus(status: number): boolean` (429 and 5xx true; 400, 401, 403, 404 false).

- [ ] **Step 1: Failing tests:** `orderEntries priority keeps order`; `orderEntries round_robin rotates`; `isFallbackStatus`; chat route test `openrouter free model charges 0 paise` and `falls to the next entry on 429 before the first chunk`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `combos.ts`. In the route: add `openrouter` to `PROVIDERS` and `PROVIDER_LABEL`; for provider `openrouter`, take the rate from `fetchOpenRouterModels()` + `rateForModel` instead of `rate_config` (unknown model gives `model_unsupported`); accept optional body `fallbacks` (max 4 `ComboEntry`); loop entries around the first `generator.next()` only.
- [ ] **Step 4: Run** `npx vitest run src/app/api/ai src/lib/__tests__/combos.test.ts`. Expected: PASS. Run the full suite.
- [ ] **Step 5: Commit** `feat(ai): OpenRouter in chat and combo fallback`.

### Task 4: Chat panel tabs and bottom model selector

**Files:**
- Create: `src/components/ide/model-picker.tsx`, `src/components/ide/combo-dialog.tsx`, `src/components/ide/panel-tabs.tsx`, `src/lib/combo-storage.ts`
- Modify: `src/components/ide/chat-panel.tsx`, `src/components/ide/ide-layout.tsx` (aria label only), `src/hooks/use-ai-chat.ts` (pass `fallbacks`)
- Test: `src/components/ide/__tests__/model-picker.test.tsx`, `src/lib/__tests__/combo-storage.test.ts`

**Interfaces:**
- Produces: `<ModelPicker value onChange rates keyed openrouterModels />` (select in composer row, OpenRouter group with search and "Free only"); `readCombos(): Combo[]`, `writeCombos(c: Combo[]): void`, `readActiveCombo(): string | null`; `<PanelTabs tabs active onChange />` with `role="tablist"` and arrow keys.

- [ ] **Step 1: Failing tests:** `ModelPicker shows "(no key)" for a provider without a key`; `ModelPicker free filter hides paid OpenRouter models`; `readCombos returns [] when storage throws`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Header: `PanelTabs` (Chat, Claude Code) and the New chat button. Composer row: `ModelPicker`, Combo button, Send/Stop. Remove the `<Select>` from the header. Keep the IME check.
- [ ] **Step 4: Run tests and `npx tsc --noEmit`. Check the panel at 280 px and 560 px in the browser.**
- [ ] **Step 5: Commit** `feat(ide): panel tabs, bottom model picker, combos dialog`.

### Task 5: Agent core (protocol, token, sandbox seam, snapshot, runner)

**Files:**
- Create: `src/lib/agent/events.ts`, `src/lib/agent/token.ts`, `src/lib/agent/snapshot.ts`, `src/lib/agent/sandbox.ts`, `src/lib/agent/e2b-provider.ts`, `src/lib/agent/fake-provider.ts`, `src/lib/agent/runner-source.ts` (string of `runner.mjs`)
- Test: `src/lib/agent/__tests__/{token,snapshot,events}.test.ts`

**Interfaces:**
- Produces:
  - `type AgentEvent = { seq: number } & ({ type: 'status'; state: 'starting'|'running'|'done'|'error' } | { type: 'text'; text: string } | { type: 'thinking'; text: string } | { type: 'tool_use'; id: string; name: string; summary: string } | { type: 'tool_result'; id: string; ok: boolean; output: string } | { type: 'permission'; id: string; tool: string; summary: string } | { type: 'changes'; changes: FileChange[] } | { type: 'usage'; input_tokens: number; output_tokens: number } | { type: 'error'; code: string; message: string } | { type: 'done' })`
  - `type FileChange = { path: string; op: 'create'|'update'|'delete'; content?: string }`
  - `signAgentToken(p: { userId: string; runId: string; combo: ComboEntry[]; strategy: 'priority'|'round_robin'; ttlSeconds?: number }, secretHex: string, now?: number): string`; `verifyAgentToken(token: string, secretHex: string, now?: number): AgentTokenPayload | null`
  - `snapshotFiles(tree: FileNode[]): { files: Record<string,string>; bytes: number }` (throws `SnapshotTooLargeError` over 5 MB); `diffSnapshot(before: Record<string,string>, after: Record<string,string>): FileChange[]`; `isSafeRelPath(p: string): boolean`
  - `interface SandboxProvider { create(userId: string): Promise<SandboxHandle> }`; `interface SandboxHandle { id: string; writeFiles(files: Record<string,string>): Promise<void>; startRunner(env: Record<string,string>, input: RunnerInput): Promise<void>; readEvents(fromSeq: number): Promise<AgentEvent[]>; answerPermission(id: string, allow: boolean): Promise<void>; stop(): Promise<void>; kill(): Promise<void> }`

- [ ] **Step 1: Failing tests:** `verifyAgentToken rejects an expired token`; `verifyAgentToken rejects a changed payload`; `isSafeRelPath rejects "../x", "/etc/x", "a/../../b"`; `snapshotFiles throws over 5 MB`; `diffSnapshot returns create, update and delete`; `snapshotFiles skips node_modules`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** token (HMAC-SHA256 over base64url JSON; key = HMAC of `"veda-agent-token"` with `ENCRYPTION_SECRET`), snapshot helpers, the fake provider (scripted events), the E2B provider (write files, background `node runner.mjs`, read `events.ndjson` from offset, permission via a file `perm-<id>.json`), and the runner string: calls `query()` with `cwd`, `permissionMode: 'default'`, `canUseTool` that writes a `permission` event and waits for the answer file, `maxTurns: 40`, `env` with `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY=''`; maps SDK messages to events; at the end diffs the folder against the initial snapshot and writes `changes`.
- [ ] **Step 4: Run tests, expect PASS.** Install `e2b` and check its types with `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(agent): protocol, token, snapshot and sandbox seam`.

### Task 6: Agent routes and LLM proxy

**Files:**
- Create: `src/app/api/agent/run/route.ts`, `src/app/api/agent/stop/route.ts`, `src/app/api/agent/permission/route.ts`, `src/app/api/agent/llm/v1/messages/route.ts`, `src/lib/agent/limits.ts`, `src/lib/agent/provider.ts` (`getSandboxProvider()`)
- Test: `src/lib/agent/__tests__/limits.test.ts`, `src/app/api/agent/llm/__tests__/proxy.test.ts`

**Interfaces:**
- Consumes: Task 5 exports.
- Produces: `checkAgentLimits(used: { activeRuns: number; minutesToday: number }, env): { ok: true } | { ok: false; code: 'busy'|'daily_limit'; message: string }`; `POST /api/agent/run` body `{ project, prompt, files, model: ComboEntry, fallbacks?: ComboEntry[], strategy? }` returns SSE of `AgentEvent`; `GET /api/agent/run?run=&from=` reconnects.

- [ ] **Step 1: Failing tests:** `checkAgentLimits blocks a second active run`; `checkAgentLimits blocks over the daily minutes`; proxy `returns 401 for an expired token and does not call fetch`; proxy `tries the next combo entry on 429`; proxy `sends the real key upstream and never returns it`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Run route: auth, validate, `snapshotFiles`, `checkAgentLimits`, create sandbox, write files, sign token, `startRunner`, then tail events as SSE until `done` or `maxDuration` (300). Record `agent_runs`. Proxy: verify token, decrypt key for the chosen provider, forward body and stream with no buffering, fall back on `isFallbackStatus` before the first byte. `AGENT_KEY_MODE=direct` skips the proxy and passes the key (local dev only; log a warning).
- [ ] **Step 4: Run tests and the full suite. Expected: PASS.**
- [ ] **Step 5: Commit** `feat(agent): run, stop, permission routes and LLM proxy`.

### Task 7: Claude Code tab UI and change review

**Files:**
- Create: `src/hooks/use-agent.ts`, `src/components/ide/agent-panel.tsx`, `src/components/ide/agent-timeline.tsx`, `src/components/ide/changes-card.tsx`, `src/lib/agent/apply-changes.ts`
- Modify: `src/components/ide/chat-panel.tsx` (host the tab)
- Test: `src/lib/agent/__tests__/apply-changes.test.ts`, `src/hooks/__tests__/use-agent.test.ts`

**Interfaces:**
- Consumes: `useFileSystem()` (`createFile`, `updateFileContent`, `deleteFile`, `files`); Task 5 `AgentEvent`, `isSafeRelPath`.
- Produces: `applyChanges(changes: FileChange[], accepted: Set<string>, fs: Pick<FileSystemApi,'createFile'|'updateFileContent'|'deleteFile'>): { applied: string[]; skipped: string[] }`; `useAgent(): { events, state, send(prompt, choice), stop, answerPermission(id, allow), pendingChanges, acceptChange, rejectChange, acceptAll }`.

- [ ] **Step 1: Failing tests:** `applyChanges skips unsafe paths`; `applyChanges applies only accepted paths`; `useAgent reconnects with the last seq and drops duplicates`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Timeline renders text, tool cards (collapsed), permission prompts (Allow, Deny), a Changes card with per-file diff. State survives tab switches because the panel stays mounted.
- [ ] **Step 4: Run tests and `npx tsc --noEmit`. Check in the browser with the fake provider.**
- [ ] **Step 5: Commit** `feat(ide): Claude Code tab with change review`.

### Task 8: Docs, env and verification

**Files:**
- Modify: `docs/setup/environment.md`, `CLAUDE.md` (env and architecture lines), `CHANGELOG.md`, `docs/product/editor-prd.md` (status of 6a)
- Create: `docs/setup/claude-code-sandbox.md` (E2B account, template build, tunnel for dev)

- [ ] **Step 1: Write the docs** with every new env var, the template build steps and the dev tunnel steps.
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: all pass.
- [ ] **Step 3: Commit** `docs: Claude Code tab setup`.

## Self-review

- Spec coverage: 4.1 to 4.6 map to Tasks 5 and 6. 5.1 and 5.2 map to Tasks 4 and 7. 6.1 maps to Task 1. 6.2 maps to Tasks 2 and 3. 6.4 maps to Task 8. Pricing is deferred and has no task by design.
- Live E2B and live OpenRouter paths are not covered by tests. They need keys (spec section 8).
