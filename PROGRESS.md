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
