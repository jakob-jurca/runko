# Stripe (test mode) — setup and manual tests

Everything here is **test mode**. The functions refuse a live key (`sk_live_…`) and live events
unless the Supabase secret `STRIPE_ALLOW_LIVE=true` is set, which is for launch day only.

## 1. Database
Supabase → SQL Editor → paste `supabase/migration_v9.sql` → Run. (After v7 and v8.)

## 2. Stripe test key
1. Open https://dashboard.stripe.com and make sure the **Test mode** switch (top right) is ON.
2. Developers → API keys → **Secret key** → Reveal → copy. It starts with `sk_test_`.

## 3. Create products, prices, coupon, portal settings, webhook
In this folder (PowerShell):
```powershell
$env:STRIPE_SECRET_KEY = "sk_test_..."
node scripts/stripe-setup.mjs
```
It is safe to run twice. It prints the webhook **signing secret** (`whsec_…`) the first time; copy it.
If it says the webhook already exists, the secret is in Stripe → Developers → Webhooks → the
endpoint → Signing secret → Reveal.

## 4. Supabase secrets and functions
```powershell
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase@latest functions deploy ai-proxy
npx supabase@latest functions deploy entitlement
npx supabase@latest functions deploy billing
npx supabase@latest functions deploy stripe-webhook --no-verify-jwt
```
`--no-verify-jwt` only on the webhook: Stripe has no Supabase login; the function checks Stripe's
signature instead. If the setup script printed `STRIPE_PORTAL_CONFIGURATION=…`, set that secret too.
Optional: `APP_ORIGINS=https://<domain>,http://localhost:5173` once the domain exists (default:
runko-omega.vercel.app and localhost).

No Vercel environment variable is needed: the browser never sees a Stripe key.

## 5. Manual tests (test cards)
Any future expiry date, any CVC, any postcode.

| Card | What it does |
|---|---|
| 4242 4242 4242 4242 | always succeeds |
| 4000 0025 0000 3155 | asks for 3-D Secure confirmation (approve it in the pop-up) |
| 4000 0000 0000 0341 | is saved fine, but every charge fails (use it to test a failed payment after the trial) |
| 4000 0000 0000 9995 | declined at once (insufficient funds) |

1. New account → paywall only (no onboarding, no dashboard). Yearly is preselected; Start shows
   "5,00 €/mes", Pro "7,50 €/mes", and the 14-day line.
2. Choose Start, monthly → Stripe Checkout in Slovenian, "14 dni brezplačno", 0,00 € today →
   pay with 4242… → back in the app, it says the subscription is confirmed, onboarding starts.
3. Build the plan (trial: 1 plan). Try "Sestavi nov načrt" → it says when you can again.
4. Settings → Naročnina shows "Brezplačni preizkus do …, nato paket Start" → Upravljaj naročnino
   opens the Stripe portal: switch to Pro yearly, back in the app Settings shows Pro · letno.
5. Founding code: a second account → Checkout → "Add promotion code" → `USTANOVNI` → -25 %.
6. End the trial now: Stripe → Customers → the customer → the subscription → ⋯ → "End trial now"
   (or use a Test clock). With 4242 the app shows the chosen plan. With 0341 the subscription goes
   past_due and the app shows the paywall with "Zadnje plačilo ni uspelo" and a button to the portal.
7. Cancel in the portal → Settings says "Dostop ostane do …"; access stays. Then in Stripe:
   subscription → Cancel immediately → reload the app → paywall; the data is still there after
   paying again (and there is no second trial).
8. Stripe → Developers → Webhooks → the endpoint: every delivery is 200. "Resend" one: still 200
   (a duplicate) and nothing changes.
9. Chat limits: a Start account gets a friendly message after 10 messages today (mentions Pro).
