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
Status: (update below as groups finish)
