# IndicSandbox

A BYOK AI coding playground for Indian college students. Code runs in the browser. Students bring their own AI keys and pay with UPI from ₹29.

## Features
- Browser IDE: Monaco, file tree, terminal. Node.js (WebContainers) and Python (Pyodide).
- AI chat with streaming and cost display.
- Encrypted API key storage (AES-256-GCM).
- UPI top-ups through Razorpay, with a simulator mode.
- Circuit breaker against runaway token costs.

## Tech stack
Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase (Auth, Postgres), Razorpay, Vitest.

## Quick start
1. Clone the repository.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill the values. See [docs/setup/environment.md](docs/setup/environment.md).
4. Apply the SQL files in `supabase/migrations/` to your Supabase project.
5. Run `npm run dev`.
6. Open http://localhost:3000.

## Scripts
- `npm run dev` - start the dev server.
- `npm test` - run the tests.
- `npm run rotate-keys` - re-encrypt stored keys after you change `ENCRYPTION_SECRET`.

## Docs
- [Environment setup](docs/setup/environment.md)
- [Design specification](docs/specs/2026-10-29-indicsandbox-mvp-design.md)

## License
TBD.
