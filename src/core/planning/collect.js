/**
 * Step 1 — COLLECT.
 *
 * Gathers everything the runner told us (profile fields, notes, coach memory,
 * logged runs, answers to follow-up questions) into one normalised object.
 * Nothing is judged here; later steps only ever read this object, so what a
 * plan was based on is always visible in one place.
 */
import { DAYS, deriveConstraints, mergeProfileConstraints } from '../periodization.js'

const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Monday of the week containing `d`, as an ISO date. */
export function mondayOf(d) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return isoDate(m)
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Signals read from free text (notes + coach memory), English and Slovenian.
 * Answers to follow-up questions always override these.
 */
const SIGNALS = {
  injury: /poskodb|injur|operacij|surgery|fizioterap|physio|stress fracture|zlom|tendin|koleno|kolena|ahilov|ahilova/,
  returning: /premor|pavz|vraca|vrnitev|vrnil|nisem tekl|po nosecnost|nosecnost|porod|pregnan|postpartum|break|comeback|coming back|returning|time off|years ago|let nazaj|leti nazaj|leta nazaj|spet zac/,
  maintain: /ohrani|vzdrzev|maintain|hold my|keep my fitness|obdrza/,
  neverRan: /nikoli (nisem )?tekl|se nikoli|never ran|never run|nikdar nisem/,
  walks: /hodim|hoja|walk/,
}

/** Choice values the follow-up questions produce, mapped to numbers. */
const VOLUME_ANSWERS = { 0: 0, 5: 5, 15: 15, 30: 30, 50: 50 }

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {object} opts
 * @param {object} opts.profile  - the users row (or the onboarding draft of it)
 * @param {Array}  [opts.runs]   - logged runs {date, distance, duration, effort}
 * @param {Array}  [opts.memories] - coach_memory rows {category, content}
 * @param {object} [opts.answers] - {questionId: value} from the clarify step
 * @param {Date}   [opts.today]
 */
export function collectInputs({ profile = {}, runs = [], memories = [], answers = {}, today = new Date() } = {}) {
  const startDate = mondayOf(today)
  const todayIso = isoDate(today)

  // --- goal ----------------------------------------------------------------
  let distanceKm = numberOrNull(profile.target_distance_km)
  if (!(distanceKm > 0)) distanceKm = null
  let eventDate = profile.event_date || null
  const targetTimeMin = numberOrNull(profile.target_time_min) > 0 ? Number(profile.target_time_min) : null

  // Answer to "your race date has passed": train without one, or a new date.
  if (answers.event_date === 'no_date') eventDate = null
  else if (/^\d{4}-\d{2}-\d{2}$/.test(answers.event_date || '')) eventDate = answers.event_date

  const eventInPast = Boolean(eventDate && eventDate < todayIso)
  let weeksToEvent = null
  let eventWeekday = null
  if (eventDate && !eventInPast) {
    const start = new Date(startDate + 'T00:00:00')
    const event = new Date(eventDate + 'T00:00:00')
    // Weeks in the plan INCLUDING the race week: race this Sunday = 1.
    weeksToEvent = Math.floor((event - start) / (7 * 86_400_000)) + 1
    eventWeekday = DAYS[(event.getDay() + 6) % 7]
  }

  // --- history and current training ----------------------------------------
  let weeklyKm = numberOrNull(profile.weekly_volume_km)
  if (answers.current_volume !== undefined && answers.current_volume !== null) {
    weeklyKm = VOLUME_ANSWERS[answers.current_volume] ?? numberOrNull(answers.current_volume)
  }
  let longestKm = numberOrNull(profile.longest_run_km)
  if (answers.longest_run !== undefined && answers.longest_run !== null) {
    longestKm = numberOrNull(answers.longest_run)
  }
  const experienceMonths = numberOrNull(profile.experience_months)

  // --- free text: notes and memory -------------------------------------------
  const notes = String(profile.coach_notes || '').trim()
  const memoryText = memories.map((m) => `${m.category || ''} ${m.content || ''}`).join(' \n ')
  const text = norm(`${notes}\n${memoryText}`)
  const injuryMemory = memories.some((m) => m.category === 'injury')

  const signals = {
    injury: injuryMemory || SIGNALS.injury.test(text),
    returning: SIGNALS.returning.test(text),
    maintain: SIGNALS.maintain.test(text),
    neverRan: SIGNALS.neverRan.test(text) || experienceMonths === 0 || profile.hasRunBefore === false,
    walks: SIGNALS.walks.test(text),
  }
  // Explicit answers beat anything inferred from prose.
  if (answers.returning === 'no') {
    signals.returning = false
    signals.injury = injuryMemory && signals.injury
  } else if (answers.returning === 'break') {
    signals.returning = true
  } else if (answers.returning === 'injury') {
    signals.returning = true
    signals.injury = true
  }
  // A runner back after giving birth is coming back, whatever the notes say.
  if (profile.pregnancy_status === 'postpartum') signals.returning = true
  if (answers.intent === 'maintain') signals.maintain = true
  if (answers.intent === 'build') signals.maintain = false

  // --- schedule ------------------------------------------------------------
  const constraints = mergeProfileConstraints(deriveConstraints(memories), profile)
  const availableDays = Array.isArray(profile.available_days)
    ? DAYS.filter((d) => profile.available_days.includes(d))
    : null
  const daysPerWeek = numberOrNull(profile.days_per_week)

  // --- safety and health ---------------------------------------------------
  // Onboarding asks only what safety needs; everything else comes from the
  // optional health profile. Unknown stays null, and every later step treats
  // null as "assume the conservative case".
  const bool = (v) => (v === true || v === false ? v : null)
  const pregnancy = ['none', 'pregnant', 'postpartum'].includes(profile.pregnancy_status)
    ? profile.pregnancy_status
    : null
  const safety = {
    pregnancyStatus: pregnancy,
    weeksPostpartum: pregnancy === 'postpartum' ? numberOrNull(profile.weeks_postpartum) : null,
    painAtRest: bool(profile.pain_at_rest),
    breakDays: numberOrNull(profile.break_days),
    injuryLast12m: bool(profile.injury_last_12m),
  }
  const heightCm = numberOrNull(profile.height_cm)
  const weightKg = numberOrNull(profile.weight)
  const health = {
    sex: ['female', 'male'].includes(profile.sex) ? profile.sex : null,
    heightCm,
    weightKg,
    bmi: heightCm && weightKg ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10 : null,
    cardiacSymptoms: bool(profile.cardiac_symptoms),
    knownCondition: bool(profile.known_condition),
    medicalClearance: bool(profile.medical_clearance),
    caesarean: bool(profile.caesarean),
    postpartumCleared: bool(profile.postpartum_cleared),
    marathonsCompleted: numberOrNull(profile.marathons_completed),
  }

  // --- runs ----------------------------------------------------------------
  const normalizedRuns = runs
    .map((r) => ({
      date: r.date,
      distance: Number(r.distance),
      duration: Number(r.duration),
      effort: Number(r.effort) || 3,
    }))
    .filter((r) => r.date && r.distance > 0 && r.duration > 0)

  return {
    today: todayIso,
    startDate,
    age: numberOrNull(profile.age),
    fitnessLevel: profile.fitness_level || null,
    experienceMonths,
    statedWeeklyKm: weeklyKm,
    statedLongestKm: longestKm,
    daysPerWeek: daysPerWeek && daysPerWeek > 0 ? Math.min(7, Math.round(daysPerWeek)) : null,
    availableDays: availableDays?.length ? availableDays : null,
    goal: {
      distanceKm,
      targetTimeMin,
      eventDate,
      eventInPast,
      weeksToEvent,
      eventWeekday,
    },
    notes,
    signals,
    safety,
    health,
    constraints,
    runs: normalizedRuns,
    answers: { ...answers },
  }
}

/** A copy of the inputs with a different goal — used once a safer goal is adopted. */
export function withGoal(inputs, { distanceKm, eventDate, targetTimeMin = null }) {
  let weeksToEvent = null
  let eventWeekday = null
  if (eventDate) {
    const start = new Date(inputs.startDate + 'T00:00:00')
    const event = new Date(eventDate + 'T00:00:00')
    weeksToEvent = Math.floor((event - start) / (7 * 86_400_000)) + 1
    eventWeekday = DAYS[(event.getDay() + 6) % 7]
  }
  return {
    ...inputs,
    goal: { distanceKm, targetTimeMin, eventDate, eventInPast: false, weeksToEvent, eventWeekday },
  }
}

/** The part of the inputs worth storing with the plan (no raw runs or notes). */
export function inputsSummary(inputs) {
  return {
    start_date: inputs.startDate,
    age: inputs.age,
    fitness_level: inputs.fitnessLevel,
    experience_months: inputs.experienceMonths,
    weekly_volume_km: inputs.statedWeeklyKm,
    longest_run_km: inputs.statedLongestKm,
    days_per_week: inputs.daysPerWeek,
    available_days: inputs.availableDays,
    goal: inputs.goal,
    signals: inputs.signals,
    safety: inputs.safety,
    // Health data is stored only as far as the engine used it: the derived
    // BMI and the flags, never height or weight themselves.
    health: {
      sex: inputs.health.sex,
      bmi: inputs.health.bmi,
      cardiac_symptoms: inputs.health.cardiacSymptoms,
      known_condition: inputs.health.knownCondition,
      medical_clearance: inputs.health.medicalClearance,
      caesarean: inputs.health.caesarean,
      postpartum_cleared: inputs.health.postpartumCleared,
      marathons_completed: inputs.health.marathonsCompleted,
    },
    logged_runs: inputs.runs.length,
    answers: inputs.answers,
  }
}
