# Cost and pricing: decide later

Owner decision (2026-10-29): build the Claude Code feature first. Decide cost and pricing after it works.

## What the feature costs Veda

| Item | Who pays now | Open question |
|---|---|---|
| LLM tokens (OpenRouter, Anthropic) | The student, with their own BYOK key | None while BYOK stays |
| Cloud sandbox for Claude Code (E2B) | Veda | Wallet in paise, a plan, or a free daily allowance? |
| LLM proxy traffic on the Veda server | Veda | Small. Watch the Vercel function limits |

E2B list price (checked 2026-10-29): $0.000014 per vCPU-second and $0.0000045 per GiB-second. A 2 vCPU, 512 MiB sandbox costs about $0.11 per hour. The Hobby plan has $100 of one-time credit. Limits change. Check the E2B pricing page again before launch.

## Safety caps that ship with the first version (no pricing needed)

- One running sandbox for each student.
- A daily minute cap for each student (`AGENT_DAILY_MINUTES`, default 30).
- A hard stop for each run (`AGENT_RUN_MAX_SECONDS`, default 600).
- An idle sandbox is killed after 10 minutes.

## Data we record now so pricing can use it later

Table `agent_runs`: user, project, model, provider, sandbox seconds, input tokens, output tokens, status, time. Nothing is charged from it yet.

## Questions to answer before charging

1. Charge sandbox time from the wallet (paise per minute), or include it in a plan?
2. Free allowance for each student each day?
3. Charge OpenRouter paid models through the wallet, or BYOK only?
4. USD to INR rate and margin for any OpenRouter price shown in paise.
