# Claude Code tab: setup

The Claude Code tab runs the real Claude Code engine (Claude Agent SDK) in a private cloud sandbox. This guide sets it up.
Design: `docs/superpowers/specs/2026-10-29-claude-code-tab-design.md`. Cost notes: `docs/product/pricing-later.md`.

## How it works in one picture

```
Browser tab  --SSE-->  Veda server  --E2B SDK-->  Sandbox (Claude Code, runner.mjs)
                             ^                              |
                             |  ANTHROPIC_BASE_URL = <AGENT_PUBLIC_URL>/api/agent/llm
                             +---- LLM proxy (adds the real key, combo fallback) ----> OpenRouter / Anthropic
```

The sandbox gets a signed token that lasts 15 minutes. It never gets the API key.
This is the same idea as the OmniRoute setup (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, an empty `ANTHROPIC_API_KEY`,
a combo with priority fallback). Veda runs the router for you, so a student installs nothing.

## Environment variables

| Variable | Needed | Value |
|---|---|---|
| `E2B_API_KEY` | Yes (real runs) | From https://e2b.dev/dashboard |
| `E2B_TEMPLATE` | No | Template name. Default `veda-claude-code` |
| `AGENT_PUBLIC_URL` | Yes in proxy mode | Public base URL of this server, for example `https://veda.vercel.app`. In local work, a tunnel address (see below) |
| `AGENT_KEY_MODE` | No | `proxy` (default) or `direct`. `direct` gives the real key to the sandbox. Local work only |
| `AGENT_SANDBOX` | No | `fake` uses an in-memory fake sandbox. No E2B account and no model needed |
| `AGENT_DAILY_MINUTES` | No | Sandbox minutes for each student each day. Default 30 |
| `AGENT_RUN_MAX_SECONDS` | No | Stop a run after this time. Default 600 |
| `OPENROUTER_USD_INR` | No | Exchange rate for OpenRouter prices in the chat. Default 90 |
| `OPENROUTER_MARGIN` | No | Multiplier on the OpenRouter price. Default 1 |

## Step 1: apply the database migration

Apply `supabase/migrations/00010_openrouter_and_agent_runs.sql` to your Supabase project.
It allows `openrouter` in `api_keys` and creates `agent_runs`.

## Step 2: build the sandbox template (once)

1. Install the E2B CLI: `npm i -g @e2b/cli`
2. Run `e2b auth login`
3. Open the folder `scripts/e2b`.
4. Run `e2b template build --name veda-claude-code`
5. Make sure the build ends without an error.

NOT CHECKED: the template build was not run in this repository (no E2B account was available). If the build fails,
the template needs only: Node.js 20 or newer, and `@anthropic-ai/claude-agent-sdk` installed in `/home/user/runner`.

## Step 3: try it without any account (fake sandbox)

1. Set `AGENT_SANDBOX=fake` in `.env.local`.
2. Run `npm run dev`.
3. Open `/ide`, open the **Claude Code** tab, save any OpenRouter or Anthropic key in the dashboard, and send a message.
4. A scripted run shows a message, tool cards, a permission request, and one file change to accept.

## Step 4: run with the real sandbox

1. Set `E2B_API_KEY` and remove `AGENT_SANDBOX`.
2. Deployed: set `AGENT_PUBLIC_URL` to your Vercel address.
3. Local: the sandbox must reach your computer. Start a tunnel (for example `cloudflared tunnel --url http://localhost:3000`)
   and set `AGENT_PUBLIC_URL` to the tunnel address. Or set `AGENT_KEY_MODE=direct` and accept that the agent can read the key.
4. Save an OpenRouter key in the dashboard. Pick a model in the Claude Code tab. Send a message.

CAUTION: `AGENT_KEY_MODE=direct` puts the real API key in the sandbox. The agent can print it. Do not use it for students.

## Limits that protect Veda

One run at a time for each student. `AGENT_DAILY_MINUTES` for each student each day. `AGENT_RUN_MAX_SECONDS` for each run.
A sandbox with no run is destroyed after 10 minutes. Usage is recorded in `agent_runs`. Nothing is charged yet.

## Troubleshooting

| Message | Cause | Step |
|---|---|---|
| "Claude Code is not set up on this server yet." | No `E2B_API_KEY`, no `AGENT_SANDBOX=fake`, or no `AGENT_PUBLIC_URL` in proxy mode | Set the variables. Restart the server |
| "No API key saved for openrouter" | The student has no OpenRouter key | Dashboard, Keys |
| Run starts and fails at once | The template has no Agent SDK, or the sandbox cannot reach `AGENT_PUBLIC_URL` | Check step 2 and step 4 |
| Model errors from free models | The free model does not support tool calls well | Pick a stronger model, or use a combo |
| `Claude Code is still working on your last request` | One run at a time | Wait, or press Stop |
