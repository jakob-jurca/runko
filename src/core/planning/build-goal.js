/**
 * build-goal.js — the pieces of a goal block that are not a scenario of their
 * own: the 5 km time trials of the speed goal, and marking strides optional.
 *
 * A time trial takes the place of a session the week already held (its
 * quality session if it had one, else an easy run), so the week's kilometres,
 * the number of hard days and the low-intensity share stay what the builder
 * and the intensity rules made them. When a week cannot hold the trial inside
 * those limits the caller is told, and the goal is adjusted instead.
 */
import { DAYS, makeDay, enrichDays } from '../periodization.js'
import { heartRateFor } from '../heart-rate.js'
import { TRIAL_KM } from './goals.js'
import { hardGapDays } from './intensity.js'

const HARD = new Set(['tempo', 'interval', 'repetition'])
const idx = (d) => DAYS.indexOf(d.day)
const km = (d) => d.distance_km || 0

/** One trial session: a jog, the 5 km as evenly and as fast as the runner can, a jog. */
export function trialDay({ day, distanceKm, paces, age }) {
  const total = Math.max(TRIAL_KM, Math.round(distanceKm))
  const extra = total - TRIAL_KM
  const warm = Math.ceil(extra * 0.6)
  const cool = extra - warm
  // A 5 km race pace sits between threshold and interval pace.
  const trialPace = (paces.threshold + paces.interval) / 2
  const easyHr = heartRateFor(age, { paceKey: 'easy' })
  const easy = `${Math.floor(paces.easy)}:${String(Math.round((paces.easy % 1) * 60)).padStart(2, '0')}/km`
  const seg = (kind, label, text, distance, hr) => ({
    kind, label, text, distance_km: distance, duration_min: Math.round(distance * (kind === 'main' ? trialPace : paces.easy)), hr,
  })
  const segments = [
    ...(warm ? [seg('warmup', 'OGREVANJE', `${warm} km lahkotnega teka (${easy})`, warm, easyHr)] : []),
    seg('main', 'PREIZKUS', `${TRIAL_KM} km enakomerno, čim hitreje: od prve do zadnje minute isti napor`, TRIAL_KM,
      heartRateFor(age, { paceKey: 'interval', intensity: 'hard' })),
    ...(cool ? [seg('cooldown', 'OHLAJANJE', `${cool} km lahkotnega teka ali hoje`, cool, easyHr)] : []),
  ]
  const duration = segments.reduce((s, x) => s + x.duration_min, 0)
  return {
    day,
    type: 'time_trial',
    title: 'Preizkus na 5 km',
    variant: 'time_trial',
    trial_km: TRIAL_KM,
    distance_km: total,
    hard_km: TRIAL_KM,
    duration_min: duration,
    duration_range: { min: Math.round(duration * 0.95), max: Math.round(duration * 1.1) },
    pace: 'enakomerno, čim hitreje',
    pace_range: null,
    pace_key: 'interval',
    intensity: 'hard',
    hr: heartRateFor(age, { paceKey: 'interval', intensity: 'hard' }),
    note: 'Čas vpiši po teku: je tvoje merilo napredka.',
    segments,
    is_segmented: true,
  }
}

function toEasyStrides(d, paces, age) {
  const easy = makeDay({ day: d.day, type: 'easy', distanceKm: km(d), paceKey: 'easy', paces, intensity: 'easy' })
  return enrichDays([{ ...easy, title: 'Lahkoten tek s pospeški', variant: 'strides', hard_km: 0 }], paces, age)[0]
}

function withKm(d, distance, paces, age) {
  const paceMin = paces[d.pace_key] ?? paces.easy
  return enrichDays([{ ...d, distance_km: distance, duration_min: Math.round(distance * paceMin) }], paces, age)[0]
}

/**
 * Put the trial into one week. Returns the new week, or null when the week
 * cannot hold it inside its own kilometres and low-intensity share.
 */
function placeTrial(week, { paces, age, gap, minLow }) {
  if (week.unit !== 'distance' || week.days.some((d) => d.time_based || d.type === 'race')) return null
  let days = week.days.slice()
  const long = days.find((d) => d.type === 'long')
  const hosts = days.filter((d) => d.type === 'easy' || HARD.has(d.type))
  if (!hosts.length) return null

  // The host is the day furthest from the other hard days and the long run;
  // a quality session that is already there is preferred (the count of hard
  // days then does not change).
  const spread = (h) => Math.min(9, ...[...days.filter((o) => o !== h && HARD.has(o.type)), ...(long ? [long] : [])]
    .map((o) => Math.abs(idx(o) - idx(h))))
  const host = [...hosts].sort((a, b) =>
    (HARD.has(b.type) ? 1 : 0) - (HARD.has(a.type) ? 1 : 0) || spread(b) - spread(a) || km(b) - km(a))[0]

  const trial = trialDay({ day: host.day, distanceKm: km(host), paces, age })
  let deficit = trial.distance_km - km(host)
  days = days.map((d) => (d === host ? trial : d))

  // A trial longer than the session it replaces is paid for by the easy runs
  // (never below 20 minutes), then by the long run, so the week's kilometres
  // stay exactly what the progression allowed.
  const minEasy = Math.max(2, Math.ceil(20 / paces.easy))
  for (const e of days.filter((d) => d.type === 'easy').sort((a, b) => km(b) - km(a))) {
    if (deficit <= 0) break
    const take = Math.min(deficit, km(e) - minEasy)
    if (take > 0) {
      days = days.map((d) => (d === e ? withKm(e, km(e) - take, paces, age) : d))
      deficit -= take
    }
  }
  if (deficit > 0 && long) {
    const take = Math.min(deficit, km(long) - Math.max(4, TRIAL_KM - 1))
    if (take > 0) {
      days = days.map((d) => (d === long ? withKm(long, km(long) - take, paces, age) : d))
      deficit -= take
    }
  }
  if (deficit > 0) return null

  // No other quality session inside the hard-session gap of the trial.
  for (const q of days.filter((d) => HARD.has(d.type))) {
    if (Math.abs(idx(q) - idx(trial)) < gap) days = days.map((d) => (d === q ? toEasyStrides(q, paces, age) : d))
  }
  // And the week still holds its low-intensity share.
  const share = () => {
    const total = days.reduce((s, d) => s + km(d), 0)
    return total ? 1 - days.reduce((s, d) => s + (d.hard_km || 0), 0) / total : 1
  }
  while (share() < minLow - 0.001) {
    const q = days.find((d) => HARD.has(d.type))
    if (!q) return null
    days = days.map((d) => (d === q ? toEasyStrides(q, paces, age) : d))
  }
  return {
    ...week,
    days,
    trial: true,
    target_volume_km: Math.round(days.reduce((s, d) => s + km(d), 0)),
  }
}

/**
 * The first and the last week of the block each get the 5 km time trial.
 *
 * @param {Array} weeks
 * @param {{paces: object, age: number|null, hardGapHours?: number, runDays: number}} ctx
 * @returns {{ok: boolean, weeks: Array}} ok=false: some week could not hold it
 */
export function insertTimeTrials(weeks, { paces, age, hardGapHours = 48, runDays }) {
  const opts = { paces, age, gap: hardGapDays(hardGapHours), minLow: runDays <= 3 ? 0.7 : 0.75 }
  const out = weeks.slice()
  for (const i of new Set([0, weeks.length - 1])) {
    const placed = placeTrial(out[i], opts)
    if (!placed) return { ok: false, weeks }
    out[i] = placed
  }
  return { ok: true, weeks: out }
}

/** Strides in a goal block are a choice, never a duty. */
export function markStridesOptional(weeks) {
  return weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => (d.variant === 'strides' ? { ...d, optional_variety: true } : d)),
  }))
}
