# Environment Setup

## 1. Supabase project
1. Create a project at https://supabase.com.
2. Open Project Settings > API. Copy the project URL, the `anon` key and the `service_role` key.
3. Apply the SQL files in `supabase/migrations/` in order (SQL editor or `supabase db push`).
4. Optional: run `supabase/seed.sql` for the default rate table.

## 2. OAuth providers
**Google**
1. In Google Cloud Console, create an OAuth client (Web application).
2. Add the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, open Authentication > Providers > Google. Paste the client ID and secret.

**GitHub**
1. In GitHub, open Settings > Developer settings > OAuth Apps. Create an app.
2. Set the callback URL to `https://<project-ref>.supabase.co/auth/v1/callback`.
3. In Supabase, open Authentication > Providers > GitHub. Paste the client ID and secret.

In Authentication > URL Configuration, add `http://localhost:3000/auth/callback` as a redirect URL.

## 3. Razorpay (test mode)
1. Create an account at https://razorpay.com and stay in Test Mode.
2. Open Settings > API Keys. Generate a key pair.
3. Open Settings > Webhooks. Add the app webhook URL with the `payment.captured` event. Set a webhook secret.
4. For local work, set `PAYMENT_MODE=simulator`. Razorpay keys are then not needed.

## 4. Encryption secret
```bash
openssl rand -hex 32
```
Use the output as `ENCRYPTION_SECRET`. Keep it secret. If you lose it, stored API keys cannot be read.

## 5. Create `.env.local`
Copy `.env.example` to `.env.local` and fill all values.

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API > `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > `service_role` key. Server only. |
| `ENCRYPTION_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_SECRET_OLD` | Previous `ENCRYPTION_SECRET`. Set it only during key rotation. |
| `RAZORPAY_KEY_ID` | Razorpay > Settings > API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay > Settings > API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you set when you created the webhook |
| `PAYMENT_MODE` | `simulator` for local work. See `.env.example` for the other value. |
| `NEXT_PUBLIC_APP_URL` | App URL, for example `http://localhost:3000` |

## 6. Key rotation
1. Set `ENCRYPTION_SECRET_OLD` to the current secret.
2. Set `ENCRYPTION_SECRET` to a new value from `openssl rand -hex 32`.
3. Run `npm run rotate-keys`.
4. Check that the output shows `failed=0`. Then remove `ENCRYPTION_SECRET_OLD`.

The script runs with `npx tsx`. It does not load `.env.local` by itself. Export the variables in your shell first.
