# Changelog

## Unreleased - Claude Code tab, OpenRouter and combos (2026-10-29)

### Bring your own OmniRoute
- Every user can save the address and key of **their own** OmniRoute (Dashboard, Keys). Their combos show in the model list under
  "OmniRoute combos". Chat and Claude Code send requests there. Veda does not price it. Guide: `docs/setup/omniroute.md`.
- The address is checked: https and public hosts only in production, no redirects, a host lookup before each request.
  Development also allows `http://localhost`. New migration: `00011`.
- Mic button, real local engine (`AGENT_SANDBOX=local`), permission modes, attachments and `/compact` (see earlier entries).

### AI panel
- Two tabs: **Chat** and **Claude Code**. The model selector moved from the panel top to the message row at the bottom.
- The model picker is searchable and has a "Free only" filter. It lists every OpenRouter model.
- Combos: an ordered list of models with priority or round-robin order. A limit (429) or a server error before the
  first text moves on to the next model. Chat and Claude Code both use them.

### Providers
- OpenRouter: new provider (`src/lib/ai-providers/openrouter.ts`), key type, model list at `/api/models/openrouter`,
  and a provisional paise rate from the OpenRouter price (`OPENROUTER_USD_INR`, `OPENROUTER_MARGIN`). Free models cost 0 paise.

### Claude Code tab
- The real Claude Code engine (Claude Agent SDK) runs in an E2B sandbox. Files from the browser go in. File changes come
  back as diffs. The student accepts or rejects each file. Bash needs approval.
- The API key never enters the sandbox. The sandbox holds a signed token and calls the Veda LLM proxy
  (`/api/agent/llm/v1/messages`), which adds the key and applies the combo.
- Safety caps: one run for each student, `AGENT_DAILY_MINUTES`, `AGENT_RUN_MAX_SECONDS`, 10 minute idle stop.
- Usage is recorded in `agent_runs`. Nothing is charged yet (`docs/product/pricing-later.md`).
- Setup: `docs/setup/claude-code-sandbox.md`. New package: `e2b`. New migration: `00010`.

## Unreleased - UI/UX redesign (2026-10-29)

### Design system
- Dark-first theme with a fully designed light theme. Tokens in `src/app/globals.css`. Guide in `docs/design-system.md`.
- Fonts: Inter, Space Grotesk, JetBrains Mono, with Noto Sans fallbacks for Hindi, Bengali and Tamil.
- Base components in `src/components/ui/`. Icons from `lucide-react`. Theme toggle with no flash on load.
- New packages: `lucide-react`, `react-resizable-panels`, `cmdk`.

### Screens
- Landing page: hero with IDE preview, feature grid, pricing in INR, FAQ.
- Login and dashboard: wallet card, selectable top-up packs, key manager, transactions, loading and error states.
- IDE: activity bar, resizable panels (saved layout), editor tabs and breadcrumbs, command palette (Ctrl+K),
  status bar, themed Monaco and xterm, AI chat with code blocks and copy button.
- IDE panels talk through window events (`src/components/ide/ide-events.ts`).
- Small screens show a notice instead of a broken IDE.

### Export
- Export project as ZIP: toolbar button and command palette. Includes editor files, files made by the Node.js runtime and,
  as an option, `node_modules`. Library: `src/lib/export/zip.ts` (tested). New package: `fflate`.

### Fixes
- The IDE settings link now goes to `/dashboard`. It pointed to a page that does not exist.
- Top-up dialog uses a native `<dialog>`: focus trap, Escape key and focus restore.

## 1.0.0 - MVP release (2026-10-29)

### Authentication
- Google and GitHub sign-in with Supabase Auth.
- Row Level Security on all tables. Profile created by trigger.

### Browser IDE
- Monaco editor, file tree and xterm.js terminal.
- Node.js runtime with WebContainers. Python runtime with Pyodide.
- File persistence in IndexedDB.

### AI chat
- Chat panel with SSE streaming and model selector.
- Server-side proxy for OpenAI, Gemini and Anthropic.
- Cost estimate and cost display in rupees.

### Key management (BYOK)
- AES-256-GCM encryption of API keys at rest.
- Dashboard to add, list and delete keys.
- Key rotation script: `npm run rotate-keys`.

### Wallet and payments
- Integer paise ledger. Topup packs from ₹29.
- Razorpay UPI checkout with webhook. Simulator mode for development.
- Atomic pre-authorization hold. Replay protection by payment ID.

### Safety
- Circuit breaker that limits request rate.

### Site
- Landing page and 404 page.
