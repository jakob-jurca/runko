/**
 * Persona suite — synthetic runners run through the plan engine, with the
 * properties a good plan must have asserted in code. No AI call.
 *
 *   npm test                      the planning pipeline (part of the suite)
 *   PLAN_ENGINE=legacy node tests/personas.test.mjs
 *                                 the old one-size engine, for comparison
 */
import { PERSONAS } from './personas/personas.mjs'
import {
  SPECIFIC, restDaysRespected, weeklyIncreaseWithinLimit, longRunProgressionSafe, planningStored,
  runDurationWithinCap, agePct, longRunShareWithinCap, walkRunWithinLimits, intensityRulesKept,
} from './personas/properties.mjs'
import { planFor, ENGINE } from './personas/engines.mjs'
import { check, summary } from './harness.mjs'

console.log(`\n=== PERSONAS (${ENGINE} engine) ===`)

const rows = []

for (const persona of PERSONAS) {
  const failed = []
  const results = []
  const record = (name, outcome) => {
    results.push({ name, ...outcome })
    if (!outcome.ok) failed.push(`${name}: ${outcome.detail}`)
  }

  let result
  try {
    // Personas with missing or contradictory input must be ASKED first: the
    // pipeline has to stop and return questions rather than guess and build.
    const want = persona.expect.questions
    if (want) {
      const first = await planFor(persona, { withAnswers: false })
      const ids = (first.questions || []).map((q) => q.id)
      const missing = want.filter((id) => !ids.includes(id))
      record('asks before building', first.status === 'needs_answers' && !missing.length && ids.length <= 3
        ? { ok: true }
        : { ok: false, detail: first.status !== 'needs_answers'
            ? 'built a plan without asking'
            : `asked [${ids.join(', ')}], expected [${want.join(', ')}]` })
    }
    result = await planFor(persona)
  } catch (err) {
    record('engine runs', { ok: false, detail: err.message })
  }

  if (result && persona.expect.blocked) {
    // Runners the safety gate turns away (pregnant, under 15, rest pain…):
    // no plan at all, and a kind explanation of why and whom to see.
    const want = persona.expect.blocked
    record('no plan is built', result.status === 'blocked' && !(result.weeks || []).length
      ? { ok: true }
      : { ok: false, detail: `status ${result.status}, ${(result.weeks || []).length} weeks` })
    record(`blocked for: ${want.reason}`, result.block?.reason === want.reason
      ? { ok: true }
      : { ok: false, detail: `reason ${result.block?.reason ?? 'none'}` })
    const msg = String(result.block?.message || '')
    const refers = (want.mentions || []).filter((w) => !msg.toLowerCase().includes(w.toLowerCase()))
    record('explains and refers', msg.length > 40 && !refers.length
      ? { ok: true }
      : { ok: false, detail: refers.length ? `message does not mention ${refers.join(', ')}` : 'no message' })
  } else if (result && result.status !== 'ready') {
    record('builds once answered', { ok: false, detail: `still ${result.status}: ${(result.questions || []).map((q) => q.id).join(', ')}` })
  } else if (result) {
    record('rest days respected', restDaysRespected(result, persona))
    record(`weekly increase ≤ ${agePct(persona)}% (or the level floor)`, weeklyIncreaseWithinLimit(result, persona))
    record('no run over 1.10 × the 30-day longest', longRunProgressionSafe(result, persona))
    record('run duration within the cap', runDurationWithinCap(result, persona))
    record('long-run share within the cap', longRunShareWithinCap(result, persona))
    record('walk-run: +10 running min a week, sessions ≤ max(110%, +5 min)', walkRunWithinLimits(result))
    record('intensity: quality cap, hard-session gap, easy share, race week', intensityRulesKept(result, persona))
    record('steps 2-4 stored in plan_json', planningStored(result))
    for (const [key, want] of Object.entries(persona.expect)) {
      if (key === 'questions' || key === 'blocked') continue
      const fn = SPECIFIC[key]
      if (!fn) {
        record(key, { ok: false, detail: 'unknown property' })
        continue
      }
      record(key, fn(result, persona, want))
    }
  }

  for (const r of results) check(`${persona.id}: ${r.name}${r.ok ? '' : ` — ${r.detail}`}`, r.ok)
  rows.push({
    persona,
    result,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    failed,
  })
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
const cell = (s, n) => String(s ?? '—').padEnd(n).slice(0, n)
console.log('\n' + [
  cell('persona', 28), cell('scenario', 22), cell('verdict', 9), cell('props', 7), 'result',
].join(' '))
console.log('-'.repeat(80))
for (const r of rows) {
  console.log([
    cell(r.persona.id, 28),
    cell(r.result?.scenario, 22),
    cell(r.result?.verdict, 9),
    cell(`${r.passed}/${r.total}`, 7),
    r.failed.length ? `FAIL (${r.failed.length})` : 'PASS',
  ].join(' '))
}
const passing = rows.filter((r) => !r.failed.length).length
console.log(`\n${passing}/${rows.length} personas pass on the ${ENGINE} engine`)

// ---------------------------------------------------------------------------
// "Vseeno naredi plan" — an unsafe goal built against advice
// ---------------------------------------------------------------------------
if (ENGINE === 'pipeline') {
  console.log('\n=== UNSAFE GOALS, BUILT AGAINST ADVICE ===')
  const OVERRIDE = { safe_goal: 'override', override_confirmed: true }
  const unsafe = PERSONAS.filter((p) => p.expect.verdict === 'unsafe')
  const gated = PERSONAS.filter((p) => p.expect.blocked)
  let sawShortLongRun = false

  check('every unsafe persona says what the override must do', unsafe.length >= 9 && unsafe.every((p) => ['builds', 'refused'].includes(p.override)))

  for (const persona of unsafe) {
    const failed = []
    const record = (name, outcome) => {
      check(`${persona.id} (override): ${name}${outcome.ok ? '' : ` — ${outcome.detail}`}`, outcome.ok)
      if (!outcome.ok) failed.push(name)
    }
    const is = (ok, detail) => ({ ok: Boolean(ok), detail })
    const r = await planFor(persona, { extraAnswers: OVERRIDE })
    const advice = r.stored?.planning?.against_advice

    if (persona.override === 'refused') {
      // A population rule on the distance itself: no confirmation lifts it.
      record('the override is not offered', is(r.proposal?.override_allowed === false && r.explain?.override_allowed === false, `override_allowed ${r.proposal?.override_allowed}`))
      record('and asking for it builds the safe goal, unmarked', is(r.status === 'ready' && !r.againstAdvice && !advice, `againstAdvice ${Boolean(r.againstAdvice)}`))
      record('original goal still not built', SPECIFIC.originalGoalNotBuilt(r, persona))
    } else {
      record('a plan is built', is(r.status === 'ready' && r.weeks.length > 0, `status ${r.status}`))
      record('the verdict stays unsafe', is(r.verdict === 'unsafe' && r.explain?.verdict === 'unsafe', `verdict ${r.verdict}`))
      record('marked as built against advice, confirmed', is(advice?.confirmed === true && r.weeks.every((w) => w.against_advice === true), 'no against_advice record on the stored weeks'))
      record('for the goal as asked', is(r.goal?.distance_km === persona.profile.target_distance_km && r.goal?.event_date === persona.profile.event_date, `built for ${r.goal?.distance_km} km on ${r.goal?.event_date}`))
      record('every week to race day', SPECIFIC.reachesRaceDay(r, persona))
      record('race on the event day', SPECIFIC.raceOnEventDay(r, persona))
      const race = r.weeks.flatMap((w) => w.days).find((d) => d.type === 'race')
      record('race day is run-walk at a conversational pace', is(race?.walk_breaks === true && race?.against_advice === true && race?.intensity === 'easy' && /hoj/.test(race?.pace || ''), `race ${JSON.stringify({ wb: race?.walk_breaks, pace: race?.pace })}`))
      record('no target time is chased', is(r.goal?.target_time_min === null, `target ${r.goal?.target_time_min}`))

      // The hard caps: exactly the checks every other plan passes.
      record('rest days respected', restDaysRespected(r, persona))
      record(`weekly increase ≤ ${agePct(persona)}% (or the level floor)`, weeklyIncreaseWithinLimit(r, persona))
      record('no run over 1.10 × the 30-day longest', longRunProgressionSafe(r, persona))
      record('run duration within the cap', runDurationWithinCap(r, persona))
      record('long-run share within the cap', longRunShareWithinCap(r, persona))
      record('walk-run: +10 running min a week, sessions ≤ max(110%, +5 min)', walkRunWithinLimits(r))
      record('intensity rules', intensityRulesKept(r, persona))
      record('no hard sessions at all', SPECIFIC.noHardSessions(r, persona, true))
      // Population rules the persona already carries.
      for (const key of ['maxRunDays', 'maxWeeklyKm', 'maxWeeklyIncreasePct', 'recoveryCycle', 'maxRunMinutes']) {
        if (persona.expect[key] !== undefined) record(`population rule ${key}`, SPECIFIC[key](r, persona, persona.expect[key]))
      }

      // Honest words: against advice, run-walk on the day, and the long run said plainly.
      const intro = r.explain?.intro || ''
      record('the intro says it is against advice', is(intro.includes('v tem času ni varen') && intro.includes('Na tvojo željo'), 'intro lacks the against-advice sentence'))
      record('the intro recommends run-walk on race day', is(intro.includes('izmenjuj tek in hojo'), 'intro lacks the race-day guidance'))
      record('the sentences travel as a notice (closes an AI intro too)', is((r.notices || []).some((n) => n.id === 'against_advice' && intro.includes(n.text)), 'no against_advice notice'))
      const longest = Math.max(0, ...r.weeks.flatMap((w) => w.days.filter((d) => d.type !== 'rest' && d.type !== 'race').map((d) => d.distance_km || 0)))
      record('the recorded longest run is the plan\'s own', is(advice?.longest_run_km === longest, `recorded ${advice?.longest_run_km}, plan ${longest}`))
      const short = longest < (r.stored.planning.feasibility.requirements.long_run_min_km - 0.5)
      if (short) sawShortLongRun = true
      record(short ? 'a long run far short of the race is said plainly' : 'no shortfall claimed where there is none',
        is(advice?.long_run_short === short && intro.includes('Povedano naravnost') === short, `long_run_short ${advice?.long_run_short}, longest ${longest} km`))

      // One explicit confirmation: choosing the option without it builds the safe goal.
      const unconfirmed = await planFor(persona, { extraAnswers: { safe_goal: 'override' } })
      record('without the confirmation the safe goal is built', is(!unconfirmed.againstAdvice && SPECIFIC.originalGoalNotBuilt(unconfirmed, persona).ok, 'built against advice without confirmation'))
      const offered = await planFor(persona)
      record('the verdict screen offers it and says why it is risky', is(offered.proposal?.override_allowed === true && (offered.explain?.risk_texts || []).length > 0 && offered.proposal.alternatives.length > 0, `override_allowed ${offered.proposal?.override_allowed}`))
    }
  }
  check('at least one persona shows the long-run shortfall sentence', sawShortLongRun)

  // Health gates are not goals: nothing the runner confirms unlocks them.
  for (const persona of gated) {
    const r = await planFor(persona, { extraAnswers: OVERRIDE })
    check(`${persona.id} (override): still blocked, no plan`, r.status === 'blocked' && !(r.weeks || []).length && r.block?.reason === persona.expect.blocked.reason)
  }
  check('every health gate is covered', ['pregnant', 'under_15', 'pain_at_rest', 'cardiac_symptoms', 'postpartum_early', 'postpartum_not_cleared', 'known_condition_inactive']
    .every((reason) => gated.some((p) => p.expect.blocked.reason === reason)))
}

// Standalone runs (node tests/personas.test.mjs) signal failure too.
if (process.argv[1]?.endsWith('personas.test.mjs') && rows.some((r) => r.failed.length)) {
  process.exitCode = 1
}

export default summary('personas')
