/**
 * coach-prompt.js — who Coach Runko is, and everything he knows when he answers.
 *
 * Two jobs:
 *  1. COACH_PERSONA — the personality and the hard rules about how to reply.
 *  2. buildRunnerContext() — the full picture of one runner, assembled from
 *     profile, coach memory, plan, and logged runs, as prompt text.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM.
 */

// ---------------------------------------------------------------------------
// Personality
// ---------------------------------------------------------------------------

/**
 * The coach's character and reply rules.
 *
 * Written as prohibitions as much as instructions, because the failure modes
 * of a chat coach are specific and predictable: padding, hedging, moralising,
 * and turning a two-sentence answer into a formatted document.
 */
export const COACH_PERSONA = `You are Runko, a running coach talking to one runner you know well.

WHO YOU ARE
You are supportive but concrete. You have opinions and you give them. When a
runner asks something, they get an actual answer — a number, a pace, a
decision — not a list of things it might depend on.

You know the runner has a life outside running. Work, kids, illness, travel
and bad weeks are normal and you treat them as normal. A missed session is a
scheduling fact, not a moral failure.

HOW YOU REPLY
- Two or three sentences by default. Go longer only when the question genuinely
  needs it (explaining a workout structure, walking through a race plan).
- Lead with the answer. No warm-up sentence, no restating the question, no
  "great question".
- Be specific. "Run it at 5:30/km" beats "run it at an easy pace". Use the
  runner's own numbers from the context below whenever they apply.
- Plain conversational prose. This is a chat, not a document: no markdown
  headings, no bullet lists, no bold labels, no numbered steps. If you need to
  give two or three items, say them in a sentence.
- At most one emoji, and only where it genuinely adds warmth. Usually none.
- Never moralise, never lecture about discipline or consistency, never imply
  the runner should feel guilty.
- Do not hedge into uselessness. If something depends on a factor, state your
  best recommendation and name the factor in the same breath.
- Do not pad the end with encouragement the runner did not ask for.

LANGUAGE
Reply in the language the runner writes in. If they write Slovenian, reply in
natural, idiomatic Slovenian — not a translation of English phrasing. If they
write English, reply in English. If they switch, you switch.

SAFETY
You are not a doctor. For pain, injury or illness you can suggest reducing
load, resting, and what to watch for, but anything sharp, worsening, swollen,
or affecting how they walk means seeing a professional — say so plainly and
without drama. Never diagnose and never prescribe treatment or medication.`

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

const SLOVENIAN_MARKERS = [
  'sem', 'nisem', 'kaj', 'kako', 'kje', 'kdaj', 'zakaj', 'naj', 'sem', 'bom',
  'lahko', 'moram', 'imam', 'nimam', 'danes', 'jutri', 'vceraj', 'teden',
  'tek', 'tekel', 'tecem', 'tekla', 'trening', 'koleno', 'bolecina', 'boli',
  'hvala', 'prosim', 'dober', 'dobro', 'slabo', 'zelo', 'malo', 'veliko',
  'nekaj', 'samo', 'ampak', 'zato', 'ker', 'ce', 'tudi', 'sem', 'pa',
]

/**
 * Best-effort language guess for the hint we pass alongside the persona rule.
 * Slovenian-specific letters are decisive; otherwise we look for common words.
 * The model is told to mirror the runner regardless, so a wrong guess here is
 * a missed hint, not a wrong answer.
 *
 * @returns {'sl'|'en'}
 */
export function detectLanguage(text) {
  if (!text) return 'en'
  if (/[čšžČŠŽ]/.test(text)) return 'sl'
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z]+/)
    .filter(Boolean)
  if (!words.length) return 'en'
  const hits = words.filter((w) => SLOVENIAN_MARKERS.includes(w)).length
  return hits >= 2 || (words.length <= 4 && hits >= 1) ? 'sl' : 'en'
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Enforce the conversational format the persona asks for.
 *
 * The system prompt already bans markdown, but models reach for headings and
 * bullet lists the moment a reply gets long, and a chat bubble full of `###`
 * and `- ` reads like a document. This is the belt to the prompt's braces:
 * it strips the markup and turns list items back into sentences, rather than
 * leaving raw syntax on screen.
 */
export function sanitizeChatReply(text) {
  if (typeof text !== 'string') return ''

  const lines = text.split(/\r?\n/)
  const out = []

  for (const raw of lines) {
    let line = raw.trim()
    if (!line) {
      out.push('')
      continue
    }
    // ### Heading -> plain sentence
    line = line.replace(/^#{1,6}\s+/, '')
    // - item / * item / 1. item -> sentence, joined into the running paragraph
    const bullet = /^([-*•]|\d+[.)])\s+/.test(line)
    if (bullet) line = line.replace(/^([-*•]|\d+[.)])\s+/, '')
    // **bold**, *italic*, `code`, __underline__
    line = line.replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*(?=\W|$)/g, '$1$2')
      .replace(/__(.+?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
    // A heading that became a bare label ("Warm-up:") reads fine inline.
    if (bullet) {
      const prev = out.length ? out[out.length - 1] : ''
      if (prev && !/[.!?:]$/.test(prev)) out[out.length - 1] = `${prev}.`
      // Give the item terminal punctuation so sentences do not run together.
      if (!/[.!?]$/.test(line)) line += '.'
      if (prev) {
        out[out.length - 1] = `${out[out.length - 1]} ${line}`.trim()
        continue
      }
    }
    out.push(line)
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse runs of blank lines
    .trim()
}

/** "1:45:00" / "45:30" from minutes. */
export function formatClock(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** "5:42" from 5.7 min/km. */
export function formatPace(minPerKm) {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return null
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

/** Whole weeks from today to an ISO date; negative once it has passed. */
export function weeksUntil(iso, from = new Date()) {
  if (!iso) return null
  const target = new Date(iso + 'T00:00:00')
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  return Math.ceil((target - start) / (7 * 86_400_000))
}

/**
 * The complete runner picture for a coach call.
 *
 * Deliberately exhaustive — this is the difference between a coach that gives
 * generic advice and one that answers about THIS runner:
 *   profile, coach memory, current plan week + today's session, weeks left
 *   until the event, and the last logged runs with their actual paces.
 *
 * @param {object} opts
 * @param {object} opts.profile - the users row
 * @param {Array} [opts.memories] - coach_memory rows
 * @param {Array} [opts.plans] - all training_plans rows
 * @param {number} [opts.currentWeek] - the week number the runner is in
 * @param {Array} [opts.workouts] - logged runs, newest first
 * @param {number} [opts.workoutLimit] - how many runs to include (default 10)
 * @param {Date} [opts.today]
 * @returns {string}
 */
export function buildRunnerContext({
  profile,
  memories = [],
  plans = [],
  currentWeek = null,
  workouts = [],
  workoutLimit = 10,
  today = new Date(),
} = {}) {
  const p = profile || {}
  const todayISO = toISO(today)
  const lines = [`TODAY: ${todayISO} (${DAY_NAMES[(today.getDay() + 6) % 7]})`, '', 'RUNNER:']

  lines.push(`- Name: ${p.name || 'not given'}`)
  lines.push(`- Age: ${p.age ?? 'not given'}`)
  lines.push(`- Weight: ${p.weight ? `${p.weight} kg` : 'not given'}`)
  lines.push(`- Self-assessed level: ${p.fitness_level || 'not given'}`)

  // The goal is a DISTANCE. The date is optional, and so is the target time.
  const distance = Number(p.target_distance_km)
  if (distance > 0) {
    lines.push(`- Goal distance: ${distance} km`)
    if (Number(p.target_time_min) > 0) {
      const t = Number(p.target_time_min)
      lines.push(
        `- Target time: ${formatClock(t)} (${formatPace(t / distance)}/km)`
      )
    }
  }
  if (p.event_date) {
    const left = weeksUntil(p.event_date, today)
    lines.push(
      `- Event date: ${p.event_date}`,
      `- Weeks until it: ${left < 0 ? 'it has already happened' : left}`
    )
  } else if (distance > 0) {
    lines.push('- No date set — training toward the distance, not a deadline.')
  } else {
    lines.push('- Goal: general fitness, nothing specific booked')
  }
  if (Number(p.days_per_week) > 0) lines.push(`- Can run ${p.days_per_week} days a week`)
  if (Array.isArray(p.available_days) && p.available_days.length) {
    lines.push(`- Available days: ${p.available_days.join(', ')}`)
  }
  if (Number(p.weekly_volume_km) > 0) {
    lines.push(`- Says their usual weekly volume is ${p.weekly_volume_km} km`)
  }
  if (p.coach_notes) lines.push(`- Said at signup: "${p.coach_notes}"`)

  // --- coach memory ---------------------------------------------------------
  lines.push('', 'WHAT YOU REMEMBER ABOUT THEM:')
  if (memories.length) {
    for (const m of memories) {
      lines.push(`- [${m.category}] ${m.content}`)
    }
    lines.push(
      'Treat these as still true unless the runner says otherwise. Act on them',
      'without announcing that you remembered them.'
    )
  } else {
    lines.push('- Nothing yet. This is early in your relationship.')
  }

  // --- plan -----------------------------------------------------------------
  const week = currentWeek ?? (plans.length ? plans[0].week_number : null)
  const planRow = plans.find((r) => r.week_number === week) || null
  const lastWeek = plans.length ? plans[plans.length - 1].week_number : null

  lines.push('', 'THEIR PLAN:')
  if (planRow?.plan_json?.days?.length) {
    const json = planRow.plan_json
    lines.push(
      `- Week ${week} of ${lastWeek}${json.phase ? `, ${json.phase} phase` : ''}` +
        `${json.is_recovery ? ' (recovery week)' : ''}`,
      `- This week is about: ${json.focus || 'n/a'}`
    )
    const todayName = DAY_NAMES[(today.getDay() + 6) % 7]
    const todays = json.days.find((d) => d.day === todayName)
    lines.push(
      todays
        ? `- TODAY (${todayName}): ${todays.type} — ${todays.title}` +
            `${todays.distance_km ? `, ${todays.distance_km} km` : ''}` +
            `${todays.pace ? ` at ${todays.pace}` : ''}` +
            `${todays.purpose ? ` (${todays.purpose})` : ''}`
        : `- TODAY (${todayName}): nothing scheduled`
    )
    lines.push('- The rest of this week:')
    for (const d of json.days) {
      if (d.day === todayName) continue
      lines.push(
        `  - ${d.day}: ${d.title}${d.distance_km ? ` — ${d.distance_km} km` : ''}` +
          `${d.pace ? ` at ${d.pace}` : ''}`
      )
    }
  } else {
    lines.push('- No training plan yet.')
  }

  // --- logged runs ----------------------------------------------------------
  const recent = workouts.slice(0, workoutLimit)
  lines.push('', `THEIR LAST ${recent.length || 0} LOGGED RUNS (newest first):`)
  if (recent.length) {
    for (const w of recent) {
      const dist = Number(w.distance)
      const dur = Number(w.duration)
      if (!(dist > 0)) {
        lines.push(`- ${w.date}: MISSED / skipped${w.notes ? ` — "${w.notes}"` : ''}`)
        continue
      }
      const pace = dur > 0 ? formatPace(dur / dist) : null
      lines.push(
        `- ${w.date}: ${dist} km in ${dur} min${pace ? ` (${pace}/km)` : ''}` +
          `, effort ${w.effort}/5${w.notes ? `, "${w.notes}"` : ''}`
      )
    }
    const week7 = workouts.filter((w) => daysBetween(w.date, todayISO) <= 7 && Number(w.distance) > 0)
    const vol = week7.reduce((s, w) => s + Number(w.distance), 0)
    lines.push(`- Volume in the last 7 days: ${vol.toFixed(1)} km across ${week7.length} run(s).`)
  } else {
    lines.push('- Nothing logged yet.')
  }

  return lines.join('\n')
}

function toISO(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

function daysBetween(isoA, isoB) {
  return Math.abs(new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86_400_000
}

/**
 * Assemble the full system message: persona + knowledge base + runner context.
 * @returns {string}
 */
export function buildCoachSystemPrompt({ context = '', knowledge = '', language = 'en' } = {}) {
  return [
    COACH_PERSONA,
    language === 'sl'
      ? '\nThe runner is writing in Slovenian — reply in Slovenian.'
      : '',
    knowledge ? `\n${knowledge}` : '',
    context ? `\n# THIS RUNNER\n\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
