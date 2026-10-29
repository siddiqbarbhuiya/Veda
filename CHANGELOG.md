# Changelog

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
