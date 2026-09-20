import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { saveProfile, addWorkout, addDaysISO, todayISO } from '../core/db'
import { createInitialPlan } from '../core/plan'
import { parseDuration, formatPace } from '../core/periodization'
import { coachIntakeFollowUp, friendlyAiMessage, INTAKE_READY_TOKEN } from '../core/ai'
import Spinner, { FullScreenSpinner } from '../components/Spinner'
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
/** Minutes → "1:45:00" for prefilling the target-time input. */
function formatDurationInput(minutes) {
  const total = Math.round(Number(minutes) * 60)
  if (!Number.isFinite(total) || total <= 0) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function prefill(draftValue, profileValue, fallback = '') {
  if (draftValue !== undefined && draftValue !== null && draftValue !== '') return draftValue
  if (profileValue !== undefined && profileValue !== null) return profileValue
  return fallback
}

/**
 * Onboarding v3 — two paths after signup:
 *  QUICK:    personal data only, plan built straight away.
 *  THOROUGH: personal data → running history (3 recent runs, or a 3 km test
 *            run for brand-new runners) → free-text notes → the coach asks
 *            follow-up questions → plan confirmed and built.
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
  const [targetTime, setTargetTime] = useState(
    prefill(saved.targetTime, prof.target_time_min ? formatDurationInput(prof.target_time_min) : '')
  )
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

  // coach follow-up chat
  const [chatMsgs, setChatMsgs] = useState(saved.chatMsgs || []) // {role, content}
  const [chatInput, setChatInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [ready, setReady] = useState(saved.ready || false)
  // Don't re-open the follow-up if a restored conversation already exists.
  const chatStarted = useRef((saved.chatMsgs || []).length > 0)
  const bottomRef = useRef(null)

  // Persist progress on every change so switching tabs, reloads or an auth
  // re-login never resets the flow. Cleared in finish() on success.
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step, path, name, age, weight, level, eventDate,
        targetDistance, hasDate, targetTime, experienceMonths, weeklyVolume,
        longestRun, daysPerWeek, availableDays,
        hasRun, runs, testRun, notes, chatMsgs, ready,
      })
    )
  }, [step, path, name, age, weight, level, eventDate, targetDistance, hasDate,
      targetTime, experienceMonths, weeklyVolume, longestRun, daysPerWeek,
      availableDays, hasRun, runs, testRun, notes, chatMsgs, ready])

  const stepOrder = useMemo(() => {
    const s = ['path', 'name', 'body', 'level', 'goal', 'experience', 'days']
    if (path === 'thorough') {
      s.push('runbefore')
      if (hasRun === true) s.push('runs')
      if (hasRun === false) s.push('gorun')
    }
    s.push('notes')
    if (path === 'thorough') s.push('chat')
    return s
  }, [path, hasRun])

  // --- derived goal values -------------------------------------------------
  const targetDistanceValid = Number(targetDistance) > 0 && Number(targetDistance) <= 200
  const targetTimeMin = targetTime.trim() ? parseDuration(targetTime) : null
  /** A date on the calendar makes it an 'event' plan; otherwise 'general'. */
  const goalKind = hasDate && eventDate ? 'event' : 'general'
  /** Live pace feedback as the runner types a target time. */
  const requiredPace =
    targetTimeMin && targetDistanceValid
      ? formatPace(targetTimeMin / Number(targetDistance))
      : null

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
    followUp: chatMsgs.map((m) => ({
      role: m.role,
      content: m.content.replace(INTAKE_READY_TOKEN, '').trim(),
    })),
  })

  // AI INTEGRATION POINT — the coach opens the follow-up conversation as soon
  // as the chat step is reached.
  useEffect(() => {
    if (step !== 'chat' || chatStarted.current) return
    chatStarted.current = true
    setThinking(true)
    coachIntakeFollowUp(buildIntake(), [])
      .then((reply) => receiveCoach(reply))
      .catch((err) => {
        setChatMsgs([{ role: 'assistant', content: friendlyAiMessage(err) }])
        setReady(true) // never dead-end onboarding on an API failure
      })
      .finally(() => setThinking(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs, thinking])

  const receiveCoach = (reply) => {
    if (reply.includes(INTAKE_READY_TOKEN)) setReady(true)
    setChatMsgs((m) => [...m, { role: 'assistant', content: reply.replace(INTAKE_READY_TOKEN, '').trim() }])
  }

  const sendChat = async (e) => {
    e?.preventDefault()
    const content = chatInput.trim()
    if (!content || thinking) return
    setChatInput('')
    const history = [...chatMsgs, { role: 'user', content }]
    setChatMsgs(history)
    setThinking(true)
    try {
      const reply = await coachIntakeFollowUp(buildIntake(), history)
      receiveCoach(reply)
    } catch (err) {
      setChatMsgs((m) => [...m, { role: 'assistant', content: friendlyAiMessage(err) }])
      setReady(true)
    } finally {
      setThinking(false)
    }
  }

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
  })

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

  const finish = async () => {
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
      await createInitialPlan(savedProfile, intake)
      clearOnboardingProgress()
      await refreshProfile()
      navigate('/')
    } catch (err) {
      setError(err.message)
      setBuilding(false)
    }
  }

  if (building) return <FullScreenSpinner message={t.onboarding.building} />
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
            <input
              className="input mt-1"
              placeholder={t.onboarding.targetTimePlaceholder}
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
            />
            {targetTime.trim() !== '' && (
              <p className="mt-2 text-xs">
                {requiredPace ? (
                  <span className="text-primary">
                    {t.onboarding.requiredPace(requiredPace, Number(targetDistance))}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    {targetDistanceValid
                      ? t.onboarding.timeHint
                      : t.onboarding.pickDistanceFirst}
                  </span>
                )}
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
          {/* Notes is the LAST step on the quick path, so it builds the plan
              rather than advancing into a step that does not exist. */}
          <button
            className="btn-primary mt-6 w-full"
            onClick={() => (path === 'thorough' ? go(1) : finish())}
          >
            {path === 'thorough' ? t.common.continue : t.onboarding.buildMyPlan}
          </button>
        </div>
      )}

      {step === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col animate-fade-up">
          <h1 className="text-3xl font-extrabold">{t.onboarding.chatTitle}</h1>
          <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-white'
                      : 'rounded-tl-sm bg-zinc-900 text-zinc-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="flex gap-1.5 rounded-2xl rounded-tl-sm bg-zinc-900 px-4 py-4">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 animate-pulse-dot rounded-full bg-zinc-500"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {ready ? (
            <button className="btn-primary mt-6 w-full" onClick={finish}>
              {t.onboarding.chatLooksGood}
            </button>
          ) : (
            <>
              <form onSubmit={sendChat} className="mt-6 flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={t.onboarding.chatPlaceholder}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                />
                <button type="submit" disabled={!chatInput.trim() || thinking} className="btn-primary !px-4">
                  {thinking ? <Spinner className="h-5 w-5 text-white" /> : '→'}
                </button>
              </form>
              <button
                onClick={finish}
                className="mt-3 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
              >
                {t.onboarding.chatSkip}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      {/* Bottom bar: back where it applies, and "skip for now" on every step. */}
      <div className="mt-auto flex items-center justify-between gap-4 pt-8">
        {stepIdx > 0 && step !== 'chat' ? (
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
