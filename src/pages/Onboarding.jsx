import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveProfile, addWorkout, addDaysISO, todayISO } from '../core/db'
import { createInitialPlan, previewPlan, ClarificationNeededError, PlanBlockedError } from '../core/plan'
import {
  parseDuration, targetTimeFromParts, targetTimeToParts, targetTimeHasSeconds, targetPaceCheck,
} from '../core/periodization'
import { FullScreenSpinner } from '../components/Spinner'
import { t } from '../core/strings'

const LEVELS = t.onboarding.levels

/**
 * Shortcuts for the common distances. These are NOT categories — each chip
 * just fills in the number, and any other distance is equally valid.
 */
const DISTANCE_CHIPS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.1, label: 'Polmaraton · 21,1' },
  { km: 42.2, label: 'Maraton · 42,2' },
]

const EXPERIENCE_OPTIONS = t.onboarding.experienceOptions

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const EFFORTS = t.log.efforts



/** Empty intake-run row; initial rows get spaced-out recent default dates. */
const emptyRun = (daysAgo = 0) => ({
  date: addDaysISO(todayISO(), -daysAgo),
  distance: '',
  duration: '',
  effort: 3,
  hr: '',
})

const runValid = (r) => Number(r.distance) > 0 && Number(r.duration) > 0

/** In-progress onboarding survives tab switches, reloads and auth hiccups. */
const STORAGE_KEY = 'runko_onboarding_v1'

function restoreProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

export function clearOnboardingProgress() {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * First non-empty of the in-progress draft, then whatever is already on the
 * profile row, then a blank. This is what lets a runner who skipped
 * onboarding — or who is rebuilding their plan months later — pick up from
 * everything they have already told us instead of retyping it.
 */
/**
 * The target-time fields to start from: the draft's, else a draft saved
 * before the fields were split (one "1:45:00" string), else the profile's.
 */
function initialTargetTime(saved, prof) {
  if (saved.targetTimeParts) return saved.targetTimeParts
  if (saved.targetTime) return targetTimeToParts(parseDuration(saved.targetTime))
  return targetTimeToParts(prof.target_time_min)
}

function prefill(draftValue, profileValue, fallback = '') {
  if (draftValue !== undefined && draftValue !== null && draftValue !== '') return draftValue
  if (profileValue !== undefined && profileValue !== null) return profileValue
  return fallback
}

/**
 * Onboarding v4 — two paths after signup:
 *  QUICK:    personal data only.
 *  THOROUGH: personal data → running history (3 recent runs, or a 3 km test
 *            run for brand-new runners) → free-text notes.
 * Both then run the planning pipeline locally (core/planning, no AI): if
 * something critical is missing or contradictory it asks up to three
 * questions, and if the goal is unsafe it shows the coach's verdict and lets
 * the runner pick the safer goal to build. Only then is the plan built.
 * Intake runs are saved as real workout rows; everything else feeds the
 * AI plan generator via the intake object.
 *
 * Every step is skippable ("Skip for now"): that saves the profile data
 * entered so far and drops the runner into the app with no plan. The draft
 * is deliberately KEPT on skip — reopening the flow from the dashboard's
 * "Create my plan" or Settings resumes exactly where they left off. It is
 * only cleared once a plan has actually been built.
 *
 * The same component serves the later rebuild (/onboarding?rebuild=1),
 * which is limited to once a month — see core/plan.js.
 */
export default function Onboarding() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // Restore any in-progress onboarding once, then feed the initial states.
  const saved = useRef(restoreProgress()).current
  // The profile as it was when the flow opened; null on a first-time signup.
  const prof = useRef(profile).current || {}
  const rebuilding = Boolean(prof.id)

  const [step, setStep] = useState(saved.step || 'path')
  const [building, setBuilding] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState('')

  // collected data
  const [path, setPath] = useState(saved.path || '') // 'quick' | 'thorough'
  const [name, setName] = useState(prefill(saved.name, prof.name))
  const [age, setAge] = useState(prefill(saved.age, prof.age))
  const [weight, setWeight] = useState(prefill(saved.weight, prof.weight))
  const [level, setLevel] = useState(prefill(saved.level, prof.fitness_level))
  const [eventDate, setEventDate] = useState(prefill(saved.eventDate, prof.event_date))
  // The goal is a DISTANCE IN KM, not a race type.
  const [targetDistance, setTargetDistance] = useState(
    prefill(saved.targetDistance, prof.target_distance_km)
  )
  const [hasDate, setHasDate] = useState(
    saved.hasDate ?? Boolean(prof.event_date)
  )
  // Hours / minutes / seconds as separate fields — see targetTimeFromParts.
  const [targetTimeParts, setTargetTimeParts] = useState(() => initialTargetTime(saved, prof))
  const setTargetTimePart = (key) => (e) => setTargetTimeParts((p) => ({ ...p, [key]: e.target.value }))
  const [experienceMonths, setExperienceMonths] = useState(
    prefill(saved.experienceMonths, prof.experience_months)
  )
  const [weeklyVolume, setWeeklyVolume] = useState(
    prefill(saved.weeklyVolume, prof.weekly_volume_km)
  )
  const [longestRun, setLongestRun] = useState(prefill(saved.longestRun, prof.longest_run_km))
  const [daysPerWeek, setDaysPerWeek] = useState(prefill(saved.daysPerWeek, prof.days_per_week, '4'))
  const [availableDays, setAvailableDays] = useState(
    saved.availableDays ?? (Array.isArray(prof.available_days) ? prof.available_days : [])
  )
  const [hasRun, setHasRun] = useState(saved.hasRun ?? null) // true | false | null
  const [runs, setRuns] = useState(saved.runs || [emptyRun(2), emptyRun(5), emptyRun(8)])
  const [testRun, setTestRun] = useState(saved.testRun || { ...emptyRun(0), distance: '3' })
  const [notes, setNotes] = useState(prefill(saved.notes, prof.coach_notes))
  // Safety questions (core/planning/gate.js). Booleans stay null until answered.
  const [pregnancyStatus, setPregnancyStatus] = useState(prefill(saved.pregnancyStatus, prof.pregnancy_status))
  const [weeksPostpartum, setWeeksPostpartum] = useState(prefill(saved.weeksPostpartum, prof.weeks_postpartum))
  const [painAtRest, setPainAtRest] = useState(saved.painAtRest ?? prof.pain_at_rest ?? null)
  const [injury12m, setInjury12m] = useState(saved.injury12m ?? prof.injury_last_12m ?? null)
  const [breakBand, setBreakBand] = useState(
    saved.breakBand ?? (prof.break_days === null || prof.break_days === undefined ? '' : String(prof.break_days))
  )

  // Planning pipeline follow-up: its questions, the runner's answers, and the
  // preview (verdict) the clarify step shows before anything is built.
  const [answers, setAnswers] = useState(saved.answers || {})
  const [preview, setPreview] = useState(null)
  const [preparing, setPreparing] = useState(false)

  // Persist progress on every change so switching tabs, reloads or an auth
  // re-login never resets the flow. Cleared in finish() on success.
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step, path, name, age, weight, level, eventDate,
        targetDistance, hasDate, targetTimeParts, experienceMonths, weeklyVolume,
        longestRun, daysPerWeek, availableDays,
        hasRun, runs, testRun, notes, answers,
        pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand,
      })
    )
  }, [step, path, name, age, weight, level, eventDate, targetDistance, hasDate,
      targetTimeParts, experienceMonths, weeklyVolume, longestRun, daysPerWeek,
      availableDays, hasRun, runs, testRun, notes, answers,
      pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand])

  const stepOrder = useMemo(() => {
    const s = ['path', 'name', 'body', 'level', 'goal', 'experience', 'safety', 'days']
    if (path === 'thorough') {
      s.push('runbefore')
      if (hasRun === true) s.push('runs')
      if (hasRun === false) s.push('gorun')
    }
    s.push('notes')
    if (step === 'clarify') s.push('clarify')
    if (step === 'blocked') s.push('blocked')
    return s
  }, [path, hasRun, step])

  // --- derived goal values -------------------------------------------------
  const targetDistanceValid = Number(targetDistance) > 0 && Number(targetDistance) <= 200
  // Seconds only count where the field is shown (under 10 km).
  const showSeconds = targetTimeHasSeconds(targetDistance)
  const targetTimeMin = targetTimeFromParts({
    ...targetTimeParts,
    seconds: showSeconds ? targetTimeParts.seconds : '',
  })
  /** A date on the calendar makes it an 'event' plan; otherwise 'general'. */
  const goalKind = hasDate && eventDate ? 'event' : 'general'
  /** Live pace feedback, and a nudge when the pace looks mistyped. */
  const paceCheck = targetDistanceValid ? targetPaceCheck(targetTimeMin, Number(targetDistance)) : null

  const stepIdx = Math.max(0, stepOrder.indexOf(step))
  const go = (dir) => setStep(stepOrder[Math.min(stepOrder.length - 1, Math.max(0, stepIdx + dir))])

  /** Everything collected, in the shape core/ai.js expects. */
  const buildIntake = () => ({
    name: name.trim(),
    age: age ? Number(age) : null,
    weight: weight ? Number(weight) : null,
    fitness_level: level,
    goal: goalKind,
    target_distance_km: targetDistanceValid ? Number(targetDistance) : null,
    target_time_min: targetTimeMin,
    event_date: hasDate ? eventDate || null : null,
    experience_months: experienceMonths ? Number(experienceMonths) : null,
    weekly_volume_km: weeklyVolume ? Number(weeklyVolume) : null,
    longest_run_km: longestRun ? Number(longestRun) : null,
    days_per_week: daysPerWeek ? Number(daysPerWeek) : null,
    available_days: availableDays.length ? availableDays : null,
    hasRunBefore: hasRun,
    runs: (hasRun === false ? [testRun] : runs).filter(runValid),
    notes,
  })

  /**
   * The users-row shape, from whatever has been filled in so far. Every field
   * is nullable because a skipped onboarding may have barely any of them.
   */
  const profileFields = () => ({
    name: name.trim() || null,
    age: age ? Number(age) : null,
    weight: weight ? Number(weight) : null,
    fitness_level: level || null,
    // 'event' simply means "there is a date"; the goal itself is the distance.
    goal: goalKind,
    event_name: null, // no named race type any more — the distance is the goal
    event_date: hasDate ? eventDate || null : null,
    target_distance_km: targetDistanceValid ? Number(targetDistance) : null,
    target_time_min: targetTimeMin,
    experience_months: experienceMonths ? Number(experienceMonths) : null,
    weekly_volume_km: weeklyVolume ? Number(weeklyVolume) : null,
    longest_run_km: longestRun ? Number(longestRun) : null,
    days_per_week: daysPerWeek ? Number(daysPerWeek) : null,
    available_days: availableDays.length ? availableDays : null,
    coach_notes: notes.trim() || null,
    pregnancy_status: pregnancyStatus || null,
    weeks_postpartum: pregnancyStatus === 'postpartum' && weeksPostpartum !== '' ? Number(weeksPostpartum) : null,
    pain_at_rest: painAtRest,
    injury_last_12m: injury12m,
    break_days: breakBand === '' || breakBand === 'never' ? null : Number(breakBand),
  })

  /** Every question the safety gate can block on has an answer. */
  const safetyAnswered =
    Boolean(pregnancyStatus) &&
    (pregnancyStatus !== 'postpartum' || weeksPostpartum !== '') &&
    painAtRest !== null &&
    injury12m !== null

  /**
   * "Skip for now" — save what we have, build no plan, go straight into the
   * app. The draft is kept so "Create my plan" can resume from here, and the
   * intake runs stay in it (rather than being written as workouts now) so
   * finishing later can't log them twice.
   */
  const skip = async () => {
    setSkipping(true)
    setError('')
    try {
      await saveProfile(profileFields())
      await refreshProfile()
      navigate('/')
    } catch (err) {
      setError(err.message)
      setSkipping(false)
    }
  }

  /**
   * Run the planning pipeline locally before building: ask its follow-up
   * questions, or show the verdict on an unsafe goal and let the runner pick
   * what to build. Builds straight away when there is nothing to ask.
   */
  const prepare = async (nextAnswers = answers) => {
    // A draft saved before the safety step existed can resume past it: the
    // gate must never run on unanswered safety questions.
    if (!safetyAnswered) {
      setStep('safety')
      return
    }
    setPreparing(true)
    setError('')
    try {
      const intake = path === 'thorough' ? buildIntake() : null
      const result = await previewPlan({ ...prof, ...profileFields() }, intake, nextAnswers)
      setPreview(result)
      if (result.status === 'blocked') {
        setStep('blocked')
        return
      }
      const unsafeUnchosen = result.status === 'ready' && result.verdict === 'unsafe' && !nextAnswers.safe_goal
      if (result.status === 'needs_answers' || unsafeUnchosen) {
        setStep('clarify')
        return
      }
      await finish(nextAnswers)
    } catch (err) {
      setError(err.message)
    } finally {
      setPreparing(false)
    }
  }

  /** Record one answer; re-run the pipeline once every question has one. */
  const answer = (id, value) => {
    const next = { ...answers, [id]: value }
    setAnswers(next)
    const open = (preview?.questions || []).filter((q) => next[q.id] === undefined)
    if (!open.length) prepare(next)
  }

  const finish = async (finalAnswers = answers) => {
    setBuilding(true)
    setError('')
    try {
      // saveProfile resolves the row id from a server-confirmed auth user
      // (with FK-violation retries), so we don't pass the cached session id.
      const savedProfile = await saveProfile(profileFields())

      // Intake runs become real workout rows so the whole app sees them.
      const intake = path === 'thorough' ? buildIntake() : null
      for (const r of intake?.runs ?? []) {
        await addWorkout({
          user_id: savedProfile.id,
          date: r.date,
          distance: Number(r.distance),
          duration: Number(r.duration),
          effort: Number(r.effort),
          notes: `Logged during onboarding${r.hr ? `, avg HR ${r.hr}` : ''}`,
          source: 'manual',
        })
      }

      // AI plan from the full intake (falls back to a static template), and
      // stamps last_plan_created_at for the once-a-month rebuild limit.
      await createInitialPlan(savedProfile, intake, finalAnswers)
      clearOnboardingProgress()
      await refreshProfile()
      navigate('/')
    } catch (err) {
      if (err instanceof PlanBlockedError) {
        setPreview({ status: 'blocked', block: err.block })
        setStep('blocked')
      } else if (err instanceof ClarificationNeededError) {
        // The saved profile turned up something the preview did not (coach
        // memory, logged runs): ask rather than guess.
        setPreview({ status: 'needs_answers', questions: err.questions })
        setStep('clarify')
      } else {
        setError(err.message)
      }
      setBuilding(false)
    }
  }

  if (building) return <FullScreenSpinner message={t.onboarding.building} />
  if (preparing) return <FullScreenSpinner message={t.onboarding.saving} />
  if (skipping) return <FullScreenSpinner message={t.onboarding.saving} />

  const updateRun = (i, patch) =>
    setRuns((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      {/* progress dots */}
      <div className="mb-10 flex gap-2">
        {stepOrder.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= stepIdx ? 'bg-primary' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>

      {step === 'path' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.welcome}</h1>
          <p className="mt-2 text-zinc-400">{t.onboarding.pathQuestion}</p>
          <div className="mt-8 space-y-3">
            <button
              onClick={() => {
                setPath('thorough')
                setStep('name')
              }}
              className={`card w-full text-left transition hover:border-primary/60 active:scale-[0.98] ${
                path === 'thorough' ? 'border-primary ring-1 ring-primary/40' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <h3 className="font-bold">{t.onboarding.thoroughTitle}</h3>
                <span className="rounded-full bg-primary-faint px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                  {t.onboarding.thoroughBadge}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {t.onboarding.thoroughDesc}
              </p>
            </button>
            <button
              onClick={() => {
                setPath('quick')
                setStep('name')
              }}
              className={`card w-full text-left transition hover:border-primary/60 active:scale-[0.98] ${
                path === 'quick' ? 'border-primary ring-1 ring-primary/40' : ''
              }`}
            >
              <h3 className="font-bold">{t.onboarding.quickTitle}</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {t.onboarding.quickDesc}
              </p>
            </button>
          </div>
        </div>
      )}

      {step === 'name' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.nameTitle}</h1>
          <p className="mt-2 text-zinc-400">{t.onboarding.nameQuestion}</p>
          <input
            className="input mt-8"
            placeholder={t.onboarding.namePlaceholder}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && go(1)}
          />
          <button className="btn-primary mt-6 w-full" disabled={!name.trim()} onClick={() => go(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 'body' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.bodyTitle(name.split(' ')[0])}</h1>
          <p className="mt-2 text-zinc-400">{t.onboarding.bodySubtitle}</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t.onboarding.age}</label>
              <input
                type="number"
                min="10"
                max="100"
                className="input"
                placeholder="35"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.onboarding.weight}</label>
              <input
                type="number"
                min="30"
                max="250"
                step="0.5"
                className="input"
                placeholder="72"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-primary mt-6 w-full" disabled={!age || !weight} onClick={() => go(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 'level' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.levelTitle}</h1>
          <p className="mt-2 text-zinc-400">{t.onboarding.levelSubtitle}</p>
          <div className="mt-8 space-y-3">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setLevel(l.id)
                  go(1)
                }}
                className={`card w-full text-left transition hover:border-primary/60 active:scale-[0.98] ${
                  level === l.id ? 'border-primary ring-1 ring-primary/40' : ''
                }`}
              >
                <h3 className="font-bold">{l.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{l.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.goalTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.goalSubtitle}
          </p>

          {/* distance: chips are shortcuts for the number, not categories */}
          <div className="mt-8">
            <label className="label">{t.onboarding.targetDistance}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {DISTANCE_CHIPS.map((c) => (
                <button
                  key={c.km}
                  type="button"
                  onClick={() => setTargetDistance(String(c.km))}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    Number(targetDistance) === c.km
                      ? 'bg-primary text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="1"
                max="200"
                className="input flex-1"
                placeholder={t.onboarding.distancePlaceholder}
                value={targetDistance}
                onChange={(e) => setTargetDistance(e.target.value)}
              />
              <span className="text-sm text-zinc-500">km</span>
            </div>
          </div>

          {/* date, or no date */}
          <div className="mt-6">
            <label className="label">{t.onboarding.when}</label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setHasDate(true)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  hasDate ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {t.onboarding.onADate}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHasDate(false)
                  setEventDate('')
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  !hasDate ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {t.onboarding.noDate}
              </button>
            </div>
            {hasDate && (
              <input
                type="date"
                className="input mt-3"
                min={todayISO()}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            )}
          </div>

          {/* optional target time, with live pace */}
          <div className="mt-6">
            <label className="label">{t.onboarding.targetTime}</label>
            <div className="mt-1 flex items-center gap-2">
              {[
                { key: 'hours', max: 99, placeholder: '0', label: t.onboarding.hours },
                { key: 'minutes', max: 59, placeholder: '00', label: t.onboarding.minutes },
                ...(showSeconds
                  ? [{ key: 'seconds', max: 59, placeholder: '00', label: t.onboarding.seconds }]
                  : []),
              ].map((f) => (
                <div key={f.key} className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max={f.max}
                    step="1"
                    className="input"
                    placeholder={f.placeholder}
                    aria-label={f.label}
                    value={targetTimeParts[f.key]}
                    onChange={setTargetTimePart(f.key)}
                  />
                  <span className="text-sm text-zinc-500">{f.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs">
              {!targetTimeMin ? (
                <span className="text-zinc-500">{t.onboarding.targetTimeHint}</span>
              ) : !paceCheck ? (
                <span className="text-zinc-500">{t.onboarding.pickDistanceFirst}</span>
              ) : (
                <span className="text-primary">{t.onboarding.requiredPace(paceCheck.label)}</span>
              )}
            </p>
            {paceCheck?.warning && (
              <p className="mt-1 text-xs text-amber-400">
                {paceCheck.warning === 'too_fast'
                  ? t.onboarding.paceTooFast(paceCheck.label)
                  : t.onboarding.paceTooSlow(paceCheck.label)}
              </p>
            )}
          </div>

          <button
            className="btn-primary mt-8 w-full"
            disabled={!targetDistanceValid || (hasDate && !eventDate)}
            onClick={() => go(1)}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'experience' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.experienceTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.experienceSubtitle}
          </p>
          <div className="mt-8 space-y-5">
            <div>
              <label className="label">{t.onboarding.howLongRunning}</label>
              <select
                className="input mt-1"
                value={experienceMonths}
                onChange={(e) => setExperienceMonths(e.target.value)}
              >
                <option value="">{t.onboarding.select}</option>
                {EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.months} value={o.months}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t.onboarding.weeklyVolume}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="250"
                    step="1"
                    className="input"
                    placeholder="30"
                    value={weeklyVolume}
                    onChange={(e) => setWeeklyVolume(e.target.value)}
                  />
                  <span className="text-sm text-zinc-500">km</span>
                </div>
              </div>
              <div>
                <label className="label">{t.onboarding.longestRun}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    step="0.5"
                    className="input"
                    placeholder="12"
                    value={longestRun}
                    onChange={(e) => setLongestRun(e.target.value)}
                  />
                  <span className="text-sm text-zinc-500">km</span>
                </div>
              </div>
            </div>
          </div>
          <button className="btn-primary mt-8 w-full" onClick={() => go(1)}>
            Continue
          </button>
          <p className="mt-3 text-center text-xs text-zinc-600">
            {t.onboarding.experienceHint}
          </p>
        </div>
      )}

      {step === 'safety' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.safetyTitle}</h1>
          <p className="mt-3 rounded-2xl bg-zinc-900 px-4 py-3 text-xs leading-relaxed text-zinc-400">
            {t.onboarding.safetyConsent}
          </p>
          <div className="mt-8 space-y-7">
            <Choice
              question={t.onboarding.pregnancyQuestion}
              options={t.onboarding.pregnancyOptions}
              value={pregnancyStatus}
              onChange={setPregnancyStatus}
            />
            {pregnancyStatus === 'postpartum' && (
              <div>
                <label className="label">{t.onboarding.weeksPostpartum}</label>
                <input
                  type="number"
                  min="0"
                  max="104"
                  step="1"
                  className="input mt-1"
                  placeholder="12"
                  value={weeksPostpartum}
                  onChange={(e) => setWeeksPostpartum(e.target.value)}
                />
              </div>
            )}
            <Choice question={t.onboarding.painQuestion} options={YES_NO} value={painAtRest} onChange={setPainAtRest} />
            <Choice question={t.onboarding.injuryQuestion} options={YES_NO} value={injury12m} onChange={setInjury12m} />
            <Choice
              question={t.onboarding.breakQuestion}
              options={t.onboarding.breakOptions}
              value={breakBand}
              onChange={setBreakBand}
            />
          </div>
          <button className="btn-primary mt-8 w-full" disabled={!safetyAnswered} onClick={() => go(1)}>
            {t.common.continue}
          </button>
        </div>
      )}

      {step === 'blocked' && preview?.block && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.planning.gate.title}</h1>
          <div className="card mt-6">
            <p className="text-sm leading-relaxed text-zinc-200">{preview.block.message}</p>
          </div>
          <button className="btn-primary mt-6 w-full" onClick={skip}>
            {t.onboarding.blockedToApp}
          </button>
          <button
            onClick={() => setStep('safety')}
            className="mt-4 w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
          >
            {t.onboarding.blockedBack}
          </button>
        </div>
      )}

      {step === 'days' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.daysTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.daysSubtitle}
          </p>

          <div className="mt-8">
            <label className="label">{t.onboarding.daysPerWeek}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDaysPerWeek(String(n))}
                  className={`h-11 w-11 rounded-full text-sm font-bold transition ${
                    Number(daysPerWeek) === n
                      ? 'bg-primary text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="label">{t.onboarding.whichDays}</label>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = availableDays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setAvailableDays((days) =>
                        days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
                      )
                    }
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      on ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {t.onboarding.weekdays[WEEKDAYS.indexOf(d)]}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-600">
              {availableDays.length === 0
                ? t.onboarding.noDaysPicked
                : availableDays.length < Number(daysPerWeek || 0)
                  ? t.onboarding.daysConflict(availableDays.length, daysPerWeek)
                  : t.onboarding.daysAvailable(availableDays.length)}
            </p>
          </div>

          <button className="btn-primary mt-8 w-full" onClick={() => go(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 'runbefore' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.runBeforeTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.runBeforeSubtitle}
          </p>
          <div className="mt-8 space-y-3">
            <button
              onClick={() => {
                setHasRun(true)
                setStep('runs')
              }}
              className={`card w-full text-left transition hover:border-primary/60 active:scale-[0.98] ${
                hasRun === true ? 'border-primary ring-1 ring-primary/40' : ''
              }`}
            >
              <h3 className="font-bold">{t.onboarding.yesRegularly}</h3>
              <p className="mt-1 text-sm text-zinc-400">{t.onboarding.yesDesc}</p>
            </button>
            <button
              onClick={() => {
                setHasRun(false)
                setStep('gorun')
              }}
              className={`card w-full text-left transition hover:border-primary/60 active:scale-[0.98] ${
                hasRun === false ? 'border-primary ring-1 ring-primary/40' : ''
              }`}
            >
              <h3 className="font-bold">{t.onboarding.noBrandNew}</h3>
              <p className="mt-1 text-sm text-zinc-400">{t.onboarding.noDesc}</p>
            </button>
          </div>
        </div>
      )}

      {step === 'runs' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.runsTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.runsSubtitle}
          </p>
          <div className="mt-6 space-y-4">
            {runs.map((r, i) => (
              <div key={i} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t.onboarding.runLabel(i + 1)}</p>
                  {i >= 3 && (
                    <button
                      type="button"
                      onClick={() => setRuns((rs) => rs.filter((_, idx) => idx !== i))}
                      className="text-xs text-zinc-500 hover:text-rose-400"
                    >
                      {t.onboarding.remove}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">{t.onboarding.distanceKm}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      className="input"
                      placeholder="5.0"
                      value={r.distance}
                      onChange={(e) => updateRun(i, { distance: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">{t.onboarding.timeMin}</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      placeholder="30"
                      value={r.duration}
                      onChange={(e) => updateRun(i, { duration: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">{t.onboarding.date}</label>
                    <input
                      type="date"
                      max={todayISO()}
                      className="input"
                      value={r.date}
                      onChange={(e) => updateRun(i, { date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t.onboarding.effort}</label>
                    <select
                      className="input"
                      value={r.effort}
                      onChange={(e) => updateRun(i, { effort: Number(e.target.value) })}
                    >
                      {EFFORTS.map((ef) => (
                        <option key={ef.v} value={ef.v}>
                          {ef.v} — {ef.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t.onboarding.avgHr}</label>
                    <input
                      type="number"
                      min="60"
                      max="230"
                      className="input"
                      placeholder="150"
                      value={r.hr}
                      onChange={(e) => updateRun(i, { hr: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRuns((rs) => [...rs, emptyRun(0)])}
            className="btn-ghost mt-4 w-full text-sm"
          >
            {t.onboarding.addRun}
          </button>
          <button
            className="btn-primary mt-4 w-full"
            disabled={runs.slice(0, 3).some((r) => !runValid(r))}
            onClick={() => go(1)}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'gorun' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.testRunTitle}</h1>
          <div className="card mt-6 border-primary/40">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{t.onboarding.coachSays}</p>
            <p className="mt-2 leading-relaxed text-zinc-200">
              {t.onboarding.testRunBody}
            </p>
          </div>
          <div className="card mt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t.onboarding.logTestRun}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">{t.onboarding.distanceKm}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="input"
                  value={testRun.distance}
                  onChange={(e) => setTestRun((t) => ({ ...t, distance: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t.onboarding.timeMin}</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  placeholder="25"
                  value={testRun.duration}
                  onChange={(e) => setTestRun((t) => ({ ...t, duration: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">{t.onboarding.avgHr}</label>
                <input
                  type="number"
                  min="60"
                  max="230"
                  className="input"
                  placeholder="150"
                  value={testRun.hr}
                  onChange={(e) => setTestRun((t) => ({ ...t, hr: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label">{t.onboarding.howHard}</label>
              <select
                className="input"
                value={testRun.effort}
                onChange={(e) => setTestRun((t) => ({ ...t, effort: Number(e.target.value) }))}
              >
                {EFFORTS.map((ef) => (
                  <option key={ef.v} value={ef.v}>
                    {ef.v} — {ef.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary mt-6 w-full" disabled={!runValid(testRun)} onClick={() => go(1)}>
            Continue
          </button>
          <button onClick={() => go(1)} className="mt-3 w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
            {t.onboarding.skipTestRun}
          </button>
        </div>
      )}

      {step === 'notes' && (
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.notesTitle}</h1>
          <p className="mt-2 text-zinc-400">
            {t.onboarding.notesSubtitle}
          </p>
          <textarea
            rows={5}
            className="input mt-8 resize-none"
            placeholder={t.onboarding.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {/* Notes is the last data step on both paths: from here the planning
              pipeline decides whether it needs to ask anything. */}
          <button className="btn-primary mt-6 w-full" onClick={() => prepare()}>
            {t.onboarding.buildMyPlan}
          </button>
        </div>
      )}

      {step === 'clarify' && preview && (
        <ClarifyStep
          preview={preview}
          answers={answers}
          onAnswer={answer}
          onChooseGoal={(id) => {
            const next = { ...answers, safe_goal: id }
            setAnswers(next)
            finish(next)
          }}
          onChangeGoal={() => setStep('goal')}
        />
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      {/* Bottom bar: back where it applies, and "skip for now" on every step. */}
      <div className="mt-auto flex items-center justify-between gap-4 pt-8">
        {stepIdx > 0 ? (
          <button onClick={() => go(-1)} className="text-sm text-zinc-500 hover:text-zinc-300">
            {t.common.back}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={skip}
          className="text-xs text-zinc-600 underline underline-offset-4 transition hover:text-zinc-400"
        >
          {rebuilding ? t.onboarding.notNow : t.onboarding.skipForNow}
        </button>
      </div>
    </div>
  )
}

const YES_NO = [
  { value: true, label: t.onboarding.yes },
  { value: false, label: t.onboarding.no },
]

/** One question answered with a tap. */
function Choice({ question, options, value, onChange }) {
  return (
    <div>
      <p className="font-semibold">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              value === o.value ? 'bg-primary text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The planning pipeline's follow-up: up to three questions answered with a
 * tap, or — for an unsafe goal — the coach's verdict and a choice of the
 * safer goals to build instead.
 */
function ClarifyStep({ preview, answers, onAnswer, onChooseGoal, onChangeGoal }) {
  if (preview.status === 'needs_answers') {
    return (
      <div className="animate-fade-up">
        <h1 className="text-3xl font-extrabold">{t.onboarding.clarifyTitle}</h1>
        <p className="mt-2 text-zinc-400">{t.onboarding.clarifySubtitle}</p>
        <div className="mt-8 space-y-8">
          {preview.questions.map((q) => (
            <div key={q.id}>
              <p className="font-semibold">{q.text}</p>
              <p className="mt-1 text-xs text-zinc-500">{q.why}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => onAnswer(q.id, o.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      answers[q.id] === o.value
                        ? 'bg-primary text-white'
                        : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
                {q.id === 'event_date' && (
                  <button
                    onClick={onChangeGoal}
                    className="rounded-full px-4 py-2 text-sm font-medium text-zinc-400 underline underline-offset-4 hover:text-zinc-200"
                  >
                    {t.onboarding.changeGoal}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Unsafe goal: explain, then let them choose what gets built.
  const alternatives = (preview.proposal?.alternatives || []).filter((a) => a.kind !== 'more_days')
  const moreDays = (preview.proposal?.alternatives || []).find((a) => a.kind === 'more_days')
  const P = t.planning
  const label = (a) =>
    a.kind === 'no_event' ? P.alternative.no_event : P.goal(a.distance_km, a.event_date, a.walk_breaks)
  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-extrabold">{t.onboarding.verdictTitle}</h1>
      <div className="card mt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
          {P.verdicts.unsafe}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{preview.explain?.intro}</p>
      </div>
      <p className="mt-6 text-sm font-semibold">{t.onboarding.chooseGoal}</p>
      <div className="mt-3 space-y-2">
        {alternatives.map((a) => (
          <button
            key={a.id}
            onClick={() => onChooseGoal(a.id)}
            className="w-full rounded-2xl bg-zinc-900 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
          >
            {label(a)}
          </button>
        ))}
      </div>
      {moreDays && (
        <p className="mt-4 text-xs text-zinc-500">
          {P.alternative.more_days(P.goal(moreDays.distance_km, moreDays.event_date, false), moreDays.run_days)}
        </p>
      )}
      <button
        onClick={onChangeGoal}
        className="mt-4 w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
      >
        {t.onboarding.changeGoal}
      </button>
    </div>
  )
}
