---
topic: vdot
load_when:
  - plan_generation
  - pace_question
priority: high
---

<!--
  Sources: Daniels J. & Gilbert J., Oxygen Power (1979) - VO2/velocity and time-limit equations; Daniels J., Daniels' Running Formula, 3rd/4th ed. (Human Kinetics, 2014/2022) - intensity definitions, %VO2max and %HRmax targets, per-session volume limits; Riegel P.S., American Scientist 69 (1981) - endurance fatigue exponent; Ely M.R. et al., Med Sci Sports Exerc 39(3) 2007 - heat and marathon performance
-->

## Definition
- VDOT = "pseudo VO2max" derived from a race performance. It reflects VO2max AND running economy together, so it is a performance index, not a lab VO2max. [Daniels]
- One VDOT value predicts equivalent performances at all distances and sets five training intensities: E, M, T, I, R. [Daniels]
- Tables below are computed directly from the Daniels-Gilbert equations. Race times match the published tables within ~10 s. Training paces are within a few s/km of the published tables. Use the formulas for values between rows.

## Formulas (use these to calculate, not estimate)
Units: v = velocity in metres/minute, t = race duration in minutes, d = distance in metres.
1. Oxygen cost of running: `VO2(v) = -4.60 + 0.182258*v + 0.000104*v^2`  (ml/kg/min)
2. Fraction of VO2max sustainable for duration t: `F(t) = 0.8 + 0.1894393*e^(-0.012778*t) + 0.2989558*e^(-0.1932605*t)`
3. `VDOT = VO2(d/t) / F(t)`
4. Inverse (pace for a target VO2 x): `v = (-0.182258 + sqrt(0.182258^2 + 4*0.000104*(4.60 + x))) / (2*0.000104)`; pace per km = 1000/v minutes.
5. Race time prediction for a given VDOT: solve eq. 3 for t by bisection (monotonic).
6. Training paces = inverse of eq. 1 at a fraction of VDOT:
   - E: 63-70% of VDOT (Daniels range 59-74% VO2max; slower end always acceptable)
   - M: predicted marathon race pace (eq. 5 with d = 42195) (~75-84% VO2max)
   - T: 88% of VDOT (Daniels 83-88% VO2max, ~ pace sustainable for ~60 min racing)
   - I: 97.5% of VDOT (Daniels 95-100% VO2max, ~ pace sustainable for 10-12 min racing)
   - R: 105% of VDOT (approx. current mile race pace)
Worked example: 5K in 20:00 -> v = 5000/20 = 250 m/min -> VO2 = 47.46 -> F(20) = 0.9530 -> VDOT = 49.8.

Fallback cross-check (not Daniels): Riegel `T2 = T1 * (D2/D1)^1.06`. [Riegel 1981] Both methods over-predict marathon ability for runners under ~50 km/week; add 5-10% to the predicted marathon for low-mileage or first-time marathoners (coaching consensus; Daniels notes predictions assume adequate endurance training for the distance).

## Intensity targets
| Zone | Purpose | %VO2max | %HRmax | Effort cue | Per-session volume limit [Daniels] |
|---|---|---|---|---|---|
| E (easy/long) | aerobic base, capillaries, mitochondria, tendon/bone adaptation, recovery | 59-74 | 65-79 | full sentences, RPE 2-4/10 | long run capped by duration: <= 150 min, up to 180 min in marathon plans; above ~50 km/wk aim for ~30% of weekly volume (a guide, not a cap) |
| M (marathon) | race-specific endurance, fuel use at goal pace | 75-84 | 80-90 | controlled, sustainable for hours | <= 20% weekly volume or 29 km, whichever less |
| T (threshold) | raise lactate threshold, "comfortably hard" | 83-88 | 88-92 | short phrases, RPE 6-7 | <= 10% weekly volume per session; continuous tempo ~20 min; cruise intervals 3-15 min reps with 1 min rest per 5 min run |
| I (interval) | maximise VO2max stimulus | 95-100 | 97-100 | hard, few words, RPE 8-9 | <= 8% weekly volume or 10 km, whichever less; reps 3-5 min (never > 5 min at I pace); jog recovery equal to or slightly less than rep time |
| R (repetition) | speed, running economy, mechanics | >100 (anaerobic) | not useful | fast but relaxed, not a sprint | <= 5% weekly volume or 8 km, whichever less; reps usually <= 2 min (200-400 m, some 600-800 m); full recovery, rest 2-3x rep time |

HR note: HR lags on short reps; use pace for I and R, HR/effort acceptable for E and M. [Daniels]

## Table 1: VDOT -> equivalent race times (h:mm:ss)
| VDOT | 5K | 10K | Half | Marathon |
|---|---|---|---|---|
| 30 | 30:41 | 1:03:49 | 2:21:17 | 4:49:49 |
| 31 | 29:51 | 1:02:05 | 2:17:30 | 4:42:21 |
| 32 | 29:05 | 1:00:27 | 2:13:55 | 4:35:17 |
| 33 | 28:20 | 58:54 | 2:10:31 | 4:28:34 |
| 34 | 27:38 | 57:25 | 2:07:17 | 4:22:11 |
| 35 | 26:59 | 56:02 | 2:04:13 | 4:16:06 |
| 36 | 26:21 | 54:42 | 2:01:18 | 4:10:19 |
| 37 | 25:45 | 53:27 | 1:58:31 | 4:04:47 |
| 38 | 25:10 | 52:15 | 1:55:51 | 3:59:30 |
| 39 | 24:38 | 51:06 | 1:53:19 | 3:54:27 |
| 40 | 24:06 | 50:01 | 1:50:54 | 3:49:37 |
| 41 | 23:36 | 48:58 | 1:48:35 | 3:45:00 |
| 42 | 23:08 | 47:58 | 1:46:22 | 3:40:33 |
| 43 | 22:40 | 47:01 | 1:44:14 | 3:36:17 |
| 44 | 22:14 | 46:06 | 1:42:12 | 3:32:12 |
| 45 | 21:49 | 45:13 | 1:40:14 | 3:28:16 |
| 46 | 21:24 | 44:23 | 1:38:21 | 3:24:29 |
| 47 | 21:01 | 43:34 | 1:36:33 | 3:20:50 |
| 48 | 20:38 | 42:48 | 1:34:48 | 3:17:19 |
| 49 | 20:17 | 42:03 | 1:33:08 | 3:13:56 |
| 50 | 19:56 | 41:20 | 1:31:31 | 3:10:40 |
| 51 | 19:36 | 40:38 | 1:29:58 | 3:07:30 |
| 52 | 19:17 | 39:58 | 1:28:28 | 3:04:28 |
| 53 | 18:58 | 39:19 | 1:27:01 | 3:01:31 |
| 54 | 18:40 | 38:42 | 1:25:37 | 2:58:40 |
| 55 | 18:22 | 38:06 | 1:24:16 | 2:55:55 |
| 56 | 18:05 | 37:31 | 1:22:58 | 2:53:15 |
| 57 | 17:49 | 36:57 | 1:21:42 | 2:50:40 |
| 58 | 17:33 | 36:24 | 1:20:28 | 2:48:09 |
| 59 | 17:18 | 35:53 | 1:19:17 | 2:45:44 |
| 60 | 17:03 | 35:22 | 1:18:09 | 2:43:22 |
| 61 | 16:48 | 34:52 | 1:17:02 | 2:41:05 |
| 62 | 16:34 | 34:23 | 1:15:57 | 2:38:52 |
| 63 | 16:21 | 33:55 | 1:14:54 | 2:36:43 |
| 64 | 16:07 | 33:28 | 1:13:54 | 2:34:37 |
| 65 | 15:55 | 33:02 | 1:12:54 | 2:32:35 |
| 66 | 15:42 | 32:36 | 1:11:57 | 2:30:37 |
| 67 | 15:30 | 32:12 | 1:11:01 | 2:28:41 |
| 68 | 15:18 | 31:47 | 1:10:07 | 2:26:49 |
| 69 | 15:07 | 31:24 | 1:09:14 | 2:24:59 |
| 70 | 14:56 | 31:01 | 1:08:23 | 2:23:13 |
| 71 | 14:45 | 30:39 | 1:07:33 | 2:21:29 |
| 72 | 14:34 | 30:17 | 1:06:44 | 2:19:48 |
| 73 | 14:24 | 29:56 | 1:05:57 | 2:18:09 |
| 74 | 14:14 | 29:35 | 1:05:10 | 2:16:33 |
| 75 | 14:04 | 29:15 | 1:04:26 | 2:14:59 |
| 76 | 13:54 | 28:56 | 1:03:42 | 2:13:28 |
| 77 | 13:45 | 28:37 | 1:02:59 | 2:11:59 |
| 78 | 13:36 | 28:18 | 1:02:17 | 2:10:31 |
| 79 | 13:27 | 28:00 | 1:01:36 | 2:09:06 |
| 80 | 13:18 | 27:42 | 1:00:57 | 2:07:43 |
| 81 | 13:09 | 27:25 | 1:00:18 | 2:06:22 |
| 82 | 13:01 | 27:08 | 59:40 | 2:05:03 |
| 83 | 12:53 | 26:51 | 59:03 | 2:03:45 |
| 84 | 12:45 | 26:35 | 58:27 | 2:02:29 |
| 85 | 12:37 | 26:19 | 57:51 | 2:01:15 |
## Table 2: VDOT -> training paces
E is a range (fast-slow). Rep times in seconds. Per-mile pace = per-km pace x 1.609.
| VDOT | E /km | M /km | T /km | T /400m (s) | I /km | I /400m (s) | R /400m (s) | R /200m (s) |
|---|---|---|---|---|---|---|---|---|
| 30 | 7:39-8:17 | 6:52 | 6:24 | 154 | 5:54 | 142 | 134 | 67 |
| 31 | 7:28-8:05 | 6:41 | 6:14 | 150 | 5:45 | 138 | 130 | 65 |
| 32 | 7:17-7:54 | 6:31 | 6:05 | 146 | 5:37 | 135 | 127 | 63 |
| 33 | 7:06-7:43 | 6:22 | 5:56 | 143 | 5:28 | 131 | 124 | 62 |
| 34 | 6:57-7:32 | 6:13 | 5:48 | 139 | 5:21 | 128 | 121 | 60 |
| 35 | 6:47-7:22 | 6:04 | 5:40 | 136 | 5:13 | 125 | 118 | 59 |
| 36 | 6:38-7:13 | 5:56 | 5:32 | 133 | 5:06 | 122 | 115 | 58 |
| 37 | 6:30-7:03 | 5:48 | 5:25 | 130 | 5:00 | 120 | 113 | 56 |
| 38 | 6:22-6:55 | 5:41 | 5:18 | 127 | 4:53 | 117 | 110 | 55 |
| 39 | 6:14-6:46 | 5:33 | 5:12 | 125 | 4:47 | 115 | 108 | 54 |
| 40 | 6:07-6:38 | 5:27 | 5:06 | 122 | 4:41 | 113 | 106 | 53 |
| 41 | 6:00-6:31 | 5:20 | 5:00 | 120 | 4:36 | 110 | 104 | 52 |
| 42 | 5:53-6:24 | 5:14 | 4:54 | 118 | 4:30 | 108 | 102 | 51 |
| 43 | 5:46-6:16 | 5:08 | 4:48 | 115 | 4:25 | 106 | 100 | 50 |
| 44 | 5:40-6:10 | 5:02 | 4:43 | 113 | 4:20 | 104 | 98 | 49 |
| 45 | 5:34-6:03 | 4:56 | 4:38 | 111 | 4:16 | 102 | 96 | 48 |
| 46 | 5:28-5:57 | 4:51 | 4:33 | 109 | 4:11 | 101 | 95 | 47 |
| 47 | 5:23-5:51 | 4:46 | 4:28 | 107 | 4:07 | 99 | 93 | 47 |
| 48 | 5:17-5:45 | 4:41 | 4:24 | 106 | 4:03 | 97 | 91 | 46 |
| 49 | 5:12-5:39 | 4:36 | 4:19 | 104 | 3:59 | 95 | 90 | 45 |
| 50 | 5:07-5:34 | 4:31 | 4:15 | 102 | 3:55 | 94 | 88 | 44 |
| 51 | 5:02-5:29 | 4:27 | 4:11 | 100 | 3:51 | 92 | 87 | 44 |
| 52 | 4:57-5:24 | 4:22 | 4:07 | 99 | 3:48 | 91 | 86 | 43 |
| 53 | 4:53-5:19 | 4:18 | 4:03 | 97 | 3:44 | 90 | 84 | 42 |
| 54 | 4:49-5:14 | 4:14 | 4:00 | 96 | 3:41 | 88 | 83 | 42 |
| 55 | 4:44-5:09 | 4:10 | 3:56 | 94 | 3:37 | 87 | 82 | 41 |
| 56 | 4:40-5:05 | 4:06 | 3:53 | 93 | 3:34 | 86 | 81 | 40 |
| 57 | 4:36-5:01 | 4:03 | 3:49 | 92 | 3:31 | 84 | 80 | 40 |
| 58 | 4:32-4:57 | 3:59 | 3:46 | 91 | 3:28 | 83 | 78 | 39 |
| 59 | 4:29-4:52 | 3:56 | 3:43 | 89 | 3:25 | 82 | 77 | 39 |
| 60 | 4:25-4:49 | 3:52 | 3:40 | 88 | 3:23 | 81 | 76 | 38 |
| 61 | 4:21-4:45 | 3:49 | 3:37 | 87 | 3:20 | 80 | 75 | 38 |
| 62 | 4:18-4:41 | 3:46 | 3:34 | 86 | 3:17 | 79 | 74 | 37 |
| 63 | 4:15-4:37 | 3:43 | 3:32 | 85 | 3:15 | 78 | 73 | 37 |
| 64 | 4:12-4:34 | 3:40 | 3:29 | 84 | 3:12 | 77 | 72 | 36 |
| 65 | 4:08-4:30 | 3:37 | 3:26 | 83 | 3:10 | 76 | 72 | 36 |
| 66 | 4:05-4:27 | 3:34 | 3:24 | 82 | 3:08 | 75 | 71 | 35 |
| 67 | 4:02-4:24 | 3:31 | 3:21 | 81 | 3:05 | 74 | 70 | 35 |
| 68 | 3:59-4:21 | 3:29 | 3:19 | 80 | 3:03 | 73 | 69 | 34 |
| 69 | 3:57-4:18 | 3:26 | 3:17 | 79 | 3:01 | 72 | 68 | 34 |
| 70 | 3:54-4:15 | 3:24 | 3:14 | 78 | 2:59 | 72 | 67 | 34 |
| 71 | 3:51-4:12 | 3:21 | 3:12 | 77 | 2:57 | 71 | 67 | 33 |
| 72 | 3:49-4:09 | 3:19 | 3:10 | 76 | 2:55 | 70 | 66 | 33 |
| 73 | 3:46-4:06 | 3:16 | 3:08 | 75 | 2:53 | 69 | 65 | 33 |
| 74 | 3:44-4:04 | 3:14 | 3:06 | 74 | 2:51 | 68 | 64 | 32 |
| 75 | 3:41-4:01 | 3:12 | 3:04 | 74 | 2:49 | 68 | 64 | 32 |
| 76 | 3:39-3:58 | 3:10 | 3:02 | 73 | 2:47 | 67 | 63 | 32 |
| 77 | 3:36-3:56 | 3:08 | 3:00 | 72 | 2:46 | 66 | 62 | 31 |
| 78 | 3:34-3:53 | 3:06 | 2:58 | 71 | 2:44 | 66 | 62 | 31 |
| 79 | 3:32-3:51 | 3:04 | 2:56 | 70 | 2:42 | 65 | 61 | 31 |
| 80 | 3:30-3:49 | 3:02 | 2:54 | 70 | 2:41 | 64 | 61 | 30 |
| 81 | 3:28-3:46 | 3:00 | 2:53 | 69 | 2:39 | 64 | 60 | 30 |
| 82 | 3:26-3:44 | 2:58 | 2:51 | 68 | 2:37 | 63 | 59 | 30 |
| 83 | 3:24-3:42 | 2:56 | 2:49 | 68 | 2:36 | 62 | 59 | 29 |
| 84 | 3:22-3:40 | 2:54 | 2:48 | 67 | 2:34 | 62 | 58 | 29 |
| 85 | 3:20-3:38 | 2:52 | 2:46 | 66 | 2:33 | 61 | 58 | 29 |
## Choosing the VDOT
- Use the most recent race or all-out time trial (>= 5 min effort, ideally 5K-half) within the last 4-6 weeks. [Daniels]
- If several races: use the best recent one, unless it was run in exceptional conditions (downhill course, tailwind).
- No race available: 20-30 min all-out time trial on flat ground, or conservatively estimate (err low by 1-2 VDOT). A VDOT estimated from a normal training run is unreliable.
- Race time between two rows: interpolate linearly or compute with eq. 3. Round DOWN when unsure.
- Plan paces from CURRENT fitness, not goal fitness. Goal pace can be used for M-pace work only if within ~2 VDOT of current. [Daniels]

## Updating VDOT
- Hold a VDOT for at least 4-6 weeks before raising it, even if sessions feel easy. [Daniels]
- Without a race: raise by at most 1 VDOT per 4-6 weeks if T and I sessions are consistently completed at the prescribed pace with controlled effort.
- New race result higher than current: adopt it immediately (if conditions were normal).
- After a break: <= 5 days off -> no change; 1-4 weeks off -> reduce VDOT ~3-7%; 8+ weeks off -> reduce ~10-20% and rebuild with E running first. [Daniels return-from-break guidance; approximate, round down]

## Adjustments (conditions invalidate raw paces)
- Heat: performance declines as temperature rises above ~10-12 °C, and slower runners lose more. [Ely 2007] Practical rule: run E, M and T by effort/HR, not pace, above ~20 °C; expect ~1-3% slower at 15-20 °C, ~3-6% at 20-25 °C, 6%+ above 25 °C (same values as race-prep.md).
- Hills: run by effort; pace on hilly routes is not comparable to table paces.
- Altitude (> ~1000 m): I and T paces slow; keep R pace but take longer recovery. [Daniels]
- Wind, trail, snow, fatigue, illness: effort over pace.
- Treadmill: 1% incline approximates outdoor energy cost (Jones & Doust, J Sports Sci 1996).

## Coaching rules for the AI
- Never prescribe paces faster than the table for the runner's current VDOT.
- If a runner hits T or I pace but reports RPE 9-10 or cannot finish reps, the VDOT is too high: drop 1-2.
- If easy runs drift into M/T range, remind: E pace is the ceiling, slower is fine.
- Beginners (< 3 months running): skip I and R paces; use E only plus strides. See beginners.md.
