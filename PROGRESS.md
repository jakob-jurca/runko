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

## Next
Phase 4, 5, 6 (see below as they are done).

## Open questions
- The injured 62-year-old half: comfortable readiness computes to 55 weeks
  (5%/wk, holds, 2:1 cycles, 45% share) — literal rules, may be worth a look.
