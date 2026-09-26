import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { saveProfile, addWorkout, getWorkouts, addDaysISO, todayISO } from '../../src/core/db'
import { GOALS, BLOCK_WEEKS, goalsOffered } from '../../src/core/planning/goals'
import { recentVolume } from '../../src/core/goal-progress'
import { createInitialPlan, previewPlan, ClarificationNeededError, PlanBlockedError } from '../../src/core/plan'
import {
  parseDuration, targetTimeFromParts, targetTimeToParts, targetTimeHasSeconds, targetPaceCheck,
} from '../../src/core/periodization'
import { t } from '../../src/core/strings'
import DateField from '../components/DateField'
import { Chip, Choice } from '../components/Chips'
import { Button, Card, ErrorText, FullScreenSpinner, Input, Label, Screen, Text } from '../components/ui'
import { loadDraft, saveDraft, clearDraft } from '../lib/onboarding-draft'
import { readSeed, dot } from '../lib/onboarding-seed'

const LEVELS = t.onboarding.levels
const EXPERIENCE_OPTIONS = t.onboarding.experienceOptions
const EFFORTS = t.log.efforts
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Shortcuts for common distances: each chip just fills in the number. */
const DISTANCE_CHIPS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.1, label: 'Polmaraton · 21,1' },
  { km: 42.2, label: 'Maraton · 42,2' },
]

const YES_NO = [
  { value: true, label: t.onboarding.yes },
  { value: false, label: t.onboarding.no },
]

const emptyRun = (daysAgo = 0) => ({ date: addDaysISO(todayISO(), -daysAgo), distance: '', duration: '', effort: 3, hr: '' })
const runValid = (r) => Number(r.distance) > 0 && Number(r.duration) > 0

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

/** Both the string draft values and numeric profile values are shown as text in inputs. */
const str = (v) => (v === null || v === undefined ? '' : String(v))

function Title({ children }) {
  return <Text className="text-[28px] font-bold leading-9">{children}</Text>
}
function Subtitle({ children }) {
  return <Text className="mt-2 leading-6 text-zinc-400">{children}</Text>
}

/** A tappable card; selected ones get the orange outline. */
function OptionCard({ title, desc, badge, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: !!selected }}
      className={`rounded-card border p-5 active:opacity-80 ${
        selected ? 'border-2 border-primary/70 bg-primary-faint' : 'border-surface-line bg-surface'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="font-semibold">{title}</Text>
        {!!badge && (
          <View className="rounded-md bg-primary-faint px-1.5 py-0.5">
            <Text className="text-[11px] font-semibold text-primary-light">{badge}</Text>
          </View>
        )}
      </View>
      {!!desc && <Text className="mt-1 text-sm leading-5 text-zinc-400">{desc}</Text>}
    </Pressable>
  )
}

/** A number field with its unit label next to it. */
function UnitField({ unit, ...props }) {
  return (
    <View className="flex-row items-center gap-2">
      <Input className="flex-1" {...props} />
      <Text className="text-sm text-zinc-500">{unit}</Text>
    </View>
  )
}

/**
 * The planning pipeline's follow-up: up to three questions answered with a
 * tap, or, for an unsafe goal, the coach's verdict and the safer goals to
 * build instead.
 */
function ClarifyStep({ preview, answers, onAnswer, onChooseGoal, onChangeGoal }) {
  if (preview.status === 'needs_answers') {
    return (
      <View>
        <Title>{t.onboarding.clarifyTitle}</Title>
        <Subtitle>{t.onboarding.clarifySubtitle}</Subtitle>
        <View className="mt-8 gap-8">
          {preview.questions.map((q) => (
            <View key={q.id}>
              <Text className="font-semibold">{q.text}</Text>
              <Text className="mt-1 text-xs text-zinc-500">{q.why}</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {q.options.map((o) => (
                  <Chip key={o.value} label={o.label} selected={answers[q.id] === o.value} onPress={() => onAnswer(q.id, o.value)} />
                ))}
                {q.id === 'event_date' && (
                  <Pressable onPress={onChangeGoal} className="min-h-[44px] justify-center px-4">
                    <Text className="text-sm font-medium text-zinc-400 underline">{t.onboarding.changeGoal}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    )
  }

  const alternatives = (preview.proposal?.alternatives || []).filter((a) => a.kind !== 'more_days')
  const moreDays = (preview.proposal?.alternatives || []).find((a) => a.kind === 'more_days')
  const P = t.planning
  const label = (a) => (a.kind === 'no_event' ? P.alternative.no_event : P.goal(a.distance_km, a.event_date, a.walk_breaks))
  return (
    <View>
      <Title>{t.onboarding.verdictTitle}</Title>
      <Card className="mt-6">
        <Text className="text-xs font-semibold text-rose-300">{P.verdicts.unsafe}</Text>
        <Text className="mt-2 text-sm leading-5 text-zinc-200">{preview.explain?.intro}</Text>
      </Card>
      <Text className="mt-6 text-sm font-semibold">{t.onboarding.chooseGoal}</Text>
      <View className="mt-3 gap-2">
        {alternatives.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => onChooseGoal(a.id)}
            className="min-h-[52px] justify-center rounded-2xl border border-surface-line bg-surface px-4 py-3 active:opacity-70"
          >
            <Text className="text-sm font-medium text-zinc-100">{label(a)}</Text>
          </Pressable>
        ))}
      </View>
      {moreDays && (
        <Text className="mt-4 text-xs text-zinc-500">
          {P.alternative.more_days(P.goal(moreDays.distance_km, moreDays.event_date, false), moreDays.run_days)}
        </Text>
      )}
      <Pressable onPress={onChangeGoal} className="mt-4 items-center py-2">
        <Text className="text-xs text-zinc-500 underline">{t.onboarding.changeGoal}</Text>
      </Pressable>
    </View>
  )
}

/**
 * Onboarding, same flow as the web: Tekma or Samo tečem (aim), quick or
 * thorough path, name, body, level, race goal or (no race) goals + block
 * length, experience, the four safety questions under the consent line, days,
 * running history, notes, then the planning pipeline: gate, clarify questions
 * or the verdict on an unsafe goal, and one plan build. Every step can be
 * skipped; the draft is kept until a plan exists.
 */
function OnboardingFlow({ saved, params }) {
  const { profile, refreshProfile } = useAuth()
  const router = useRouter()
  const prof = useRef(profile).current || {}
  const rebuilding = Boolean(prof.id)
  const seed = useRef(readSeed(params)).current

  const [step, setStep] = useState(seed ? { repeat: 'experience', switch: 'goals', race: 'goal' }[seed.next] : saved.step || 'aim')
  const [building, setBuilding] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState('')

  const [path, setPath] = useState(seed ? 'quick' : saved.path || '')
  const [aim, setAim] = useState(seed ? (seed.next === 'race' ? 'race' : 'goal') : saved.aim || (saved.step && saved.step !== 'aim' ? 'race' : ''))
  const [goalMain, setGoalMain] = useState(seed ? seed.main : saved.goalMain || '')
  const [goalSecondary, setGoalSecondary] = useState(seed ? seed.secondary : saved.goalSecondary || '')
  const [blockWeeks, setBlockWeeks] = useState(seed?.weeks || saved.blockWeeks || 8)
  const [blockLevel] = useState(seed?.next === 'repeat' ? seed.level : saved.blockLevel || 1)
  const [name, setName] = useState(str(prefill(saved.name, prof.name)))
  const [age, setAge] = useState(str(prefill(saved.age, prof.age)))
  const [weight, setWeight] = useState(str(prefill(saved.weight, prof.weight)))
  const [level, setLevel] = useState(prefill(saved.level, prof.fitness_level))
  const [eventDate, setEventDate] = useState(str(prefill(saved.eventDate, prof.event_date)))
  const [targetDistance, setTargetDistance] = useState(str(prefill(saved.targetDistance, prof.target_distance_km)))
  const [hasDate, setHasDate] = useState(saved.hasDate ?? Boolean(prof.event_date))
  const [targetTimeParts, setTargetTimeParts] = useState(() => initialTargetTime(saved, prof))
  const setTargetTimePart = (key) => (text) => setTargetTimeParts((p) => ({ ...p, [key]: text }))
  const [experienceMonths, setExperienceMonths] = useState(str(prefill(saved.experienceMonths, prof.experience_months)))
  const [weeklyVolume, setWeeklyVolume] = useState(str(prefill(saved.weeklyVolume, prof.weekly_volume_km)))
  const [longestRun, setLongestRun] = useState(str(prefill(saved.longestRun, prof.longest_run_km)))
  const [daysPerWeek, setDaysPerWeek] = useState(str(prefill(saved.daysPerWeek, prof.days_per_week, '4')))
  const [availableDays, setAvailableDays] = useState(saved.availableDays ?? (Array.isArray(prof.available_days) ? prof.available_days : []))
  const [hasRun, setHasRun] = useState(saved.hasRun ?? null)
  const [runs, setRuns] = useState(saved.runs || [emptyRun(2), emptyRun(5), emptyRun(8)])
  const [testRun, setTestRun] = useState(saved.testRun || { ...emptyRun(0), distance: '3' })
  const [notes, setNotes] = useState(str(prefill(saved.notes, prof.coach_notes)))
  const [pregnancyStatus, setPregnancyStatus] = useState(prefill(saved.pregnancyStatus, prof.pregnancy_status))
  const [weeksPostpartum, setWeeksPostpartum] = useState(str(prefill(saved.weeksPostpartum, prof.weeks_postpartum)))
  const [painAtRest, setPainAtRest] = useState(saved.painAtRest ?? prof.pain_at_rest ?? null)
  const [injury12m, setInjury12m] = useState(saved.injury12m ?? prof.injury_last_12m ?? null)
  const [breakBand, setBreakBand] = useState(saved.breakBand ?? (prof.break_days === null || prof.break_days === undefined ? '' : String(prof.break_days)))
  const [answers, setAnswers] = useState(saved.answers || {})
  const [preview, setPreview] = useState(null)
  const [preparing, setPreparing] = useState(false)

  // Persist progress on every change so an app restart never resets the flow.
  useEffect(() => {
    saveDraft({
      step, path, aim, goalMain, goalSecondary, blockWeeks, blockLevel, name, age, weight, level, eventDate,
      targetDistance, hasDate, targetTimeParts, experienceMonths, weeklyVolume, longestRun, daysPerWeek,
      availableDays, hasRun, runs, testRun, notes, answers,
      pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand,
    })
  }, [step, path, aim, goalMain, goalSecondary, blockWeeks, blockLevel, name, age, weight, level, eventDate, targetDistance, hasDate,
      targetTimeParts, experienceMonths, weeklyVolume, longestRun, daysPerWeek, availableDays, hasRun, runs, testRun, notes, answers,
      pregnancyStatus, weeksPostpartum, painAtRest, injury12m, breakBand])

  // A repeat starts from what they actually ran in the last block.
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

  const targetDistanceValid = Number(targetDistance) > 0 && Number(targetDistance) <= 200
  const showSeconds = targetTimeHasSeconds(targetDistance)
  const targetTimeMin = targetTimeFromParts({ ...targetTimeParts, seconds: showSeconds ? targetTimeParts.seconds : '' })
  const goalKind = hasDate && eventDate ? 'event' : 'general'
  const paceCheck = targetDistanceValid ? targetPaceCheck(targetTimeMin, Number(targetDistance)) : null

  const stepIdx = Math.max(0, stepOrder.indexOf(step))
  const go = (dir) => setStep(stepOrder[Math.min(stepOrder.length - 1, Math.max(0, stepIdx + dir))])

  const offeredGoals = goalsOffered(age ? Number(age) : null)
  const goalChosen = offeredGoals.includes(goalMain)
  const goalPlan = aim === 'goal' && goalChosen ? { main: goalMain, secondary: goalSecondary || null, blockWeeks, level: blockLevel } : null

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

  const profileFields = () => ({
    name: name.trim() || null,
    age: age ? Number(age) : null,
    weight: weight ? Number(weight) : null,
    fitness_level: level || null,
    goal: aim === 'goal' ? 'general' : goalKind,
    event_name: null,
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

  const safetyAnswered =
    Boolean(pregnancyStatus) && (pregnancyStatus !== 'postpartum' || weeksPostpartum !== '') && painAtRest !== null && injury12m !== null

  /** "Skip for now": save what we have, build no plan, go into the app. The draft is kept. */
  const skip = async () => {
    setSkipping(true)
    setError('')
    try {
      await saveProfile(profileFields())
      await refreshProfile()
      router.replace('/')
    } catch (err) {
      setError(err.message)
      setSkipping(false)
    }
  }

  const finish = async (finalAnswers = answers) => {
    setBuilding(true)
    setError('')
    try {
      const savedProfile = await saveProfile(profileFields())
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
      await createInitialPlan(savedProfile, intake, finalAnswers)
      await clearDraft()
      await refreshProfile()
      router.replace('/')
    } catch (err) {
      if (err instanceof PlanBlockedError) {
        setPreview({ status: 'blocked', block: err.block })
        setStep('blocked')
      } else if (err instanceof ClarificationNeededError) {
        setPreview({ status: 'needs_answers', questions: err.questions })
        setStep('clarify')
      } else {
        setError(err.message)
      }
      setBuilding(false)
    }
  }

  /** Run the planning pipeline locally: ask follow-ups, show the verdict, or build. */
  const prepare = async (nextAnswers = answers) => {
    if (!safetyAnswered) {
      setStep('safety')
      return
    }
    setPreparing(true)
    setError('')
    try {
      const intake = path === 'thorough' || goalPlan ? buildIntake() : null
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

  const answer = (id, value) => {
    const next = { ...answers, [id]: value }
    setAnswers(next)
    const open = (preview?.questions || []).filter((q) => next[q.id] === undefined)
    if (!open.length) prepare(next)
  }

  if (building) return <FullScreenSpinner message={t.onboarding.building} />
  if (preparing || skipping) return <FullScreenSpinner message={t.onboarding.saving} />

  const updateRun = (i, patch) => setRuns((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const Next = ({ disabled, onPress = () => go(1), title = t.common.continue }) => (
    <Button className="mt-8" disabled={disabled} onPress={onPress} title={title} />
  )

  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Screen.Scroll contentContainerClassName="flex-grow px-5 pb-6 pt-4">
          <View className="mb-8 flex-row gap-1.5">
            {stepOrder.map((_, i) => (
              <View key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-primary' : 'bg-surface-raised'}`} />
            ))}
          </View>

          <View>
            {step === 'aim' && (
              <View>
                <Title>{t.goals.aimTitle}</Title>
                <Subtitle>{t.goals.aimSubtitle}</Subtitle>
                <View className="mt-8 gap-3">
                  {[
                    { id: 'race', title: t.goals.aimRace, desc: t.goals.aimRaceDesc },
                    { id: 'goal', title: t.goals.aimGoal, desc: t.goals.aimGoalDesc },
                  ].map((o) => (
                    <OptionCard
                      key={o.id}
                      title={o.title}
                      desc={o.desc}
                      selected={aim === o.id}
                      onPress={() => {
                        setAim(o.id)
                        setStep('path')
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {step === 'path' && (
              <View>
                <Title>{t.onboarding.welcome}</Title>
                <Subtitle>{t.onboarding.pathQuestion}</Subtitle>
                <View className="mt-8 gap-3">
                  <OptionCard
                    title={t.onboarding.thoroughTitle}
                    badge={t.onboarding.thoroughBadge}
                    desc={t.onboarding.thoroughDesc}
                    selected={path === 'thorough'}
                    onPress={() => {
                      setPath('thorough')
                      setStep('name')
                    }}
                  />
                  <OptionCard
                    title={t.onboarding.quickTitle}
                    desc={t.onboarding.quickDesc}
                    selected={path === 'quick'}
                    onPress={() => {
                      setPath('quick')
                      setStep('name')
                    }}
                  />
                </View>
              </View>
            )}

            {step === 'name' && (
              <View>
                <Title>{t.onboarding.nameTitle}</Title>
                <Subtitle>{t.onboarding.nameQuestion}</Subtitle>
                <Input
                  className="mt-8"
                  placeholder={t.onboarding.namePlaceholder}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => name.trim() && go(1)}
                />
                <Next disabled={!name.trim()} />
              </View>
            )}

            {step === 'body' && (
              <View>
                <Title>{t.onboarding.bodyTitle(name.split(' ')[0])}</Title>
                <Subtitle>{t.onboarding.bodySubtitle}</Subtitle>
                <View className="mt-8 flex-row gap-4">
                  <View className="flex-1">
                    <Label>{t.onboarding.age}</Label>
                    <Input keyboardType="number-pad" placeholder="35" value={age} onChangeText={setAge} />
                  </View>
                  <View className="flex-1">
                    <Label>{t.onboarding.weight}</Label>
                    <Input keyboardType="decimal-pad" placeholder="72" value={weight} onChangeText={(x) => setWeight(dot(x))} />
                  </View>
                </View>
                <Next disabled={!age || !weight} />
              </View>
            )}

            {step === 'level' && (
              <View>
                <Title>{t.onboarding.levelTitle}</Title>
                <Subtitle>{t.onboarding.levelSubtitle}</Subtitle>
                <View className="mt-8 gap-3">
                  {LEVELS.map((l) => (
                    <OptionCard
                      key={l.id}
                      title={l.title}
                      desc={l.desc}
                      selected={level === l.id}
                      onPress={() => {
                        setLevel(l.id)
                        go(1)
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {step === 'goal' && (
              <View>
                <Title>{t.onboarding.goalTitle}</Title>
                <Subtitle>{t.onboarding.goalSubtitle}</Subtitle>

                <View className="mt-8">
                  <Label>{t.onboarding.targetDistance}</Label>
                  <View className="flex-row flex-wrap gap-2">
                    {DISTANCE_CHIPS.map((c) => (
                      <Chip key={c.km} label={c.label} selected={Number(targetDistance) === c.km} onPress={() => setTargetDistance(String(c.km))} />
                    ))}
                  </View>
                  <View className="mt-3">
                    <UnitField unit="km" keyboardType="decimal-pad" placeholder={t.onboarding.distancePlaceholder} value={targetDistance} onChangeText={(x) => setTargetDistance(dot(x))} />
                  </View>
                </View>

                <View className="mt-6">
                  <Label>{t.onboarding.when}</Label>
                  <View className="flex-row gap-2">
                    <Chip
                      className="flex-1"
                      label={t.onboarding.onADate}
                      selected={hasDate}
                      onPress={() => {
                        setHasDate(true)
                        if (!eventDate) setEventDate(addDaysISO(todayISO(), 84))
                      }}
                    />
                    <Chip
                      className="flex-1"
                      label={t.onboarding.noDate}
                      selected={!hasDate}
                      onPress={() => {
                        setHasDate(false)
                        setEventDate('')
                      }}
                    />
                  </View>
                  {hasDate && (
                    <View className="mt-3">
                      <DateField value={eventDate || todayISO()} min={todayISO()} onChange={setEventDate} />
                    </View>
                  )}
                </View>

                <View className="mt-6">
                  <Label>{t.onboarding.targetTime}</Label>
                  <View className="flex-row items-center gap-2">
                    {[
                      { key: 'hours', placeholder: '0', label: t.onboarding.hours },
                      { key: 'minutes', placeholder: '00', label: t.onboarding.minutes },
                      ...(showSeconds ? [{ key: 'seconds', placeholder: '00', label: t.onboarding.seconds }] : []),
                    ].map((f) => (
                      <View key={f.key} className="min-w-0 flex-1 flex-row items-center gap-2">
                        <Input
                          className="flex-1"
                          keyboardType="number-pad"
                          placeholder={f.placeholder}
                          accessibilityLabel={f.label}
                          value={str(targetTimeParts[f.key])}
                          onChangeText={setTargetTimePart(f.key)}
                        />
                        <Text className="text-sm text-zinc-500">{f.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text className={`mt-2 text-xs ${!targetTimeMin || !paceCheck ? 'text-zinc-500' : 'text-primary'}`}>
                    {!targetTimeMin ? t.onboarding.targetTimeHint : !paceCheck ? t.onboarding.pickDistanceFirst : t.onboarding.requiredPace(paceCheck.label)}
                  </Text>
                  {paceCheck?.warning && (
                    <Text className="mt-1 text-xs text-amber-300">
                      {paceCheck.warning === 'too_fast' ? t.onboarding.paceTooFast(paceCheck.label) : t.onboarding.paceTooSlow(paceCheck.label)}
                    </Text>
                  )}
                </View>
                <Next disabled={!targetDistanceValid || (hasDate && !eventDate)} />
              </View>
            )}

            {step === 'goals' && (
              <View>
                <Title>{t.goals.mainTitle}</Title>
                <Subtitle>{t.goals.mainSubtitle}</Subtitle>
                <View className="mt-8 gap-3">
                  {offeredGoals.map((g) => (
                    <OptionCard
                      key={g}
                      title={t.goals.items[g].label}
                      desc={t.goals.items[g].desc}
                      selected={goalMain === g}
                      onPress={() => {
                        setGoalMain(g)
                        if (goalSecondary === g || (goalSecondary === 'hitrost' && !['kondicija', 'baza'].includes(g))) setGoalSecondary('')
                      }}
                    />
                  ))}
                </View>
                {goalChosen && (
                  <View className="mt-8">
                    <Text className="font-semibold">{t.goals.secondaryTitle}</Text>
                    <Text className="mt-1 text-xs text-zinc-500">{t.goals.secondaryHint}</Text>
                    <View className="mt-3 flex-row flex-wrap gap-2">
                      {['', ...offeredGoals.filter((g) => g !== goalMain && (g !== 'hitrost' || ['kondicija', 'baza'].includes(goalMain)))].map((g) => (
                        <Chip key={g || 'none'} label={g ? t.goals.items[g].label : t.goals.noSecondary} selected={goalSecondary === g} onPress={() => setGoalSecondary(g)} />
                      ))}
                    </View>
                  </View>
                )}
                <Next disabled={!goalChosen} />
              </View>
            )}

            {step === 'block' && (
              <View>
                <Title>{t.goals.blockTitle}</Title>
                <Subtitle>{t.goals.blockSubtitle}</Subtitle>
                <View className="mt-8 gap-3">
                  {BLOCK_WEEKS.map((w) => (
                    <OptionCard
                      key={w}
                      title={t.goals.blockWeeks(w)}
                      desc={t.goals.blockHints[w]}
                      selected={blockWeeks === w}
                      onPress={() => {
                        setBlockWeeks(w)
                        go(1)
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {step === 'experience' && (
              <View>
                <Title>{t.onboarding.experienceTitle}</Title>
                <Subtitle>{t.onboarding.experienceSubtitle}</Subtitle>
                <View className="mt-8 gap-5">
                  <View>
                    <Label>{t.onboarding.howLongRunning}</Label>
                    <View className="flex-row flex-wrap gap-2">
                      {EXPERIENCE_OPTIONS.map((o) => (
                        <Chip key={o.months} label={o.label} selected={String(experienceMonths) === String(o.months)} onPress={() => setExperienceMonths(String(o.months))} />
                      ))}
                    </View>
                  </View>
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Label>{t.onboarding.weeklyVolume}</Label>
                      <UnitField unit="km" keyboardType="number-pad" placeholder="30" value={weeklyVolume} onChangeText={setWeeklyVolume} />
                    </View>
                    <View className="flex-1">
                      <Label>{t.onboarding.longestRun}</Label>
                      <UnitField unit="km" keyboardType="decimal-pad" placeholder="12" value={longestRun} onChangeText={(x) => setLongestRun(dot(x))} />
                    </View>
                  </View>
                </View>
                <Next />
                <Text className="mt-3 text-center text-xs text-zinc-600">{t.onboarding.experienceHint}</Text>
              </View>
            )}

            {step === 'safety' && (
              <View>
                <Title>{t.onboarding.safetyTitle}</Title>
                <Text className="mt-3 rounded-2xl border border-surface-line bg-surface px-4 py-3 text-xs leading-5 text-zinc-400">
                  {t.onboarding.safetyConsent}
                </Text>
                <View className="mt-8 gap-7">
                  <Choice label={t.onboarding.pregnancyQuestion} options={t.onboarding.pregnancyOptions} value={pregnancyStatus} onChange={(v) => setPregnancyStatus(v ?? '')} />
                  {pregnancyStatus === 'postpartum' && (
                    <View>
                      <Label>{t.onboarding.weeksPostpartum}</Label>
                      <Input keyboardType="number-pad" placeholder="12" value={weeksPostpartum} onChangeText={setWeeksPostpartum} />
                    </View>
                  )}
                  <Choice label={t.onboarding.painQuestion} options={YES_NO} value={painAtRest} onChange={setPainAtRest} />
                  <Choice label={t.onboarding.injuryQuestion} options={YES_NO} value={injury12m} onChange={setInjury12m} />
                  <Choice label={t.onboarding.breakQuestion} options={t.onboarding.breakOptions} value={breakBand} onChange={(v) => setBreakBand(v ?? '')} />
                </View>
                <Next disabled={!safetyAnswered} />
              </View>
            )}

            {step === 'blocked' && preview?.block && (
              <View>
                <Title>{t.planning.gate.title}</Title>
                <Card className="mt-6">
                  <Text className="text-sm leading-5 text-zinc-200">{preview.block.message}</Text>
                </Card>
                <Button className="mt-6" title={t.onboarding.blockedToApp} onPress={skip} />
                <Pressable onPress={() => setStep('safety')} className="mt-4 items-center py-2">
                  <Text className="text-xs text-zinc-500 underline">{t.onboarding.blockedBack}</Text>
                </Pressable>
              </View>
            )}

            {step === 'days' && (
              <View>
                <Title>{t.onboarding.daysTitle}</Title>
                <Subtitle>{t.onboarding.daysSubtitle}</Subtitle>
                <View className="mt-8">
                  <Label>{t.onboarding.daysPerWeek}</Label>
                  <View className="flex-row flex-wrap gap-2">
                    {[2, 3, 4, 5, 6, 7].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => setDaysPerWeek(String(n))}
                        className={`h-12 w-12 items-center justify-center rounded-full ${Number(daysPerWeek) === n ? 'bg-primary' : 'border border-white/10 bg-surface-raised'}`}
                      >
                        <Text className={`text-base font-semibold ${Number(daysPerWeek) === n ? 'text-white' : 'text-zinc-300'}`}>{n}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View className="mt-6">
                  <Label>{t.onboarding.whichDays}</Label>
                  <View className="flex-row gap-1.5">
                    {WEEKDAYS.map((d, i) => {
                      const on = availableDays.includes(d)
                      return (
                        <Pressable
                          key={d}
                          onPress={() => setAvailableDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]))}
                          className={`min-h-[44px] flex-1 items-center justify-center rounded-xl ${on ? 'bg-primary' : 'border border-white/10 bg-surface-raised'}`}
                        >
                          <Text className={`text-xs font-semibold ${on ? 'text-white' : 'text-zinc-400'}`}>{t.onboarding.weekdays[i]}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Text className="mt-2 text-xs text-zinc-600">
                    {availableDays.length === 0
                      ? t.onboarding.noDaysPicked
                      : availableDays.length < Number(daysPerWeek || 0)
                        ? t.onboarding.daysConflict(availableDays.length, daysPerWeek)
                        : t.onboarding.daysAvailable(availableDays.length)}
                  </Text>
                </View>
                <Next />
              </View>
            )}

            {step === 'runbefore' && (
              <View>
                <Title>{t.onboarding.runBeforeTitle}</Title>
                <Subtitle>{t.onboarding.runBeforeSubtitle}</Subtitle>
                <View className="mt-8 gap-3">
                  <OptionCard
                    title={t.onboarding.yesRegularly}
                    desc={t.onboarding.yesDesc}
                    selected={hasRun === true}
                    onPress={() => {
                      setHasRun(true)
                      setStep('runs')
                    }}
                  />
                  <OptionCard
                    title={t.onboarding.noBrandNew}
                    desc={t.onboarding.noDesc}
                    selected={hasRun === false}
                    onPress={() => {
                      setHasRun(false)
                      setStep('gorun')
                    }}
                  />
                </View>
              </View>
            )}

            {step === 'runs' && (
              <View>
                <Title>{t.onboarding.runsTitle}</Title>
                <Subtitle>{t.onboarding.runsSubtitle}</Subtitle>
                <View className="mt-6 gap-4">
                  {runs.map((r, i) => (
                    <Card key={i} className="gap-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium text-zinc-400">{t.onboarding.runLabel(i + 1)}</Text>
                        {i >= 3 && (
                          <Pressable onPress={() => setRuns((rs) => rs.filter((_, idx) => idx !== i))} hitSlop={8}>
                            <Text className="text-xs text-zinc-500">{t.onboarding.remove}</Text>
                          </Pressable>
                        )}
                      </View>
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <Label>{t.onboarding.distanceKm}</Label>
                          <Input keyboardType="decimal-pad" placeholder="5,0" value={r.distance} onChangeText={(x) => updateRun(i, { distance: dot(x) })} />
                        </View>
                        <View className="flex-1">
                          <Label>{t.onboarding.timeMin}</Label>
                          <Input keyboardType="decimal-pad" placeholder="30" value={r.duration} onChangeText={(x) => updateRun(i, { duration: dot(x) })} />
                        </View>
                      </View>
                      <View>
                        <Label>{t.onboarding.date}</Label>
                        <DateField value={r.date} max={todayISO()} onChange={(d) => updateRun(i, { date: d })} />
                      </View>
                      <View className="flex-row gap-3">
                        <View className="flex-[2]">
                          <Label>{t.onboarding.effort}</Label>
                          <View className="flex-row flex-wrap gap-1.5">
                            {EFFORTS.map((ef) => (
                              <Chip key={ef.v} label={`${ef.v}`} selected={r.effort === ef.v} onPress={() => updateRun(i, { effort: ef.v })} className="min-w-[44px] px-3" />
                            ))}
                          </View>
                          <Text className="mt-1 text-[11px] text-zinc-500">{EFFORTS.find((ef) => ef.v === r.effort)?.label}</Text>
                        </View>
                        <View className="flex-1">
                          <Label>{t.onboarding.avgHr}</Label>
                          <Input keyboardType="number-pad" placeholder="150" value={r.hr} onChangeText={(x) => updateRun(i, { hr: x })} />
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
                <Button variant="ghost" className="mt-4" title={t.onboarding.addRun} onPress={() => setRuns((rs) => [...rs, emptyRun(0)])} />
                <Button className="mt-4" disabled={runs.slice(0, 3).some((r) => !runValid(r))} title={t.common.continue} onPress={() => go(1)} />
              </View>
            )}

            {step === 'gorun' && (
              <View>
                <Title>{t.onboarding.testRunTitle}</Title>
                <Card className="mt-6 border-primary/40">
                  <Text className="text-xs font-semibold text-primary-light">{t.onboarding.coachSays}</Text>
                  <Text className="mt-2 leading-6 text-zinc-200">{t.onboarding.testRunBody}</Text>
                </Card>
                <Card className="mt-4 gap-3">
                  <Text className="text-sm font-medium text-zinc-400">{t.onboarding.logTestRun}</Text>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Label>{t.onboarding.distanceKm}</Label>
                      <Input keyboardType="decimal-pad" value={testRun.distance} onChangeText={(x) => setTestRun((s) => ({ ...s, distance: dot(x) }))} />
                    </View>
                    <View className="flex-1">
                      <Label>{t.onboarding.timeMin}</Label>
                      <Input keyboardType="decimal-pad" placeholder="25" value={testRun.duration} onChangeText={(x) => setTestRun((s) => ({ ...s, duration: dot(x) }))} />
                    </View>
                    <View className="flex-1">
                      <Label>{t.onboarding.avgHr}</Label>
                      <Input keyboardType="number-pad" placeholder="150" value={testRun.hr} onChangeText={(x) => setTestRun((s) => ({ ...s, hr: x }))} />
                    </View>
                  </View>
                  <View>
                    <Label>{t.onboarding.howHard}</Label>
                    <View className="flex-row flex-wrap gap-1.5">
                      {EFFORTS.map((ef) => (
                        <Chip key={ef.v} label={`${ef.v} — ${ef.label}`} selected={testRun.effort === ef.v} onPress={() => setTestRun((s) => ({ ...s, effort: ef.v }))} />
                      ))}
                    </View>
                  </View>
                </Card>
                <Button className="mt-6" disabled={!runValid(testRun)} title={t.common.continue} onPress={() => go(1)} />
                <Pressable onPress={() => go(1)} className="mt-3 items-center py-2">
                  <Text className="text-xs text-zinc-500">{t.onboarding.skipTestRun}</Text>
                </Pressable>
              </View>
            )}

            {step === 'notes' && (
              <View>
                <Title>{t.onboarding.notesTitle}</Title>
                <Subtitle>{t.onboarding.notesSubtitle}</Subtitle>
                <Input
                  className="mt-8 min-h-[120px]"
                  multiline
                  textAlignVertical="top"
                  placeholder={t.onboarding.notesPlaceholder}
                  value={notes}
                  onChangeText={setNotes}
                />
                <Button className="mt-6" title={t.onboarding.buildMyPlan} onPress={() => prepare()} />
              </View>
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
          </View>

          {!!error && (
            <View className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
              <ErrorText>{error}</ErrorText>
            </View>
          )}

          <View className="mt-auto flex-row items-center justify-between gap-4 pt-8">
            {stepIdx > 0 ? (
              <Pressable onPress={() => go(-1)} hitSlop={8} className="min-h-[44px] justify-center">
                <Text className="text-sm text-zinc-500">{t.common.back}</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={skip} hitSlop={8} className="min-h-[44px] justify-center">
              <Text className="text-xs text-zinc-600 underline">{rebuilding ? t.onboarding.notNow : t.onboarding.skipForNow}</Text>
            </Pressable>
          </View>
        </Screen.Scroll>
      </KeyboardAvoidingView>
    </Screen>
  )
}

/** Route guard (same rules as the web OnboardingGate), then the flow once the draft is read. */
export default function Onboarding() {
  const { session, profile, loading, recovery } = useAuth()
  const params = useLocalSearchParams()
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    loadDraft().then(setDraft)
  }, [])

  if (loading || draft === null) return <FullScreenSpinner />
  if (recovery) return <Redirect href="/reset-password" />
  if (!session) return <Redirect href="/auth" />
  // A finished runner is only let in when they deliberately rebuild.
  if (profile && params.rebuild !== '1') return <Redirect href="/(tabs)" />
  return <OnboardingFlow saved={draft} params={params} />
}
