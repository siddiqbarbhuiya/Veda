# Veda MVP

BYOK browser-based AI playground for Indian college students.
Next.js 16.4.3 App Router · Supabase · Tailwind 4 · Razorpay · WebContainers · Pyodide

## Commands

- `npm run dev` — start dev server (turbopack)
- `npm run build` — production build
- `npm test` — run all tests (`vitest run`, root = `src/`)
- `npx vitest run src/lib/billing/__tests__/hold.test.ts` — run one test file
- `npx tsc --noEmit` — type-check
- `npm run lint` — ESLint
- `npm run rotate-keys` — re-encrypt stored API keys after master-key rotation

## Architecture

- **Route groups:** `(auth)`, `(dashboard)`, `(ide)` — each has its own layout
- **API routes:** `src/app/api/` — keys, wallet (balance/topup/transactions), webhooks/razorpay, ai/chat
- **Libs:** `src/lib/` — supabase, crypto, billing, circuit-breaker, ai-providers, razorpay, persistence
- **Hooks:** `src/hooks/` — use-file-system, use-webcontainer, use-pyodide, use-ai-chat
- **Components:** `src/components/` — ide/, keys/, payments/

## Key Conventions

- `createServerClient()` is **async** (Next 16 async cookies) — always `await` it
- Service-role client: inline `createSupabaseServerClient` with `SUPABASE_SERVICE_ROLE_KEY`, not the anon client
- Path alias: `@/*` maps to `./src/*`
- Tailwind 4: no `tailwind.config.js` — uses `@tailwindcss/turbopack` loader in `next.config.ts`
- COOP/COEP headers on `/ide/:path*` for SharedArrayBuffer (WebContainers/Pyodide)
- AI chat route uses `runtime = "nodejs"` (not edge) — `node:crypto` needed for key decryption
- Billing uses **paise** (integer, 1 INR = 100 paise). Settlement caps cost at hold amount
- Razorpay env flag: `PAYMENT_MODE=simulator|live`
- IME composition check (`e.nativeEvent.isComposing`) on chat inputs for Indic script users

## Testing

- Framework: Vitest + jsdom + `@testing-library/react`
- `fake-indexeddb` for IndexedDB tests
- Tests live beside source: `__tests__/` dirs inside each module
- Supabase mocks: mock `@supabase/ssr` `createServerClient` — return a fake client with chainable query builder

## Environment Variables

See `docs/setup/environment.md` for the full list. Key vars:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client-side Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS
- `ENCRYPTION_SECRET` — 32-byte hex for AES-256-GCM key encryption
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `PAYMENT_MODE` — `simulator` or `live`

## Design skills (`.claude/skills/`)

Copied from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT). Design rules for this app are in `docs/design-system.md`.

- `ui-ux-pro-max` - styles, palettes, font pairs, UX rules and checklist. Use it before UI work.
- `design-system`, `ui-styling` - token architecture; Tailwind and shadcn/ui guidance (Veda uses Tailwind 4 without shadcn).
- `brand`, `design`, `slides`, `banner-design` - brand voice, logos, slides, banners.
- Their Python and Node scripts run only when the user allows it. `design` logo and icon scripts call paid AI image APIs with a key the user supplies. `ui-styling/scripts/shadcn_add.py` runs `npx shadcn`.
- Update by copying the folders again from the repo, then review the diff.
