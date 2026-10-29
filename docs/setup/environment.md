# Environment Setup

This guide takes you from an empty computer to a running Veda app on `http://localhost:3000`.
Follow the steps in order. Do not skip a step. Each step names the exact page to open.

Time needed: about 45 minutes.

> **Never commit secrets.** The files `.env.local` and `.playwright-mcp/` are in `.gitignore`.
> Never paste a secret key in a chat, an issue, a pull request or a screenshot.

## Contents

1. [What you need](#1-what-you-need)
2. [Get the code](#2-get-the-code)
3. [Create the Supabase project](#3-create-the-supabase-project)
4. [Copy the Supabase keys](#4-copy-the-supabase-keys)
5. [Create the database tables](#5-create-the-database-tables)
6. [Check the database](#6-check-the-database)
7. [Fill the price table](#7-fill-the-price-table)
8. [Make the encryption secret](#8-make-the-encryption-secret)
9. [Set up GitHub login](#9-set-up-github-login)
10. [Set up Google login (optional)](#10-set-up-google-login-optional)
11. [Set the redirect URLs](#11-set-the-redirect-urls)
12. [Set up Razorpay (optional)](#12-set-up-razorpay-optional)
13. [Create `.env.local`](#13-create-envlocal)
14. [Start the app and test login](#14-start-the-app-and-test-login)
15. [Optional: MCP servers for Claude Code](#15-optional-mcp-servers-for-claude-code)
16. [Where to find each value later](#16-where-to-find-each-value-later)
17. [Deploy to Vercel (optional)](#17-deploy-to-vercel-optional)
18. [Key rotation](#18-key-rotation)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. What you need

| Item | How to check | Where to get it |
|---|---|---|
| Node.js 20.9 or newer (Next.js 16 requirement) | Run `node -v` | https://nodejs.org |
| Git | Run `git --version` | https://git-scm.com |
| A GitHub account | Open https://github.com | https://github.com/signup |
| A Supabase account | Open https://supabase.com/dashboard | Click **Sign in with GitHub** |

## 2. Get the code

1. Open a terminal.
2. Run `git clone https://github.com/siddiqbarbhuiya/Veda.git`
3. Run `cd Veda`
4. Run `npm install`
5. Make sure the command ends with no red error text.

## 3. Create the Supabase project

1. Open https://supabase.com/dashboard.
2. Click **New project**.
3. Choose an organization.
4. Enter the name `Veda`.
5. Enter a database password. Save it in a password manager.
6. Choose the region that is nearest to your users (for India, choose **Mumbai**).
7. Click **Create new project**. Wait 1 to 2 minutes.

Your **project reference** is the 20-letter code in the dashboard address:
`https://supabase.com/dashboard/project/<project-ref>`.
This guide writes `<project-ref>` for it.

## 4. Copy the Supabase keys

1. Open `https://supabase.com/dashboard/project/<project-ref>/settings/api-keys`
   (menu path: **Project Settings** > **API Keys**. Older dashboards use `.../settings/api`).
2. Find the **Project URL**. It looks like `https://<project-ref>.supabase.co`.
3. Find the **anon** key (a long text that starts with `eyJ`).
   If you only see the tab **Legacy API keys**, open it to find the `anon` key.
4. Find the **secret** key (a text that starts with `sb_secret_`).
   You can also use the legacy `service_role` key.
5. Keep this page open. You use these values in [step 13](#13-create-envlocal).

How the app uses each key:

| Key | Used in | Who can see it |
|---|---|---|
| anon key | The browser | Everyone. It is safe to expose. |
| secret key (or `service_role`) | The server only | Nobody. It skips all row security. |

> **CAUTION:** Never put the secret key in a variable that starts with `NEXT_PUBLIC_`.
> The browser would then expose it.

## 5. Create the database tables

The folder `supabase/migrations/` has 9 SQL files. Run them in order, one by one.

1. Open `https://supabase.com/dashboard/project/<project-ref>/sql/new`.
2. Open the file `supabase/migrations/00001_create_profiles.sql` in your code editor.
3. Copy all the text.
4. Paste it in the Supabase SQL Editor.
5. Click **Run**.
6. Make sure the result shows **Success**.
7. Do steps 2 to 6 again for each file, in this order:

| Order | File | What it creates |
|---|---|---|
| 1 | `00001_create_profiles.sql` | `profiles` table (user and wallet balance) |
| 2 | `00002_create_api_keys.sql` | `api_keys` table (encrypted user keys) |
| 3 | `00003_create_transactions.sql` | `transactions` table (top-ups and usage) |
| 4 | `00004_create_rate_config.sql` | `rate_config` table (price for each model) |
| 5 | `00005_create_circuit_breaker_log.sql` | `circuit_breaker_log` table (request limit) |
| 6 | `00006_create_profile_trigger.sql` | Trigger that makes a profile for each new user |
| 7 | `00007_create_cleanup_cron.sql` | Job that deletes old circuit breaker rows |
| 8 | `00008_restrict_profiles_update.sql` | Blocks users from editing their own balance |
| 9 | `00009_create_projects.sql` | `projects` table: cloud copy of each student's files (5 MB limit, 20 projects per student, row level security) |

### Two things that surprise beginners

- **File 7 needs the `pg_cron` extension.** If the run fails, open
  `https://supabase.com/dashboard/project/<project-ref>/database/extensions`,
  search for `pg_cron`, turn it on, then run file 7 again.
- **File 8 shows the warning "Potential issue detected".** Supabase shows this
  warning for every query that has `DROP` or `REVOKE`. File 8 only replaces one
  policy on `profiles`. It deletes no data. Click **Run query**.

> **CAUTION:** Keep the order. Files 2 to 5 need the `profiles` table from file 1.

## 6. Check the database

Run this query in the SQL Editor. It lists everything that the migration files must create.

```sql
select * from (
  select 'table' as kind, table_name::text as name, '' as detail
  from information_schema.tables
  where table_schema = 'public'
  union all
  select 'rls', c.relname::text, c.relrowsecurity::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'policy', tablename::text, policyname::text || ' / ' || cmd::text
  from pg_policies
  where schemaname = 'public'
  union all
  select 'trigger', tgname::text, tgrelid::regclass::text
  from pg_trigger
  where tgname = 'on_auth_user_created'
  union all
  select 'cron', jobname::text, schedule::text
  from cron.job
  union all
  select 'update_grant', column_name::text, grantee::text
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles'
    and grantee = 'authenticated' and privilege_type = 'UPDATE'
) t
order by kind, name;
```

The result must show:

| kind | Expected rows |
|---|---|
| table | `profiles`, `api_keys`, `transactions`, `rate_config`, `circuit_breaker_log` |
| rls | `true` for all 5 tables |
| policy | 2 on `api_keys`, 2 on `profiles`, 1 on `rate_config`, 1 on `transactions` |
| trigger | `on_auth_user_created` on `auth.users` |
| cron | `cleanup-circuit-breaker` with `*/5 * * * *` |
| update_grant | `display_name`, `email`, `updated_at` only. `balance_paise` must not show. |

If a row is missing, run the matching migration file again.

## 7. Fill the price table

The AI chat refuses a model that is not in `rate_config`.

1. Open `https://supabase.com/dashboard/project/<project-ref>/sql/new`.
2. Copy all the text of `supabase/seed.sql`.
3. Paste it in the SQL Editor. Click **Run**.
4. Run `select provider, model from rate_config order by provider, model;`
5. Make sure the result has 6 rows.

It is safe to run the seed two times. It uses `ON CONFLICT DO NOTHING`.

## 8. Make the encryption secret

The app encrypts each saved API key with AES-256-GCM. The secret is a 64-character hex text.

1. Run this command in a terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Copy the output.
3. Use it as `ENCRYPTION_SECRET` in [step 13](#13-create-envlocal).

> **CAUTION:** Do not change `ENCRYPTION_SECRET` after users save API keys.
> The old keys cannot be read with a new secret. To change it, follow
> [Key rotation](#18-key-rotation).
> Back up the secret in a password manager.

`ENCRYPTION_SECRET_OLD` is only for key rotation. Leave it empty now.

## 9. Set up GitHub login

You make two things: a GitHub OAuth app, and a switch in Supabase.

### 9a. Make the GitHub OAuth app

1. Open https://github.com/settings/applications/new
   (path: GitHub > profile picture > **Settings** > **Developer settings** > **OAuth Apps** > **New OAuth App**).
2. Enter these values:

   | Field | Value |
   |---|---|
   | Application name | `Veda (local dev)` |
   | Homepage URL | `http://localhost:3000` |
   | Application description | Leave empty |
   | Redirect URI (Authorization callback URL) | `https://<project-ref>.supabase.co/auth/v1/callback` |

3. Click **Register application**.
4. Copy the **Client ID** from the next page.
5. Click **Generate a new client secret**.
6. Copy the secret now. GitHub shows it one time only.
   If you lose it, click **Generate a new client secret** again.

> **Important:** The callback URL points to Supabase, not to `localhost`.
> Supabase receives the answer from GitHub. Then Supabase sends the user to your app.

### 9b. Turn on GitHub in Supabase

1. Open `https://supabase.com/dashboard/project/<project-ref>/auth/providers`.
2. Scroll to **Auth Providers**. Click **GitHub**. A panel opens on the right.
3. Turn on **GitHub enabled**.
4. Paste the **Client ID**.
5. Paste the **Client Secret**.
6. Click **Save**.
7. Make sure the list now shows **GitHub Enabled**.

### 9c. Save the values

Save the Client ID and the Client Secret in `.env.local`
(see [step 13](#13-create-envlocal)). The app does not read them.
They are your record. GitHub never shows the secret again.

## 10. Set up Google login (optional)

The login page also has a Google button. It works only after this setup.

### 10a. Make the Google OAuth client

1. Open https://console.cloud.google.com and sign in with your Google account.
2. Choose a project (menu at the top left). A new account has "My First Project". You can use it.
3. Open `https://console.cloud.google.com/auth/clients/create?project=<google-project-id>`
   (menu path: **Google Auth Platform** > **Clients** > **Create client**).
   If Google asks you to set up the consent screen first, choose **External**, enter the app name `Veda` and your email, and save.
4. In **Application type**, choose **Web application**.
5. In **Name**, enter `Veda (Supabase Auth)`.
6. Under **Authorised redirect URIs**, click **Add URI**. Enter `https://<project-ref>.supabase.co/auth/v1/callback`.
   Leave **Authorised JavaScript origins** empty. Supabase does the exchange on the server.
7. Click **Create**.
8. Copy the **Client ID** and the **Client secret** from the dialog.
   Google does not show the secret again after you click **OK**.
9. Save both values in `.env.local` (step 13).

### 10b. Turn on Google in Supabase

1. Open `https://supabase.com/dashboard/project/<project-ref>/auth/providers`.
2. Click **Google**. A panel opens on the right.
3. Turn on **Enable Sign in with Google**.
4. Paste the Client ID in **Client IDs**.
5. Paste the secret in **Client Secret (for OAuth)**.
6. Click **Save**. Make sure the list shows **Google Enabled**.

### 10c. Test

1. Open http://localhost:3000/login. Click **Sign in with Google**.
2. Make sure Google shows the account chooser for the app.
3. While the consent screen is in **Testing** mode, only the test users that you add
   under **Google Auth Platform** > **Audience** can sign in.

## 11. Set the redirect URLs

1. Open `https://supabase.com/dashboard/project/<project-ref>/auth/url-configuration`.
2. Make sure **Site URL** is `http://localhost:3000`.
3. Under **Redirect URLs**, click **Add URL**.
4. Enter `http://localhost:3000/**`. Click **Save URLs**.
5. If the dialog says "URL already exists in the allow list", the step is done. Close the dialog.

The app sends users to `http://localhost:3000/auth/callback` after login
(file `src/app/(auth)/login/page.tsx`). The `/**` rule allows that path.

> **For production:** Add your real domain to **Site URL** and **Redirect URLs**.
> Make a second GitHub OAuth app for production. Do not reuse the local one.

## 12. Set up Razorpay (optional)

Razorpay takes UPI top-ups. For local work, skip this step. Set `PAYMENT_MODE=simulator`
in [step 13](#13-create-envlocal). The Razorpay keys are then not needed.

### 12a. Get the test API keys

1. Open https://dashboard.razorpay.com and sign in with your phone number or email.
   Razorpay sends an OTP. Type it in the six boxes. Click **Verify**.
2. Razorpay may open an onboarding page that asks for your personal PAN and business details.
   This is KYC for **live** payments. You do not need it for test keys. Do not fill it for local work.
3. In the left menu (bottom), click **Get Test API Keys**.
4. A dialog shows the **Test API Key** (`rzp_test_...`). The secret is hidden.
   Razorpay shows a secret one time only. If a key already exists, the only button is **Regenerate**.
5. Click **Regenerate**. The old key stops working at once. Do this only if no other project uses the old key.
6. Copy the **Test API Key** and the **Test Key Secret**. Click **Close**.
7. Put them in `.env.local` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (step 13).

### 12b. Webhook (only when the app has a public URL)

Razorpay calls the webhook from the internet. It cannot reach `http://localhost:3000`.
Do this step after you deploy, or when you use a tunnel (for example `ngrok http 3000`).

1. Open **Settings** > **Webhooks** > **Add New Webhook**.
2. Enter the URL `https://<your-public-domain>/api/webhooks/razorpay`.
3. Enter a webhook secret. Save the same value in `RAZORPAY_WEBHOOK_SECRET`.
4. Select the event `payment.captured`. Click **Create Webhook**.

### 12c. Payment mode

| `PAYMENT_MODE` | Meaning | When to use |
|---|---|---|
| `simulator` | The app fakes a successful payment. No Razorpay call. | Local work |
| `live` | The app calls Razorpay with your keys. | After the webhook works |

Keep `simulator` until the webhook in step 12b works.

### 12d. Test the payment flow (no Razorpay account needed)

**Simulator test (local, `PAYMENT_MODE=simulator`):**

1. Open http://localhost:3000/dashboard and sign in. Note the wallet amount.
2. Click **Add Credits**. Click a pack (**Starter** ₹29, **Standard** ₹49, **Value** ₹99).
3. Make sure the dialog shows **Credits added!** and the wallet goes up.
   The **Value** pack adds ₹109 (10900 paise): ₹99 plus a ₹10 bonus.
4. In the Supabase SQL Editor, run
   `select type, amount_paise, balance_after_paise, description from public.transactions order by created_at desc limit 5;`
   Make sure the newest row has the description `Wallet top-up (simulator)`.

Result on 2026-10-29: the Value pack took the balance from 1000 to 11900 paise. The `transactions` row matched.

**Negative tests:**

| Test | Expected result |
|---|---|
| `POST /api/wallet/topup` with `{"amount_paise": 100}` | `400` "amount_paise must be one of: 2900, 4900, 9900" |
| `POST /api/wallet/topup` with a broken JSON body | `400` "Invalid JSON body" |
| A signed-in user runs `update profiles set balance_paise = ...` | `permission denied for table profiles` |

**Webhook handler test (signed fake events):** send `POST /api/webhooks/razorpay` with the header
`x-razorpay-signature` set to the hex HMAC-SHA256 of the raw body, made with `RAZORPAY_WEBHOOK_SECRET`.
The body is `{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_X","order_id":"order_X","amount":2900,"notes":{"user_id":"<profile id>"}}}}}`.

| Case | Expected result |
|---|---|
| No signature, or a wrong signature | `400` "Invalid signature" |
| A different event, for example `payment.failed` | `200`, no credit |
| `amount` that is not 2900, 4900 or 9900 | `400` "Invalid payment payload" |
| A valid `payment.captured` | `200`, the balance goes up, one `transactions` row with the payment id |
| The same event sent again | `200`, **no** second credit (the `razorpay_payment_id` is unique) |

Result on 2026-10-29: all 6 cases matched. The balance went from 11900 to 14800 paise, and the replay added no second row.

## 13. Create `.env.local`

1. Run `cp .env.example .env.local` (on Windows PowerShell: `Copy-Item .env.example .env.local`).
2. Open `.env.local`. Fill these values:

| Variable | Value | From |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | [Step 4](#4-copy-the-supabase-keys) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The `anon` key | [Step 4](#4-copy-the-supabase-keys) |
| `SUPABASE_SERVICE_ROLE_KEY` | The secret key (`sb_secret_...`) or the legacy `service_role` key | [Step 4](#4-copy-the-supabase-keys) |
| `ENCRYPTION_SECRET` | 64 hex characters | [Step 8](#8-make-the-encryption-secret) |
| `ENCRYPTION_SECRET_OLD` | Empty | Key rotation only |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID | [Step 9a](#9a-make-the-github-oauth-app) |
| `GITHUB_OAUTH_CLIENT_SECRET` | Client secret | [Step 9a](#9a-make-the-github-oauth-app) |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID | [Step 10a](#10a-make-the-google-oauth-client) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret | [Step 10a](#10a-make-the-google-oauth-client) |
| `RAZORPAY_KEY_ID` | Test API Key (`rzp_test_...`) | [Step 12a](#12a-get-the-test-api-keys). Sample value is fine in simulator mode. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Same value as `RAZORPAY_KEY_ID` | The browser checkout needs it. Without it, live mode shows "Could not start checkout". The key ID is public. The secret is not. |
| `RAZORPAY_KEY_SECRET` | Test Key Secret | [Step 12a](#12a-get-the-test-api-keys). Sample value is fine in simulator mode. |
| `RAZORPAY_WEBHOOK_SECRET` | Your own webhook secret | [Step 12b](#12b-webhook-only-when-the-app-has-a-public-url). Keep the sample value until then. |
| `PAYMENT_MODE` | `simulator` | Use `live` only with real Razorpay keys |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Your app address |

3. Save the file.
4. Run `git status`. Make sure `.env.local` does not show in the list.

## 14. Start the app and test login

1. Run `npm run dev`.
2. Open http://localhost:3000.
3. Click **Sign in** (top right). The browser opens `/login`.
4. Click **Sign in with GitHub**.
5. Click **Authorize** on the GitHub page.
6. The browser returns to your app through `/auth/callback`.
7. Open `https://supabase.com/dashboard/project/<project-ref>/editor`. Open the table `profiles`.
8. Make sure a new row shows for you with `balance_paise` of `1000` (₹10 of free credit).

If a step fails, see [Troubleshooting](#19-troubleshooting).

## 15. Optional: MCP servers for Claude Code

MCP servers let Claude Code work with Supabase and a browser. The file `.mcp.json`
in the project root lists them. Claude Code reads it when you open the project.

| Server | Type | What it does |
|---|---|---|
| `supabase` | HTTP | Reads tables, advisors, logs and docs of the Veda Supabase project |
| `playwright` | Local (`npx @playwright/mcp@latest`) | Opens a real browser so Claude can do dashboard steps for you |

### First use

1. Open the project in Claude Code.
2. Claude Code asks you to approve each project server. Approve them.
3. For the Supabase server, a browser window opens. Log in to Supabase and allow access.

### Add the Supabase server by hand

Run this command in the project folder. Use your own `<project-ref>`:

```bash
claude mcp add --scope project --transport http supabase \
  "https://mcp.supabase.com/mcp?project_ref=<project-ref>&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
```

### Add the Playwright server by hand

```bash
claude mcp add --scope project playwright -- npx -y @playwright/mcp@latest
```

### What the Supabase MCP cannot do

- It shows the **publishable** keys. It does not show the **secret** key. Copy that key yourself ([step 4](#4-copy-the-supabase-keys)).
- Tools that change the database (`apply_migration`, `execute_sql`) can be blocked by your
  permission mode. Run the SQL files by hand ([step 5](#5-create-the-database-tables)),
  or allow the tools with `/permissions` in Claude Code.

### How a Playwright session works

1. Claude opens a browser window.
2. You log in yourself. Claude never needs your password.
3. Claude then clicks through the pages and fills the forms.

> **CAUTION:** Playwright saves page snapshots in `.playwright-mcp/`. A snapshot can hold a
> secret that was on the page (for example a new GitHub client secret). This folder is in
> `.gitignore`. Delete the folder after a session that showed a secret.

## 16. Where to find each value later

| Value | Where to find it again |
|---|---|
| Supabase URL, anon key, secret key | `https://supabase.com/dashboard/project/<project-ref>/settings/api-keys` |
| Database password | Your password manager. Reset: `.../database/settings` |
| GitHub Client ID | `https://github.com/settings/developers` > your app |
| GitHub Client Secret | GitHub never shows it again. Click **Generate a new client secret**. Then update Supabase and `.env.local`. |
| `ENCRYPTION_SECRET` | Only your backup. If lost, stored user API keys are lost. |
| Vercel Project ID (`VERCEL_PROJECT_ID`) | `https://vercel.com/<team>/<project>/settings` > **Project ID** |
| Vercel Team ID (`VERCEL_ORG_ID`) | `https://vercel.com/<team>/~/settings` > **Team ID** |
| Vercel token (`VERCEL_TOKEN`) | Not needed for the dashboard deploy. For the CLI or CI, make one at `https://vercel.com/account/tokens`. Vercel shows it one time only. |
| Vercel environment variables | `https://vercel.com/<team>/<project>/settings/environment-variables`. They are copies of `.env.local`. Vercel does not show secret values again. |
| Razorpay Key ID | Razorpay dashboard > **Get Test API Keys** (test) or **Settings** > **API Keys** (live) |
| Razorpay Key Secret | Razorpay never shows it again. Click **Regenerate**. Then update `.env.local`. The old key stops working. |
| Google Client ID | `https://console.cloud.google.com/auth/clients?project=<google-project-id>` > your client |
| Google Client Secret | Open the client in the same page. Add a new secret. Then update Supabase and `.env.local`. |

## 17. Deploy to Vercel (optional)

A public site gives you the HTTPS address that the Razorpay webhook needs.

### 17a. Import the project

1. Open https://vercel.com/new and sign in. Choose **Continue with GitHub**. Click **Authorize Vercel**.
2. Vercel may offer 2FA setup. You can skip it now. Set it up later in your Vercel account settings.
3. In **Import Git Repository**, enter `https://github.com/<your-user>/Veda` in the box at the top. Press Enter.
4. Check: **Application Preset** is `Next.js`. **Root Directory** is `./`. **Project Name** is `veda`.

### 17b. Add the environment variables

1. Click **Environment Variables** to open the section.
2. Click the first name field. Paste the block below with Ctrl+V. Vercel splits it into rows.
3. Make sure the list shows 10 rows.

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_SECRET=...
RAZORPAY_KEY_ID=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
PAYMENT_MODE=live
NEXT_PUBLIC_APP_URL=https://<your-vercel-address>
```

Take the values from your `.env.local`. Do not copy the OAuth lines (`GITHUB_OAUTH_*`, `GOOGLE_OAUTH_*`).
Supabase holds those.

> **CAUTION:** Use `PAYMENT_MODE=live` on a public site. With `simulator`, anyone can add free balance.
> `live` with Razorpay **test** keys charges no real money.

### 17c. Deploy

1. Click **Deploy**. Wait 1 to 3 minutes.
2. Open the site address that Vercel shows.
3. If the build fails, read the last red lines in the build log and fix that error first.

### 17d. Tell Supabase about the new address

1. Open `https://supabase.com/dashboard/project/<project-ref>/auth/url-configuration`.
2. Set **Site URL** to `https://<your-vercel-address>`.
3. Under **Redirect URLs**, click **Add URL**. Enter `https://<your-vercel-address>/**`. Keep the `http://localhost:3000/**` line.
4. Click **Save URLs**.
5. If your Vercel address differs from the `NEXT_PUBLIC_APP_URL` value, change that variable in
   Vercel (**Settings** > **Environment Variables**). Then click **Redeploy**.

The GitHub and Google apps need no change. Their callback URL points to Supabase.

### 17e. Create the Razorpay webhook

1. Open https://dashboard.razorpay.com. Turn on **Test Mode**.
2. Open **Settings** > **Webhooks** > **Add New Webhook**.
3. Enter the URL `https://<your-vercel-address>/api/webhooks/razorpay`.
4. Enter the same secret as `RAZORPAY_WEBHOOK_SECRET`.
5. Select the event `payment.captured`. Click **Create Webhook**.

### 17f. Test

1. Open the live site. Click **Sign in with GitHub**. Make sure you reach `/ide`.
2. Open the wallet. Buy the smallest pack with a Razorpay test card or test UPI ID.
3. Make sure the balance goes up in the app and a row shows in the `transactions` table.

### 17g. Database table `projects` and legal pages

1. The cloud sync needs the table `projects` (migration `00009`). It is applied to the live database on 2026-10-29. Apply it to any new database in step 5.
2. The pages `/terms`, `/privacy` and `/refund` hold placeholders for the owner name, address, contact email and grievance officer. Fill them in. A lawyer must review the pages before the launch.
3. `PAYMENT_MODE=simulator` is refused in production. Set `PAYMENT_MODE=live` on Vercel before real payments.

### 17h. Changes from the full UI audit (2026-10-29)

- Billing: a failed AI call settles at 0 paise. The webhook finds the user through the Razorpay order.
- Files: names are checked, the tree keeps its state, and the project saves to IndexedDB and the cloud (newest edit wins).
- IDE: the Run button, shortcuts, palette, terminal, chat error messages and the Add Credits link work as one set.
- Site: new `error`, `not-found`, `robots`, `sitemap`, `manifest` and icon files, and the legal pages.
- Known gaps: runtime-to-editor file sync, a Python worker, IndexedDB `blocked` handling, the `middleware` to `proxy` rename, and a WebContainer API commercial licence.

## 18. Key rotation

Do this only when you must change `ENCRYPTION_SECRET` (for example, after a leak).
The script `scripts/rotate-keys.ts` decrypts each saved API key with the old secret.
Then it encrypts the key again with the new secret.

1. Copy the current `ENCRYPTION_SECRET` value to `ENCRYPTION_SECRET_OLD`.
2. Make a new secret (see [step 8](#8-make-the-encryption-secret)). Put it in `ENCRYPTION_SECRET`.
3. Export the variables in your shell. The script does not load `.env.local` by itself.
4. Run `npm run rotate-keys`.
5. Make sure the output shows `failed=0`.
6. Remove the value of `ENCRYPTION_SECRET_OLD`.

## 19. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `relation "profiles" does not exist` | You skipped migration 1 | Run the files in order |
| `extension "pg_cron" is not available` | `pg_cron` is off | Turn it on in **Database** > **Extensions**. Run file 7 again. |
| Query `cron.job` fails in step 6 | `pg_cron` is off | Same fix as above |
| "Potential issue detected" when you run file 8 | Supabase warns about `DROP` and `REVOKE` | Click **Run query**. It is safe. |
| GitHub login shows `redirect_uri_mismatch` | The GitHub callback URL is wrong | In the GitHub app, set the callback URL to `https://<project-ref>.supabase.co/auth/v1/callback` |
| After login, the browser shows an error or goes to the wrong page | Redirect URL is not in the allow list | Do [step 11](#11-set-the-redirect-urls) |
| `Unsupported provider: provider is not enabled` | GitHub (or Google) is off in Supabase | Do [step 9b](#9b-turn-on-github-in-supabase) |
| No row in `profiles` after login | Migration 6 (trigger) is missing | Run `00006_create_profile_trigger.sql`. Log in again with a new user. |
| AI chat returns 400 "model not found" | `rate_config` is empty | Do [step 7](#7-fill-the-price-table) |
| Saved API key cannot be read | `ENCRYPTION_SECRET` changed | Put back the old value, or use key rotation |
| `.env.local` shows in `git status` | Wrong file name | The name must be exactly `.env.local` |
