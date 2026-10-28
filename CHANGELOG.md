# Changelog

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
