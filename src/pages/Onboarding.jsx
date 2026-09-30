import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveProfile, addWorkout, getWorkouts, addDaysISO, todayISO } from '../core/db'
import { GOALS, BLOCK_WEEKS, goalsOffered } from '../core/planning/goals'
import { OVERRIDE_GOAL } from '../core/planning/feasibility'
import { recentVolume } from '../core/goal-progress'
import { createInitialPlan, previewPlan, ClarificationNeededError, PlanBlockedError } from '../core/plan'
import {
  parseDuration, targetTimeFromParts, targetTimeToParts, targetTimeHasSeconds, targetPaceCheck,
} from '../core/periodization'
import { FullScreenSpinner } from '../components/Spinner'
import { t } from '../core/strings'
import { friendlyError } from '../core/errors'

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

/**
 * "What next?" after a goal block arrives as ?next=repeat|switch|race (see the
 * dashboard's end-of-block card); a repeat also carries the goal it repeats.
 */
function readSeed(params) {
  const next = params.get('next')
  if (!['repeat', 'switch', 'race'].includes(next)) return null
  const weeks = Number(params.get('weeks'))
  return {
    next,
    main: GOALS.includes(params.get('main')) ? params.get('main') : '',
    secondary: GOALS.includes(params.get('secondary')) ? params.get('secondary') : '',
    weeks: BLOCK_WEEKS.includes(weeks) ? weeks : null,
    level: Math.max(1, Math.min(5, Number(params.get('level')) || 1)),
  }
}

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
  const [searchParams] = useSearchParams()
  const seed = useRef(readSeed(searchParams)).current

  const [step, setStep] = useState(seed ? { repeat: 'experience', switch: 'goals', race: 'goal' }[seed.next] : saved.step || 'aim')
  const [building, setBuilding] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState('')

  // collected data
  const [path, setPath] = useState(seed ? 'quick' : saved.path || '') // 'quick' | 'thorough'
  // What the plan is for: 'race', or 'goal' (no race, something to improve).
  // A draft saved before this question existed was a race plan.
  const [aim, setAim] = useState(
    seed ? (seed.next === 'race' ? 'race' : 'goal') : saved.aim || (saved.step && saved.step !== 'aim' ? 'race' : '')
  )
  const [goalMain, setGoalMain] = useState(seed ? seed.main : saved.goalMain || '')
  const [goalSecondary, setGoalSecondary] = useState(seed ? seed.secondary : saved.goalSecondary || '')
  const [blockWeeks, setBlockWeeks] = useState(seed?.weeks || saved.blockWeeks || 8)
  const [blockLevel, setBlockLevel] = useState(seed?.next === 'repeat' ? seed.level : saved.blockLevel || 1)
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
        step, path, aim, goalMain, goalSecondary, blockWeeks, blockLevel, name, age, weight, level, eventDate,
        targetDistance, hasDate, targetTimeParts, experienceMonths, weeklyVolume,
        longestRun, daysPerWeek, availableDays,
        hasRun, runs, testRun, notes, answers,
        pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand,
      })
    )
  }, [step, path, aim, goalMain, goalSecondary, blockWeeks, blockLevel, name, age, weight, level, eventDate, targetDistance, hasDate,
      targetTimeParts, experienceMonths, weeklyVolume, longestRun, daysPerWeek,
      availableDays, hasRun, runs, testRun, notes, answers,
      pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand])

  // A repeat starts from what they actually ran in the last block, not from
  // the volume they gave when the block began.
  useEffect(() => {
    if (seed?.next !== 'repeat' || !prof.id) return
    getWorkouts(prof.id, { limit: 60 })
      .then((rows) => {
        const { weeklyKm, longestKm } = recentVolume(rows)
        if (weeklyKm !== null) {
          setWeeklyVolume(String(weeklyKm))
          setLongestRun(String(longestKm))
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stepOrder = useMemo(() => {
    const s = ['aim', 'path', 'name', 'body', 'level', ...(aim === 'goal' ? ['goals', 'block'] : ['goal']), 'experience', 'safety', 'days']
    if (path === 'thorough') {
      s.push('runbefore')
      if (hasRun === true) s.push('runs')
      if (hasRun === false) s.push('gorun')
    }
    s.push('notes')
    if (step === 'clarify') s.push('clarify')
    if (step === 'blocked') s.push('blocked')
    return s
  }, [aim, path, hasRun, step])

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

  // The goals this age may pick, and whether the chosen main goal is one of them.
  const offeredGoals = goalsOffered(age ? Number(age) : null)
  const goalChosen = offeredGoals.includes(goalMain)
  const goalPlan = aim === 'goal' && goalChosen
    ? { main: goalMain, secondary: goalSecondary || null, blockWeeks, level: blockLevel }
    : null

  /** Everything collected, in the shape core/ai.js expects. */
  const buildIntake = () => ({
    goalPlan,
    name: name.trim(),
    age: age ? Number(age) : null,
    weight: weight ? Number(weight) : null,
    fitness_level: level,
    goal: aim === 'goal' ? 'general' : goalKind,
    target_distance_km: aim !== 'goal' && targetDistanceValid ? Number(targetDistance) : null,
    target_time_min: aim === 'goal' ? null : targetTimeMin,
    event_date: aim !== 'goal' && hasDate ? eventDate || null : null,
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
    goal: aim === 'goal' ? 'general' : goalKind,
    event_name: null, // no named race type any more — the distance is the goal
    // A goal block has no race: nothing of an earlier race stays on the profile.
    event_date: aim !== 'goal' && hasDate ? eventDate || null : null,
    target_distance_km: aim !== 'goal' && targetDistanceValid ? Number(targetDistance) : null,
    target_time_min: aim === 'goal' ? null : targetTimeMin,
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
      setError(friendlyError(err))
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
      // What to build for an unsafe goal is chosen on the verdict screen, for
      // the goal as it is now. A choice (or a risk confirmation) left over
      // from an earlier goal or a saved draft must never carry over.
      const { safe_goal: _staleChoice, override_confirmed: _staleConfirmation, ...fresh } = nextAnswers
      nextAnswers = fresh
      setAnswers(fresh)
      const intake = path === 'thorough' || goalPlan ? buildIntake() : null
      const result = await previewPlan({ ...prof, ...profileFields() }, intake, nextAnswers)
      setPreview(result)
      if (result.status === 'blocked') {
        setStep('blocked')
        return
      }
      const unsafeUnchosen = result.status === 'ready' && result.verdict === 'unsafe'
      if (result.status === 'needs_answers' || unsafeUnchosen) {
        setStep('clarify')
        return
      }
      await finish(nextAnswers)
    } catch (err) {
      setError(friendlyError(err))
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
      const intake = path === 'thorough' || goalPlan ? buildIntake() : null
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
        setError(friendlyError(err))
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
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      {/* progress dots */}
      <div className="mb-8 flex gap-1.5" aria-hidden>
        {stepOrder.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= stepIdx ? 'bg-primary' : 'bg-surface-raised'
            }`}
          />
        ))}
      </div>

      {step === 'aim' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.goals.aimTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.goals.aimSubtitle}</p>
          <div className="mt-8 space-y-3">
            {[
              { id: 'race', title: t.goals.aimRace, desc: t.goals.aimRaceDesc },
              { id: 'goal', title: t.goals.aimGoal, desc: t.goals.aimGoalDesc },
            ].map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setAim(o.id)
                  setStep('path')
                }}
                className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                  aim === o.id ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
                }`}
              >
                <h3 className="font-semibold">{o.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{o.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'path' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.welcome}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.onboarding.pathQuestion}</p>
          <div className="mt-8 space-y-3">
            <button
              onClick={() => {
                setPath('thorough')
                setStep('name')
              }}
              className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                path === 'thorough' ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{t.onboarding.thoroughTitle}</h3>
                <span className="rounded-md bg-primary-faint px-1.5 py-0.5 text-[11px] font-semibold text-primary-light">
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
              className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                path === 'quick' ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
              }`}
            >
              <h3 className="font-semibold">{t.onboarding.quickTitle}</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {t.onboarding.quickDesc}
              </p>
            </button>
          </div>
        </div>
      )}

      {step === 'name' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.nameTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.onboarding.nameQuestion}</p>
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.bodyTitle(name.split(' ')[0])}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.onboarding.bodySubtitle}</p>
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.levelTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.onboarding.levelSubtitle}</p>
          <div className="mt-8 space-y-3">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setLevel(l.id)
                  go(1)
                }}
                className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                  level === l.id ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
                }`}
              >
                <h3 className="font-semibold">{l.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{l.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.goalTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
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
                  className={`min-h-[44px] rounded-full px-4 py-2 font-mono text-sm font-semibold transition active:scale-95 ${
                    Number(targetDistance) === c.km
                      ? 'bg-primary text-white'
                      : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
                className="input flex-1 font-mono"
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
                className={`min-h-[48px] flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  hasDate ? 'bg-primary text-white' : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
                className={`min-h-[48px] flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  !hasDate ? 'bg-primary text-white' : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
              <p className="mt-1 text-xs text-amber-300">
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

      {step === 'goals' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.goals.mainTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.goals.mainSubtitle}</p>
          <div className="mt-8 space-y-3">
            {offeredGoals.map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGoalMain(g)
                  // The main goal wins: a secondary that is now the same, or that a
                  // time trial does not sit beside, is dropped.
                  if (goalSecondary === g || (goalSecondary === 'hitrost' && !['kondicija', 'baza'].includes(g))) {
                    setGoalSecondary('')
                  }
                }}
                aria-pressed={goalMain === g}
                className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                  goalMain === g ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
                }`}
              >
                <h3 className="font-semibold">{t.goals.items[g].label}</h3>
                <p className="mt-1 text-sm text-zinc-400">{t.goals.items[g].desc}</p>
              </button>
            ))}
          </div>

          {goalChosen && (
            <div className="mt-8">
              <p className="font-semibold">{t.goals.secondaryTitle}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.goals.secondaryHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  '',
                  ...offeredGoals.filter((g) => g !== goalMain && (g !== 'hitrost' || ['kondicija', 'baza'].includes(goalMain))),
                ].map((g) => (
                  <button
                    key={g || 'none'}
                    onClick={() => setGoalSecondary(g)}
                    className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
                      goalSecondary === g
                        ? 'bg-primary text-white'
                        : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
                    }`}
                  >
                    {g ? t.goals.items[g].label : t.goals.noSecondary}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary mt-8 w-full" disabled={!goalChosen} onClick={() => go(1)}>
            {t.common.continue}
          </button>
        </div>
      )}

      {step === 'block' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.goals.blockTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.goals.blockSubtitle}</p>
          <div className="mt-8 space-y-3">
            {BLOCK_WEEKS.map((w) => (
              <button
                key={w}
                onClick={() => {
                  setBlockWeeks(w)
                  go(1)
                }}
                aria-pressed={blockWeeks === w}
                className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                  blockWeeks === w ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
                }`}
              >
                <h3 className="font-semibold">{t.goals.blockWeeks(w)}</h3>
                <p className="mt-1 text-sm text-zinc-400">{t.goals.blockHints[w]}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'experience' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.experienceTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.safetyTitle}</h1>
          <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-zinc-400 ring-1 ring-inset ring-surface-line">
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.planning.gate.title}</h1>
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.daysTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
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
                  className={`h-12 w-12 rounded-full font-mono text-base font-semibold transition active:scale-95 ${
                    Number(daysPerWeek) === n
                      ? 'bg-primary text-white'
                      : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
                    className={`min-h-[44px] rounded-xl text-xs font-semibold transition active:scale-95 ${
                      on ? 'bg-primary text-white' : 'bg-surface-raised text-zinc-400 ring-1 ring-inset ring-white/10 hover:text-zinc-200'
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.runBeforeTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
            {t.onboarding.runBeforeSubtitle}
          </p>
          <div className="mt-8 space-y-3">
            <button
              onClick={() => {
                setHasRun(true)
                setStep('runs')
              }}
              className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                hasRun === true ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
              }`}
            >
              <h3 className="font-semibold">{t.onboarding.yesRegularly}</h3>
              <p className="mt-1 text-sm text-zinc-400">{t.onboarding.yesDesc}</p>
            </button>
            <button
              onClick={() => {
                setHasRun(false)
                setStep('gorun')
              }}
              className={`card w-full text-left transition hover:ring-white/20 active:scale-[0.98] ${
                hasRun === false ? 'bg-primary-faint !ring-2 !ring-primary/70' : ''
              }`}
            >
              <h3 className="font-semibold">{t.onboarding.noBrandNew}</h3>
              <p className="mt-1 text-sm text-zinc-400">{t.onboarding.noDesc}</p>
            </button>
          </div>
        </div>
      )}

      {step === 'runs' && (
        <div className="animate-fade-up">
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.runsTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
            {t.onboarding.runsSubtitle}
          </p>
          <div className="mt-6 space-y-4">
            {runs.map((r, i) => (
              <div key={i} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-400">{t.onboarding.runLabel(i + 1)}</p>
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.testRunTitle}</h1>
          <div className="card mt-6 !ring-primary/40">
            <p className="text-xs font-semibold text-primary-light">{t.onboarding.coachSays}</p>
            <p className="mt-2 leading-relaxed text-zinc-200">
              {t.onboarding.testRunBody}
            </p>
          </div>
          <div className="card mt-4 space-y-3">
            <p className="text-sm font-medium text-zinc-400">{t.onboarding.logTestRun}</p>
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
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.notesTitle}</h1>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
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
            const next = { ...answers, safe_goal: id, override_confirmed: false }
            setAnswers(next)
            finish(next)
          }}
          // "Vseeno naredi plan": the original goal, after the one explicit
          // confirmation (the engine ignores the choice without it).
          onOverride={() => {
            const next = { ...answers, safe_goal: OVERRIDE_GOAL, override_confirmed: true }
            setAnswers(next)
            finish(next)
          }}
          onChangeGoal={() => setStep('goal')}
        />
      )}

      {error && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-inset ring-rose-500/25">{error}</p>}

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
            className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
              value === o.value ? 'bg-primary text-white' : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
function ClarifyStep({ preview, answers, onAnswer, onChooseGoal, onOverride, onChangeGoal }) {
  // The override is two steps: open it, then tick the confirmation.
  const [overriding, setOverriding] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  if (preview.status === 'needs_answers') {
    return (
      <div className="animate-fade-up">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.clarifyTitle}</h1>
        <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.onboarding.clarifySubtitle}</p>
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
                    className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
                      answers[q.id] === o.value
                        ? 'bg-primary text-white'
                        : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10 hover:text-white'
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
  const risks = preview.explain?.risk_texts || []
  const canOverride = Boolean(preview.proposal?.override_allowed)

  // "Vseeno naredi plan": what it means, and the one confirmation.
  if (overriding && canOverride) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.overrideButton}</h1>
        <div className="card mt-6">
          <p className="text-xs font-semibold text-rose-300">{P.verdicts.unsafe}</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{preview.explain?.original_goal_text}</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-300">
            {risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{t.onboarding.overrideBody}</p>
        </div>
        <label className="mt-5 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-inset ring-surface-line">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-rose-400"
          />
          <span className="text-sm leading-relaxed text-zinc-100">{t.onboarding.overrideConfirm}</span>
        </label>
        <button
          onClick={onOverride}
          disabled={!confirmed}
          className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.onboarding.overrideButton}
        </button>
        <button
          onClick={() => {
            setOverriding(false)
            setConfirmed(false)
          }}
          className="mt-4 w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
        >
          {t.onboarding.overrideBack}
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{t.onboarding.verdictTitle}</h1>
      <div className="card mt-6">
        <p className="text-xs font-semibold text-rose-300">
          {P.verdicts.unsafe}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{preview.explain?.intro}</p>
        {risks.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold text-zinc-400">{t.onboarding.verdictWhy}</p>
            <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-zinc-300">
              {risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
              <li>{P.risk.body}</li>
            </ul>
          </>
        )}
      </div>
      <p className="mt-6 text-sm font-semibold">{t.onboarding.chooseGoal}</p>
      <div className="mt-3 space-y-2">
        {alternatives.map((a) => (
          <button
            key={a.id}
            onClick={() => onChooseGoal(a.id)}
            className="flex min-h-[52px] w-full items-center rounded-2xl bg-surface px-4 py-3 text-left text-sm font-medium text-zinc-100 ring-1 ring-inset ring-surface-line transition hover:ring-primary/50 active:scale-[0.99]"
          >
            {label(a)}
          </button>
        ))}
        {/* The third option: the goal as asked, against advice. */}
        {canOverride && (
          <button
            onClick={() => setOverriding(true)}
            className="flex min-h-[52px] w-full items-center rounded-2xl px-4 py-3 text-left text-sm font-medium text-rose-200 ring-1 ring-inset ring-rose-500/30 transition hover:bg-rose-500/10 active:scale-[0.99]"
          >
            {t.onboarding.overrideButton}
          </button>
        )}
      </div>
      {!canOverride && <p className="mt-4 text-xs leading-relaxed text-zinc-500">{t.onboarding.overrideNotAllowed}</p>}
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
