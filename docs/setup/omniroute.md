# Bring your own OmniRoute

Every Veda user can run **their own** OmniRoute and make **their own** combos. Veda does not run one for everybody,
and nothing depends on one person's computer.

OmniRoute (https://github.com/diegosouzapw/OmniRoute, MIT) is a router. You add your providers (OpenRouter, free tiers,
your own keys) and build a **combo**: an ordered list of models with automatic fallback. Veda sends Claude Code and Chat
requests to your OmniRoute, and your combo decides which model answers.

```
Veda tab  ->  Veda server (keeps your key)  ->  YOUR OmniRoute (your providers, your combo)  ->  model providers
```

## What you do (once)

1. **Run OmniRoute** where Veda can reach it (see "Where to run it").
2. In its dashboard, open **Providers** and add your providers with your own keys.
3. Open **Combos** and create a combo, for example `my_combo`. Choose priority or round robin.
4. Open **API Keys** and create a key, for example `veda`.
5. In Veda, open **Dashboard, Keys**. Choose **OmniRoute**. Enter the address and the key. Save.
6. In the AI panel, open the model list. Your combos are under **OmniRoute combos**. Pick one.

The address and key are encrypted before they are stored, like every other key. The sandbox never sees them: Claude Code
talks to the Veda proxy, and the proxy adds your key.

## Where to run it

| Where Veda runs | Where OmniRoute can run | Address to save |
|---|---|---|
| Your own computer (`npm run dev`) | The same computer | `http://localhost:20128` |
| A deployed Veda (Vercel) | A server or computer with a public **https** address | `https://omniroute.example.com` |

A deployed Veda cannot reach `localhost` on your computer. If OmniRoute runs on your own computer, give it a public address
with a tunnel (for example `cloudflared tunnel --url http://localhost:20128`) and save the tunnel address.

## Protect your OmniRoute

CAUTION: OmniRoute listens on all network interfaces by default, with no API key needed. Anybody who can reach it can
spend your provider credits.

- Set `REQUIRE_API_KEY=true` and use the key from step 4.
- On your own computer, set `OMNIROUTE_SERVER_HOST=127.0.0.1`.
- Set `INITIAL_PASSWORD` to your own password. Do not keep the default `CHANGEME`.
- Behind a tunnel, keep `REQUIRE_API_KEY=true`. The tunnel address is public.

## What Veda checks before it calls your address

Veda calls the address you save, so it is checked:

- Production: **https only**, and a public name or address. Private networks, `localhost`, link-local and cloud-metadata
  addresses are refused (also when written as IPv4 inside IPv6).
- Development: `http://localhost` and `http://127.0.0.1` are also allowed.
- The name is looked up before each request, and redirects are never followed.

## Limits

- Veda does not price your OmniRoute. You pay your providers directly. Veda shows ₹0.00 for these models.
- Claude Code works with the models in your combo. Pick models that support tool calls. Free models often struggle with
  multi-step edits.
- OmniRoute needs Node 22 or newer and about 460 MB of disk.

## Developers: database

Run `supabase/migrations/00011_omniroute_key_provider.sql`. It allows `omniroute` in `api_keys`. The stored value is JSON:
`{ "baseUrl": "...", "apiKey": "..." }`, encrypted with AES-256-GCM.
