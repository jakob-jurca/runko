# Research engine — progress

The Phase 3-6 plan was lost in a /clear; phases 3-6 below were reconstructed
from the code comments (Phase 3 = walk-run rules, Phase 5 = walking plan / Goom
table, Phase 6 = knowledge files + ai.js) — Phase 4 scope is my own choice.

## Done
- Phase 0-2: gate, limits, load rules (see git log).
- Phase 2 review: run-walk counts toward minimum readiness of a completion
  goal up to a half (long run 40% of the distance). Verdicts now stretch:
  half in 10 wk at 20 km/wk, 10 km in 8 wk at 8 km/wk, returning 10 km in 6 wk,
  62-year-old injured half. Still unsafe: student-zero-half-5w, zero-marathon-16w.
- Phase 3: walk-run rules — +10 running min a week cap, standard ladder
  re-cut to 8,10,12,14,16,18,20 running min (+6/wk on 3 days), property
  `walkRunWithinLimits` in tests/personas/properties.mjs.

- Phase 4: teens 15-17 (p08 r9-11, r14-16: weekly km / run-day / long-run
  ceilings, longest goal 10 km at 15 and a half at 16-17, marathon refused)
  and BMI 30+ beginners (p05 r12, r15, r17, r29: 3 run days, no intensity 26
  weeks, earliest race 12/26/52 weeks). Limits in limits.js, enforced in
  feasibility.js, build-distance.js, build.js.
- Phase 5: walking-first plans and the Goom table. BMI 30-34.9 / 35-39.9: 3 / 6
  weeks of brisk walking before the ladder (p05 r8-9, WALK_BASE_* in rules.js,
  walkBase in build-time.js); BMI 40+ without clinician agreement: a 12-week
  walking-only plan instead of the old block (p05 r4, gate restriction
  walkOnly); postpartum returners get the Goom table as a 'postpartum' ladder
  (weeks 3 and 6 trimmed to keep +10 running min/week, noted in build-time.js).
  New workout type 'walk' + phase 'walk' in UI strings, ai.js, logging.

- Phase 6: knowledge files (methodology, workout-types, beginners, faq,
  recreational, returning, short-race, INDEX) and the plan-page "how built"
  string no longer quote a flat 10% weekly / 30% long-run share; ai.js itself
  carried no such numbers (its per-week rules come from the engine), so it is
  unchanged apart from the new 'walk' type texts.

## Next
BLOCKED: supabase CLI 401 (not logged in / no SUPABASE_DB_PASSWORD). Run
supabase/migration_v7.sql in the SQL Editor, then `npm test` (rls-live runs once the
migration is in), push to main.

## Open questions
- The injured 62-year-old half: comfortable readiness computes to 55 weeks
  (5%/wk, holds, 2:1 cycles, 45% share) — literal rules, may be worth a look.

## Second batch (items from the original plan that Phases 3-6 missed)
Group A: assessment and scenario selection — returning by break length
(<=5, 6-28, 29-56, >56 days; Daniels), injury return (p06 walk-run, Z1-Z2 to
50% of pre-injury volume), beginner race gating (half/marathon after 6 months
running; marathon only run-walk and >= 26 weeks), minimum plan weeks (b03 r9),
marathon prediction by volume.
Group B: intensity and placement — quality sessions by level/phase and
population caps, phase content (b03 r18-21), polarized/pyramidal, MP segments
(<=110 min), low-intensity floor 75%/70%, race-week last quality 4/6 days out,
easy run 20 min..0.75 long, strides, optional strength notes, post-race
recovery clocks, 72 h between hard sessions at 60+.
Group C: masters 40-49/50-59, time-crunched p07, Gulati HRmax, teen quality
limit + growth-spurt cap, caesarean week 16 / pelvic-floor gates, remove the
bmi_40 block screen in Onboarding.jsx.
Group D: 35 runtime summaries in knowledge/research/ (<=350 tokens, frontmatter
scenarios/populations/situations), plan call loads scenario + <=2 population
notes (one AI call), chat via detectSituations, tests.
Status: Group A done (returning.js, gating, min weeks, marathon prediction; tests/returning.test.mjs).
Group B done (planning/intensity.js post-pass: quality caps, gaps by age, low-intensity floor, race week, easy-run limits, strides, MP long runs, strength notes, post-race clocks in plan.post_race; tests/intensity.test.mjs + intensityRulesKept property).
Group C done (masters 40-49 + 60+ beginner rules, time-crunched p07, Gulati via heart-rate.js formulaAge, teen growth-spurt cap, caesarean week 16 / tear / pelvic-floor gates, few-days notice). The bmi_40 block screen: Onboarding.jsx has no bmi_40-specific screen (its generic "blocked" step is still reachable for other reasons), so nothing to remove. NEEDS supabase/migration_v8.sql (pelvic_floor_symptoms, severe_tear, height_gain_cm_3mo on health_profiles) — run it in the SQL Editor; saving works without it until one of the three new answers is given.
Group D done (knowledge/research/*.md x35, situations.js, frontmatter.js, research-select.js, knowledge.js buildResearchPlanBlock + chat, ai.js plan prompt; tests/research.test.mjs). Plan-call populations are age/schedule only (teen, masters, time_crunched): BMI, postpartum and injury notes are chat-only so no health data reaches the AI.

## Landing page (phase 1: layout, structure, routing)
Public marketing page at "/" for logged-out visitors. Signed-in runners still get the dashboard at "/".
- Routing: src/main.jsx now decides which bundle to load. Guest on "/" with no saved session and no auth
  params in the URL -> src/landing/entry.jsx (no router, no Supabase, no app code). Everyone else ->
  src/app-entry.jsx (the old main.jsx, unchanged). A stale saved session boots the app, which shows the
  landing through Home in App.jsx. Recovery / failed email links (tokens or error_code in the URL) always boot
  the app, so password reset, Supabase Site URL and every navigate('/') work as before. Nothing in src/core touched.
- Buttons: "Prijava" -> /auth, "Začni brezplačno" -> /auth?mode=signup (Auth.jsx opens the signup tab for that).
- Styles: separate Tailwind build (tailwind.landing.config.js + src/landing/landing.css), same tokens as the app.
  The app config now excludes src/landing so neither bundle carries the other's CSS.
- All copy and mock data: src/landing/content.js (Slovenian, one export per section, prices "€ X").
- Sections in src/landing/sections/, shared bits in src/landing/ui/ (Reveal, Buttons, Logo, PhoneFrame, screens).
- index.html: lang="sl", Slovenian title/description, Open Graph placeholders (TODO: /og-image.png, production URL).
- Phase 2 hooks: data-anim="hero-copy|hero-phone|hero-input" (Hero), data-msg (chat messages), data-screen (pinned
  phone screens), <Reveal> wrapper (swap for Motion whileInView), data-menu (mobile menu).
- Placeholders to replace: legal links and social URLs in footer, image slots in Audience (`image: null`), real
  screenshots for the phone (PhoneFrame children), prices, the og image.
- Motion: CSS only, everything under prefers-reduced-motion: no-preference. The marquee is the page's only one.

## Landing page (phase 2: fixes, motion, mockups)
Content: no coaches, authors, books or "VDOT" anywhere; trust strip is now "Temelji na športni znanosti" /
"Od prvega kilometra do maratona" / "1 mesec brezplačno". Audience is five cards (Začetniki, Rekreativci, Prvi
polmaraton ali maraton, Tekmovalci, Po premoru), each ending in a concrete "Primer tedna". No pregnancy, postpartum,
birth or midwife wording on the page (safety note and FAQ are a neutral "Runko ne nadomešča zdravnika"). App logic and
safety rules untouched.
Layout: Kako deluje on desktop is one pinned stage (text column + phone, 42vh of scroll per step, was ~78vh); the
mobile list is unchanged (markup verified identical). Hero cards on small screens sit above/below the phone instead of
over it. Audience shows all five at lg with no arrows; below lg it stays a swipe row (arrows only at md).
Motion (no library, CSS + IntersectionObserver, all under prefers-reduced-motion: no-preference, one easing --ease):
hero cards enter, drift, send a data packet into the phone and the plan rows fill in; step screens cross-fade; plan
chapter bars grow / gauge draws and the needle swings / week days tick in; chat plays once (typing dots, messages one
by one, memory lines light up); Napredek count-ups, growing bars, filling ring; card lift + press states; marquee
pauses on hover/focus. Toolkit: src/landing/ui/motion.jsx (useSeen, Play, CountUp).
Fixed a phase-1 bug: the weekly bars in Napredek had zero height and never showed.
Phase 3 slots: content.js `slots` (hero phone + four step phones: set a path in /public and it replaces the drawn
screen), Audience `image`.
Size: landing JS 138 kB (37 kB gzip), CSS 45 kB (8.8 kB gzip); app bundle unchanged.

## Landing page (copy update, verbatim Slovenian text)
Hero, trust item 1, Kako deluje (4 steps), Plan chapter (new "Tek brez tekme" tile replaces the RPE tile), Coach,
Napredek and Za koga texts replaced from the supplied copy; meta description now matches the hero subheadline. The
"Najprej varnost, potem kilometri" section is removed (component, copy and its Landing entry; nothing linked to it).
FAQ: the listed questions updated/added in the given order, and the one existing question that was not listed
("Kako se trener spomni mojih podatkov?") kept, right after "Na katere tekme...". 9 questions in total.
Claims checked against the app: step 4 and FAQ "izpustim trening" keep the automatic-adaptation wording (core/plan.js
maybeAdaptPlan after a missed or hard logged run, adaptCurrentWeekIfNeeded at each new week); "Povzetek tvojega tedna"
uses the no-summary wording because the app has no end-of-week summary or analysis.
Production bug found and fixed: in the built site the minifier merged the two dynamic imports in src/main.jsx into one
call and Vite kept only the APP's preload list, so a guest got no landing CSS and downloaded the whole app. The dev
server hides this. The imports are now separate loader functions (see comment in main.jsx). Verified on `vite preview`:
guest loads only landing chunks + landing CSS, /auth loads only app chunks, no horizontal overflow at 375/768/1440.

## Paid plans (Start / Pro, Stripe)
Source of truth for the rules: supabase/functions/_shared/entitlements.js (plain JS, imported by the Edge
Functions under Deno and by the app and tests under Node/Vite). Tiers none / trial / start / pro; `comped`
reads as pro. The server decides (ai-proxy on every AI call, `entitlement` function for the app's display
and for plan builds); the app only shows what `fetchAccess()` returns.

- Stage 1 (entitlements): migration_v9.sql (subscriptions, plan_builds, ai_usage.billable, no more
  trial_end default), _shared/{entitlements.js, access.ts, http.ts}, functions/entitlement, ai-proxy reads
  the shared rule, refuses unknown `kind`s and applies daily per-kind ceilings from Ljubljana midnight.
  Old no-card trials (users.trial_end in the future) keep access to that date, then the paywall.
- Stage 2 (Stripe, test mode only): _shared/stripe.js (REST without the SDK, signature check with WebCrypto,
  idempotent and order-safe event handling), functions billing (checkout / portal / sync after Checkout) and
  stripe-webhook (deploy with --no-verify-jwt), stripe_events table, scripts/stripe-setup.mjs (products,
  4 prices by lookup key, founding coupon + code USTANOVNI, portal settings, webhook endpoint), Settings →
  Naročnina opens the portal. Setup steps and manual tests: STRIPE_CHECKLIST.md.
- Stage 3 (no free tier): tier none = components/Paywall.jsx and nothing else, before onboarding too (App.jsx
  Protected + OnboardingGate); /paket shows the same picker to anyone who wants to subscribe early. Prices and
  the feature matrix live in src/core/pricing.js (shared with the landing page; tests/pricing.test.mjs checks
  them against Stripe's prices and the server's limits). Removed: the free tier's static quote, the "Premium"
  hints in Dashboard / Log / Plan, the Chat paywall. Nothing is deleted when access ends.
- Stage 4 (limits): chat 10/50 a day in the ai-proxy (`chat_limit`, Slovenian message; Start hears about Pro;
  off-topic replies never reach the proxy so never count; a model fallback is not billed twice). Chat shows
  "Danes še N sporočil" from 3 left and closes the input at 0. Plan builds: core/plan.js asks the
  `entitlement` function to reserve one (plan_builds) after the pipeline and before the AI call; the proxy
  describes a plan only under a fresh reserved build (max 4 calls, 1 hour). Start once a month, Pro 5 a day
  (hidden), trial 1 plan. Onboarding (rebuild), Dashboard and Settings say when the next build is possible.
  The old client-side PLAN_LIMIT_ENABLED switch is gone. Known gap: training_plans rows are still written by
  the client, so someone bypassing the app could save a plan without the AI text; the AI cost is protected.
- Stage 5 ("Poškodba / bolezen"): src/core/health-break.js (pure, no AI): rest for the reported days, then
  easy-only running from 50-60 % (33 % after 4+ weeks off, as planning/returning.js) back to the full plan over
  3-28 days; quality sessions become easy, walk-run days keep their ladder, never more than the original day or
  week. Changed weeks carry plan_json.health_break and guard.isAdaptable keeps the AI adaptation off them.
  training_breaks table (migration_v9) stores the report and the original weeks ("Razveljavi"). Button +
  dialog + notice: components/HealthBreak.jsx on Dashboard and Plan. Over 14 days or strong pain: a calm
  doctor note. The coach gets an INJURY / ILLNESS block (coach-prompt.js healthBreakContext).

### Comped accounts (Pro without paying)
In the Supabase SQL Editor, once per person (after migration_v9):
```sql
insert into public.subscriptions (user_id, comped)
select id, true from auth.users where email = 'name@example.com'
on conflict (user_id) do update set comped = true;
```
To end it: `update public.subscriptions set comped = false where user_id = (select id from auth.users where email = 'name@example.com');`
The person sees Pro the next time the app loads.

## Mobile app (mobile/)
Expo app built in six phases; the committed log is mobile/PROGRESS.md (kept separate because this file carries uncommitted landing-page notes). Shared-core changes: src/core/knowledge-files.js (new), env.js `AUTH_OPTIONS`, supabase.js spreads it, strings.js `reminders`.

## Before launch
- [ ] Buy the domain.
- [ ] Set up Resend as custom SMTP in Supabase (Authentication → Emails → SMTP Settings). The built-in sender allows only a few emails an hour for the whole project.
- [ ] Slovenian reset-password email template with the "Nadaljuj" flow: the link is `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` (AUTH_CHECKLIST.md §0). Mobile must support token_hash links first (mobile/PROGRESS.md, "To catch up").
- [ ] Raise the minimum password length to 8, in the app (`MIN_PASSWORD_LENGTH` in src/core/auth-flows.js, mobile screens) and in Supabase (Authentication → Sign In / Providers → Email → Minimum password length). Existing shorter passwords still log in; the new minimum applies to new and changed passwords.
- [ ] Update Site URL and Redirect URLs to the new domain (Authentication → URL Configuration): `https://<domain>`, `https://<domain>/**`; keep `runko://reset-password`.
- [ ] Privacy policy and terms of use, including plans built against advice ("Vseeno naredi plan": the runner confirms the risk once; the plan keeps every safety cap, but Runko does not consider the goal safe in the time available).
