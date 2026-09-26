/**
 * build-time.js — plans prescribed in MINUTES: walk-run, then continuous.
 *
 * For people who do not run yet (complete beginners, beginners facing an
 * event from zero) and runners coming back from nothing. Kilometres mean
 * little to someone who cannot yet run ten minutes; the session is a time,
 * the pace is "able to talk", and walking is part of the prescription.
 *
 * Progression is on total weekly minutes, never more than +10% (or 5 min),
 * and the running share of each session grows along a ladder: the NHS
 * Couch-to-5K structure, flattened so the weekly time never jumps.
 */
import { DAYS } from '../periodization.js'
import { heartRateFor } from '../heart-rate.js'
import { SAFE, WALKING_PLAN } from './rules.js'
import { pickRunDays } from './days.js'

const WARMUP_MIN = 5
const COOLDOWN_MIN = 5
const WALK_PACE = 11 // min/km, brisk walking
const SESSION_STEP_MIN = 5 // most any one session may grow in a week
const WEEKLY_RUN_STEP_MIN = 10 // most the weekly running minutes may grow

/** Main sets. `continuous` rungs are plain running for that many minutes. */
export const LADDERS = {
  // 20-22 minute main sets; the running share climbs, the time barely moves.
  // Running minutes per session go 8, 10, 12, 14, 16, 18, 20: on three run
  // days that is +6 a week, inside the +10 running-minute cap (decision 6).
  standard: [
    { repeats: 8, run: 60, walk: 90 },
    { repeats: 5, run: 120, walk: 120 },
    { repeats: 4, run: 180, walk: 120 },
    { repeats: 3, run: 280, walk: 120 },
    { repeats: 2, run: 480, walk: 180 },
    { repeats: 2, run: 540, walk: 120 },
    { repeats: 2, run: 600, walk: 60 },
    { continuous: 20 },
  ],
  // Older runners and walkers: 30-second bouts first (beginners.md).
  gentle: [
    { repeats: 10, run: 30, walk: 90 },
    { repeats: 10, run: 45, walk: 75 },
    { repeats: 8, run: 60, walk: 90 },
    { repeats: 7, run: 90, walk: 90 },
    { repeats: 6, run: 120, walk: 90 },
    { repeats: 5, run: 180, walk: 90 },
    { repeats: 4, run: 240, walk: 90 },
    { repeats: 3, run: 360, walk: 90 },
    { repeats: 2, run: 600, walk: 60 },
    { continuous: 20 },
  ],
  // Goom 2019 postpartum table (p03 section 2.8), three sessions a week:
  // 8 x 1 / 1.5, 6 x 1.5 / 2, then on to 20 minutes non-stop. Weeks 3 and 6
  // of the research table (5 x 2 + 1 x 3 = 13 run minutes; 2 x 8 = 16) are
  // cut to 12 and 15/18 run minutes so that three sessions never add more
  // than +10 running minutes a week (decision 6).
  postpartum: [
    { repeats: 8, run: 60, walk: 90 },
    { repeats: 6, run: 90, walk: 120 },
    { repeats: 6, run: 120, walk: 90 },
    { repeats: 4, run: 180, walk: 90 },
    { repeats: 3, run: 300, walk: 120 },
    { repeats: 2, run: 540, walk: 120 },
    { continuous: 20 },
  ],
  // p06 section 4.1 (return from injury), levels 1-8, with rungs added where
  // three sessions a week would add more than +10 running minutes (decision
  // 6): 5, 8, 10, 12, 15, 18, 20 running minutes, then 20 non-stop. The table
  // is walked from level 1 — skipping levels 1-3 needs a soft-tissue injury,
  // under 14 days off and passed readiness tests, none of which is known.
  injury: [
    { repeats: 10, run: 30, walk: 60 },
    { repeats: 8, run: 60, walk: 60 },
    { repeats: 5, run: 120, walk: 75 },
    { repeats: 6, run: 120, walk: 60 },
    { repeats: 5, run: 180, walk: 60 },
    { repeats: 3, run: 360, walk: 60 },
    { repeats: 2, run: 600, walk: 60 },
    { continuous: 20 },
  ],
  // A comeback from nothing: the lungs remember, tendons have detrained.
  // Close to injuries.md's return-to-run protocol (1-2 min bouts, walk
  // between), but quicker up the ladder than a first-time beginner.
  returning: [
    { repeats: 6, run: 120, walk: 60 },
    { repeats: 5, run: 180, walk: 60 },
    { repeats: 4, run: 240, walk: 60 },
    { repeats: 3, run: 360, walk: 60 },
    { repeats: 2, run: 600, walk: 60 },
    { continuous: 20 },
  ],
}

const mainMinutes = (rung) =>
  rung.continuous ?? (rung.repeats * (rung.run + rung.walk) - rung.walk) / 60

const runMinutes = (rung) => rung.continuous ?? (rung.repeats * rung.run) / 60

function clock(sec) {
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`
}

/** One session as a stored day: segments carry the prescription as text. */
function sessionDay({ day, rung, kind = 'easy', age, runPace, title }) {
  const main = Math.round(mainMinutes(rung))
  const running = runMinutes(rung)
  const walking = main - running
  const km = Math.max(1, Math.round(running / runPace + walking / WALK_PACE))
  const total = WARMUP_MIN + main + COOLDOWN_MIN
  const hr = heartRateFor(age, { paceKey: 'easy' })
  const continuous = Boolean(rung.continuous)
  const type = continuous ? (kind === 'long' ? 'long' : 'easy') : 'walk_run'

  return {
    day,
    type,
    title: title || (continuous ? (kind === 'long' ? 'Daljši tek' : 'Lahkoten tek') : 'Hoja-tek'),
    time_based: true,
    intensity: 'easy',
    pace_key: 'easy',
    pace: 'pogovorni tempo',
    pace_range: null,
    distance_km: km,
    hard_km: 0,
    duration_min: total,
    duration_range: null,
    hr,
    walk_run: {
      warmup_min: WARMUP_MIN,
      cooldown_min: COOLDOWN_MIN,
      repeats: rung.repeats ?? null,
      run_sec: rung.run ?? null,
      walk_sec: rung.walk ?? null,
      continuous_min: rung.continuous ?? null,
      run_min_total: Math.round(running),
    },
    segments: [
      { kind: 'warmup', label: 'OGREVANJE', text: `${WARMUP_MIN} min hitre hoje`, duration_min: WARMUP_MIN, hr: null },
      {
        kind: 'main',
        label: 'GLAVNI DEL',
        text: continuous
          ? `${rung.continuous} min neprekinjenega teka v pogovornem tempu`
          : `${rung.repeats} × (${clock(rung.run)} teka + ${clock(rung.walk)} hoje)`,
        duration_min: main,
        hr,
      },
      { kind: 'cooldown', label: 'OHLAJANJE', text: `${COOLDOWN_MIN} min hoje`, duration_min: COOLDOWN_MIN, hr: null },
    ],
    is_segmented: true,
  }
}

/** A brisk walk as a stored day: talk-test effort, about 5.5 km/h. */
function walkDay(day, minutes, age) {
  const hr = heartRateFor(age, { paceKey: 'easy' })
  return {
    day, type: 'walk', title: 'Hitra hoja', time_based: true, intensity: 'easy', pace_key: 'easy',
    pace: 'hitra hoja, še lahko govoriš (RPE 3–4)', pace_range: null,
    distance_km: Math.round((minutes / WALK_PACE) * 10) / 10, hard_km: 0, duration_min: minutes,
    duration_range: null, hr,
    segments: [{ kind: 'main', label: 'GLAVNI DEL', text: `${minutes} min hitre hoje`, duration_min: minutes, hr }],
    is_segmented: true,
  }
}

function walkWeeks(minutes, walkDays, age, phase, { recoveryEvery = 0, longFrom = null, longExtra = 0 } = {}) {
  return minutes.map((min, i) => {
    const isRecovery = recoveryEvery > 0 && (i + 1) % recoveryEvery === 0
    const each = isRecovery ? Math.max(15, Math.round((min * 0.8) / 5) * 5) : min
    const days = DAYS.map((day) => {
      if (!walkDays.includes(day)) return rest(day)
      const long = longFrom !== null && i + 1 >= longFrom && !isRecovery && day === walkDays[walkDays.length - 1]
      return walkDay(day, each + (long ? longExtra : 0), age)
    })
    return {
      week_number: i + 1, phase, is_recovery: isRecovery, unit: 'time',
      target_minutes: days.reduce((s, d) => s + (d.duration_min || 0), 0),
      target_volume_km: Math.round(days.reduce((s, d) => s + (d.distance_km || 0), 0) * 10) / 10,
      intent: null, days,
    }
  })
}

/** BMI 40+ (p05 r4): walking only, 20 up to 45-60 minutes, no running prescribed. */
export function buildWalkingPlan({ available = null, age = null, days = WALKING_PLAN.sessions } = {}) {
  const walkDays = pickRunDays({ count: Math.min(WALKING_PLAN.sessions, Math.max(2, days)), available, noBackToBack: false })
  return {
    weeks: walkWeeks(WALKING_PLAN.minutes, walkDays, age, 'walk', {
      recoveryEvery: 4, longFrom: WALKING_PLAN.longWalkFrom, longExtra: WALKING_PLAN.longWalkExtra,
    }),
    runDays: walkDays,
  }
}

function rest(day) {
  return {
    day, type: 'rest', title: 'Počitek', distance_km: 0, duration_min: 0,
    pace: 'rest', pace_key: null, intensity: 'rest', segments: [], is_segmented: false,
  }
}

const weekMinutes = (days) => days.reduce((s, d) => s + (d.type === 'race' ? 0 : d.duration_min || 0), 0)

/**
 * @param {object} opts
 * @param {number} opts.totalWeeks
 * @param {string} opts.ladder - 'standard' | 'gentle' | 'returning'
 * @param {number} opts.runDayCount
 * @param {string[]|null} opts.available
 * @param {number} opts.runPace - min/km, for distance estimates
 * @param {number|null} opts.age
 * @param {number} [opts.targetLongMin] - stop growing the long session here
 * @param {number} [opts.targetEasyMin] - and the other sessions here
 * @param {object|null} [opts.race] - { distanceKm, walkBreaks } in the final week
 * @param {string} [opts.ladderPhase] - phase name for ladder weeks
 * @returns {{weeks: Array, reachedTarget: boolean}}
 */
export function buildTimePlan({ walkBase = null, ...opts }) {
  if (!walkBase || opts.totalWeeks <= walkBase.minutes.length) return buildTimeCore(opts)
  // p05 r8-9: brisk walking first, then the ladder from week one.
  const runDays = pickRunDays({
    count: Math.min(walkBase.sessions, Math.max(2, opts.runDayCount ?? 3)), available: opts.available, noBackToBack: false,
  })
  const base = walkWeeks(walkBase.minutes, runDays, opts.age, 'walk_base')
  const rest = buildTimeCore({ ...opts, totalWeeks: opts.totalWeeks - base.length })
  return {
    ...rest,
    weeks: [...base, ...rest.weeks.map((w) => ({ ...w, week_number: w.week_number + base.length }))],
  }
}

function buildTimeCore({
  totalWeeks, ladder = 'standard', runDayCount = 3, available = null, runPace = 7.5, age = null,
  targetLongMin = 30, targetEasyMin = 30, race = null, ladderPhase = 'walk_run', racePhase = 'taper',
}) {
  const steps = LADDERS[ladder]
  const runDays = pickRunDays({ count: runDayCount, available, noBackToBack: true })
  const longDay = runDays[runDays.length - 1]

  const weeks = []
  let lastTotal = null // weekly minutes of the last progressive week
  let easyMin = 20
  let longMin = 20
  let lastRung = steps[0] // what a normal session looked like last week
  let continuousWeeks = 0
  let reachedTarget = false

  for (let i = 0; i < totalWeeks; i++) {
    const isRaceWeek = Boolean(race) && i === totalWeeks - 1
    const onLadder = i < steps.length && !steps[i].continuous
    let days
    let phase
    let isRecovery = false

    if (isRaceWeek) {
      // Race week: at most two short easy sessions, well clear of the event.
      phase = racePhase
      const raceDay = race.day && DAYS.includes(race.day) ? race.day : longDay
      const short = lastRung.continuous
        ? { continuous: Math.max(10, Math.round(lastRung.continuous * 0.6)) }
        : { ...lastRung, repeats: Math.max(2, Math.round(lastRung.repeats * 0.6)) }
      const keep = runDays
        .filter((d) => DAYS.indexOf(raceDay) - DAYS.indexOf(d) >= 2)
        .slice(-2)
      days = DAYS.map((day) => {
        if (day === raceDay) return raceDayFor(day, race, runPace, age)
        if (keep.includes(day)) return sessionDay({ day, rung: short, age, runPace })
        return rest(day)
      })
    } else if (onLadder) {
      // On the walk-run ladder: time stays put, the running share climbs.
      phase = ladderPhase
      lastRung = steps[i]
      days = DAYS.map((day) => (runDays.includes(day) ? sessionDay({ day, rung: lastRung, age, runPace }) : rest(day)))
    } else {
      phase = 'base'
      const sessions = runDays.length
      continuousWeeks++
      isRecovery = continuousWeeks > 1 && continuousWeeks % SAFE.recoveryEvery === 0
      let easy = easyMin
      let long = longMin
      if (continuousWeeks === 1) {
        // First non-stop week is the ladder's last rung exactly: 20 minutes.
        easyMin = longMin = easy = long = 20
      } else if (isRecovery) {
        easy = Math.max(15, Math.round(easyMin * 0.8))
        long = Math.max(15, Math.round(longMin * 0.8))
      } else {
        // Grow weekly minutes by at most 10% (or 5 min): long session first.
        // Decision 6: and never more than +10 running minutes a week.
        const allowed = Math.min(
          lastTotal + WEEKLY_RUN_STEP_MIN,
          Math.max(lastTotal + SAFE.weeklyFloorMin, Math.floor(lastTotal * (1 + SAFE.weeklyIncrease)))
        )
        const overhead = sessions * (WARMUP_MIN + COOLDOWN_MIN)
        let budget = allowed - overhead - (longMin + easyMin * (sessions - 1))
        // No single session grows by more than 5 minutes in a week: the
        // weekly total can hide a big jump in one run (beginners.md).
        const longGrow = Math.max(0, Math.min(budget, targetLongMin - longMin, SESSION_STEP_MIN))
        longMin += longGrow
        budget -= longGrow
        if (sessions > 1 && budget >= sessions - 1) {
          const each = Math.min(SESSION_STEP_MIN, Math.floor(budget / (sessions - 1)))
          easyMin = Math.min(targetEasyMin, easyMin + each)
        }
        easy = easyMin
        long = longMin
      }
      if (longMin >= targetLongMin && easyMin >= Math.min(targetEasyMin, targetLongMin)) reachedTarget = true
      lastRung = { continuous: easy }
      days = DAYS.map((day) => {
        if (!runDays.includes(day)) return rest(day)
        const isLong = day === longDay && sessions > 1
        return sessionDay({
          day, rung: { continuous: isLong ? long : easy }, kind: isLong ? 'long' : 'easy', age, runPace,
        })
      })
    }

    const total = weekMinutes(days)
    if (!isRaceWeek && !isRecovery) lastTotal = total
    weeks.push({
      week_number: i + 1,
      phase,
      is_recovery: isRecovery,
      unit: 'time',
      target_minutes: total,
      target_volume_km: days.reduce((s, d) => s + (d.distance_km || 0), 0),
      intent: null,
      days,
    })
  }
  return { weeks, reachedTarget, runDays }
}

/** The event, in a beginner plan: finish it, walking whenever needed. */
function raceDayFor(day, race, runPace, age) {
  const mixPace = race.walkBreaks ? (runPace + WALK_PACE) / 2 : runPace
  const minutes = Math.round(race.distanceKm * mixPace)
  return {
    day,
    type: 'race',
    title: 'Dan tekme',
    time_based: true,
    intensity: 'easy',
    pace_key: 'easy',
    pace: race.walkBreaks ? 'pogovorni tempo, s hojo po potrebi' : 'pogovorni tempo',
    pace_range: null,
    distance_km: Math.round(race.distanceKm * 10) / 10,
    hard_km: 0,
    duration_min: minutes,
    duration_range: { min: Math.round(minutes * 0.9), max: Math.round(minutes * 1.15) },
    hr: heartRateFor(age, { paceKey: 'easy' }),
    walk_breaks: Boolean(race.walkBreaks),
    segments: [],
    is_segmented: false,
  }
}

/** How many weeks the ladder takes before continuous running. */
export function ladderLength(ladder) {
  return LADDERS[ladder].length - 1
}
