# ai-proxy — the only thing that ever sees the Groq API key

`src/core/ai.js` posts every AI request to this function. The browser holds no
AI credential at all.

## Why it exists

The key used to be `VITE_GROQ_API_KEY`. Vite inlines every `VITE_*` value into
the JavaScript it ships, so the key was a plain string in a file anyone could
download from the site and read in devtools — and spend against the account
with. Moving it here is the only fix; nothing about how the key is stored in
the client can make a shipped secret not shipped.

The function is also the only place that can enforce anything, because it is
the only part of the path the user does not control:

| Guard | What it stops |
|---|---|
| Supabase JWT required | anonymous use of the account's AI budget |
| Entitlement (`_shared/entitlements.js`: trial, Start, Pro, comped) | a runner without access spending against the account |
| 30 calls per user per rolling hour | one signed-up user running up the bill |
| Daily ceilings per `kind`, from midnight Europe/Ljubljana (chat: Start 10, Pro and trial 50) | the plan's message allowance, and a chat sent under another kind's name |
| `kind` must be one of `chat, memory, reaction, motd, adapt, plan, review` | an unmetered kind |
| Model allow-list | using the proxy as a free general-purpose LLM endpoint |
| Caps on messages and payload size | expensive single requests |
| Reply length capped per kind of call (`limits.js`): prose at a chat reply's 1024 tokens, JSON by kind (memory 400, week rewrite 2048, plan 6000) | a manipulated prompt producing long off-topic output |
| Errors carry a message + code, never internals | leaking stack traces or upstream detail |

The entitlement check is what makes the paywall real. `hasPremium()` in the
app decides what a runner is *shown*; this decides what they can *spend*.
Without it, any signed-in free user could skip the UI and post here directly.
The rule is `../_shared/entitlements.js`, the same plain-JS file the app
imports to show it; the rows it reads (`users.trial_end`, `subscriptions`) are
ones the caller cannot write.

Both the entitlement and rate-limit checks **fail closed**: if the lookup
errors, the request is refused rather than forwarded. A proxy that forgets its
limit under load is a proxy with no limit.

## Prerequisites

`supabase/migration_v5.sql` and `migration_v9.sql` must have been run — it creates the `ai_usage`
table the rate limiter counts. `migration_v6.sql` should be run too: it makes
`users.trial_end` and `users.subscription_status` read-only to clients, so the
entitlement this function reads is not one the caller can write. That table has RLS **enabled with no policies**,
so no client can read, forge or delete its own usage rows; only this function
reaches it, via the service-role key, which bypasses RLS.

## Deploy

The Supabase CLI cannot be installed with `npm install -g` — that is
unsupported and errors out. Use `npx`, which needs no install:

```bash
npx supabase@latest login                                   # opens a browser
npx supabase@latest link --project-ref <your-project-ref>   # DB password: blank is fine
npx supabase@latest functions deploy ai-proxy
npx supabase@latest secrets set GROQ_API_KEY=gsk_...
```

On Windows, `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`
then `scoop install supabase` gives a permanent `supabase` command instead.
If `functions deploy` asks for Docker, add `--use-api` to bundle in the cloud.

The project ref is the subdomain of your `VITE_SUPABASE_URL`
(`https://<project-ref>.supabase.co`), also shown under **Settings → General**.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do **not** set them as secrets, and never put the service-role key anywhere the
client can reach.

After the first successful deploy, delete `VITE_GROQ_API_KEY` from your local
`.env` and from every hosting provider's environment, and **rotate the key** at
[console.groq.com/keys](https://console.groq.com/keys). A key that was ever
inlined into a built bundle should be treated as burned, not merely unused.

`npm run build` fails if a Groq-shaped key, any non-anon JWT, or a direct
`api.groq.com` call appears in `dist/` — see `scripts/verify-bundle.mjs`.

## Request and response

The client sends the Groq chat-completions shape plus an optional `kind` tag
used only for usage analysis:

```json
{
  "model": "openai/gpt-oss-120b",
  "messages": [{ "role": "system", "content": "..." }],
  "temperature": 0.8,
  "max_tokens": 1024,
  "response_format": { "type": "json_object" },
  "kind": "chat"
}
```

with `Authorization: Bearer <supabase access token>` — the user's session
token from `supabase.auth.getSession()`, not the anon key.

A success passes Groq's own body and status straight back, so the client's
existing handling (404 → try the next model, 429 → wait, 413 → smaller output
budget) keeps working. Upstream headers are never forwarded.

A refusal is `{ "error": { "message", "code" } }`, where `message` is written
for a runner to read and can be shown verbatim:

| Status | `code` | Meaning |
|---|---|---|
| 401 | `unauthenticated` | no token, or the session expired |
| 402 | `not_premium` | no access (tier `none`) |
| 400 | `bad_kind` | `kind` missing or unknown |
| 429 | `chat_limit` | the day's coach messages are used up (resets at midnight Ljubljana) |
| 429 | `daily_limit` | another kind's daily ceiling |
| 400 | `model_not_allowed`, `bad_messages`, `bad_request` | failed validation |
| 413 | `payload_too_large` | prompt over 60 000 characters |
| 429 | `rate_limited` | 30/hour reached |
| 502 | `upstream_unreachable` | Groq could not be reached |
| 503 | `entitlement_check_failed`, `rate_check_failed`, `usage_write_failed` | could not account for the call; refused rather than spent |
| 500 | `server_misconfigured` | a secret is missing (logged, not disclosed) |

`ai.js` treats `unauthenticated`, `not_premium` and `rate_limited` as final —
no other model or smaller budget can help — and shows the message as-is. Any
401, including one from Supabase's gateway (which rejects an expired JWT before
this function runs, in its own response shape), is reported to the runner as
"sign in again" rather than as a connection problem.

## Changing the limits

All of them are constants at the top of `index.ts`: `RATE_LIMIT`,
`RATE_WINDOW_MS`, `ALLOWED_MODELS`, `MAX_OUTPUT_TOKENS`, `MAX_MESSAGES`,
`MAX_PAYLOAD_CHARS`. **`ALLOWED_MODELS` must be kept in step with `MODELS` in
`src/core/ai.js`** — a model listed there but not here fails validation with
`model_not_allowed`, which `ai.js` cannot recover from.

## Checking it works

```bash
supabase functions logs ai-proxy          # deploy and runtime logs
```

Signed out, the coach should say you need to sign in (401 rather than a stack
trace). Signed in, a chat message should answer normally, and a row should
appear in `ai_usage` for each call.
