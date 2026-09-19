/**
 * ai.js — every call to the AI provider (Groq) lives here.
 *
 * AI INTEGRATION POINT (central):
 * All of Runko's "coach intelligence" flows through callAi(), a plain fetch
 * to the Groq chat-completions API (OpenAI-compatible). The rest of the app
 * never talks to the provider directly — it uses the purpose-built helpers
 * below (askCoach, describePlanSkeleton, adaptWeeklyPlan, coachReaction,
 * motivationalMessage, coachIntakeFollowUp). Swapping models or providers
 * only requires touching this file.
 *
 * NOTE: calling the API straight from the browser exposes the API key to the
 * client. Fine for an MVP/demo; for production move these calls behind a
 * Supabase Edge Function and keep the key server-side.
 */
import { IS_DEV, GROQ_API_KEY } from './env'
import {
  COACH_PERSONA,
  buildCoachSystemPrompt,
  buildRunnerContext,
  detectLanguage,
  sanitizeChatReply,
} from './coach-prompt'
import { buildKnowledgeBlock, KNOWLEDGE_BUDGETS } from './knowledge'
import { buildExtractionPrompt, parseExtractedMemories } from './memory'

const API_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq models, tried in order — a 404 (retired slug) falls through to the next.
// NOTE: llama-3.3-70b-versatile currently 404s on this account's key (Groq has
// retired the slug; it is not in GET /openai/v1/models). It stays first so the
// app picks it up again if it returns; the gpt-oss models below are what
// actually serves requests today.
const MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']

const FRIENDLY_QUOTA =
  'Your coach is catching his breath — the AI service hit its request limit. Give it a minute and try again. 🙏'
const FRIENDLY_GENERIC =
  'Your coach couldn’t be reached right now. Check your connection and try again in a moment.'

/** Human-readable message for any error thrown from this module. */
export function friendlyAiMessage(err) {
  return err?.friendly || FRIENDLY_GENERIC
}

// COACH_PERSONA now lives in ./coach-prompt.js (imported above) so that the
// personality, the reply rules and the context builder sit together.

const DEBUG = IS_DEV
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Dev-time sanity check: is the key actually being read from .env?
if (DEBUG) {
  const k = GROQ_API_KEY
  console.log(
    '[ai] VITE_GROQ_API_KEY:',
    k ? `${k.slice(0, 12)}… (length ${k.length})` : '❌ MISSING — add it to .env and restart `npm run dev`'
  )
}

/**
 * Low-level Groq call.
 *  - Tries each model in MODELS: 404 (retired slug) and 5xx skip to the next.
 *  - 429 waits for the provider's Retry-After (capped) and retries the same
 *    model once before moving on.
 *  - 400 retries once with a smaller output budget (max_tokens too high).
 * Every thrown error carries a `.friendly` message for the UI.
 * @param {object} opts
 * @param {string} opts.system - system prompt text
 * @param {Array<{role: 'user'|'assistant', content: string}>} opts.messages
 * @param {boolean} [opts.json] - the prompt requests a JSON response
 * @param {number} [opts.maxTokens] - output token cap (plans need more room)
 * @returns {Promise<string>} model text output
 */
async function callAi({ system, messages, json = false, maxTokens = 1024 }) {
  const key = GROQ_API_KEY
  if (!key) {
    const err = new Error('Missing VITE_GROQ_API_KEY — add it to your .env file.')
    err.friendly = FRIENDLY_GENERIC
    throw err
  }

  const apiMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  let lastErr = null

  for (const model of MODELS) {
    let budget = maxTokens
    let retried429 = false

    for (let attempt = 0; attempt < 3; attempt++) {
      const body = {
        model,
        messages: apiMessages,
        temperature: json ? 0.4 : 0.8,
        max_tokens: budget,
        // Groq's OpenAI-compatible JSON mode — the model can only emit a
        // valid JSON object, which kills the "here's your plan:" preamble
        // small models like to add.
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }
      if (DEBUG) console.log('[ai] request →', model, `(attempt ${attempt + 1}, max_tokens ${budget})`, body)

      let res, raw
      try {
        res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
        raw = await res.text()
      } catch (networkErr) {
        if (DEBUG) console.log('[ai] network error ←', model, networkErr)
        networkErr.friendly = FRIENDLY_GENERIC
        throw networkErr
      }
      if (DEBUG) console.log('[ai] response ←', model, `HTTP ${res.status}`, raw)

      let data = null
      try {
        data = JSON.parse(raw)
      } catch {
        /* non-JSON body; handled below */
      }

      // Groq reports failures with the HTTP status; a 200 carrying an `error`
      // object is treated as a server-side failure. (error.code is a string
      // like "model_not_found", so never use it as a status.)
      const status = !res.ok ? res.status : data?.error ? 500 : 200

      if (status === 200) {
        const text = data?.choices?.[0]?.message?.content
        if (text) return text
        lastErr = new Error(`Groq (${model}) returned an empty response.`)
        lastErr.friendly = FRIENDLY_GENERIC
        break // next model
      }

      const detail = data?.error?.message || raw?.slice(0, 200) || ''
      lastErr = new Error(`Groq API error ${status} (${model}): ${detail}`)
      lastErr.friendly = status === 429 ? FRIENDLY_QUOTA : FRIENDLY_GENERIC

      if (status === 400 && budget > 4096) {
        budget = 4096 // model rejected the output budget — shrink and retry
        continue
      }
      if (status === 429 && !retried429) {
        // Rate limits on Groq are short-lived; the Retry-After header (or the
        // "try again in 7.5s" in the message) says how long to wait.
        retried429 = true
        const header = Number(res.headers.get('retry-after'))
        const fromMessage = Number(/try again in ([\d.]+)s/i.exec(detail)?.[1])
        const retryAfter = header || fromMessage || 3
        await sleep(Math.min(Math.ceil(retryAfter), 10) * 1000)
        continue
      }
      if (status === 404 || status === 429 || status >= 500) break // next model
      throw lastErr // other 4xx (bad key, malformed request) won't improve
    }
  }
  throw lastErr
}

/** Builds the context block the coach sees before every conversation. */
export function buildCoachContext(profile, plan, workouts = [], { totalWeeks } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  const lines = [
    `Today's date: ${today}`,
    `Runner profile:`,
    `- Name: ${profile?.name || 'Unknown'}`,
    `- Fitness level: ${profile?.fitness_level || 'unknown'}`,
    Number(profile?.target_distance_km) > 0
      ? `- Goal: ${profile.target_distance_km} km` +
        (profile.event_date ? ` on ${profile.event_date}` : ' (no date set)')
      : `- Goal: general fitness`,
  ]
  if (profile?.age) lines.push(`- Age: ${profile.age}`)
  if (profile?.weight) lines.push(`- Weight: ${profile.weight} kg`)
  if (profile?.coach_notes) lines.push(`- Notes from the runner: "${profile.coach_notes}"`)
  if (plan?.plan_json?.days) {
    const weekLabel = totalWeeks
      ? `week ${plan.week_number} of ${totalWeeks}`
      : `week ${plan.week_number}`
    lines.push(
      '',
      `Current training plan (${weekLabel}, focus: ${plan.plan_json.focus || 'n/a'}):`,
      // Include the prescribed pace/purpose so the coach can answer "how fast
      // should this be?" from the plan instead of guessing.
      ...plan.plan_json.days.map(
        (d) =>
          `- ${d.day}: ${d.title}${d.distance_km ? ` (${d.distance_km} km)` : ''}` +
          `${d.pace ? ` at ${d.pace}` : ''}${d.purpose ? ` — ${d.purpose}` : ''}`
      )
    )
  }
  if (workouts.length) {
    lines.push(
      '',
      `Recent logged runs (newest first):`,
      ...workouts
        .slice(0, 8)
        .map(
          (w) =>
            `- ${w.date}: ${w.distance} km in ${w.duration} min, effort ${w.effort}/5${
              w.notes ? `, notes: "${w.notes}"` : ''
            }`
        )
    )
  }
  return lines.join('\n')
}

/**
 * AI INTEGRATION POINT — Coach chat.
 * history: prior chat messages ({role, content}), newest last.
 */
export async function askCoach({
  profile,
  memories = [],
  plans = [],
  currentWeek = null,
  workouts = [],
  history = [],
}) {
  // The newest thing the runner said drives both the language choice and
  // which knowledge documents get pulled in.
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || ''

  const system = buildCoachSystemPrompt({
    context: buildRunnerContext({ profile, memories, plans, currentWeek, workouts }),
    knowledge: buildKnowledgeBlock({
      situations: ['chat'],
      text: lastUser,
      budgetTokens: KNOWLEDGE_BUDGETS.chat,
    }),
    language: detectLanguage(lastUser),
  })

  const reply = await callAi({
    system,
    // The AI context stays at the last 20 messages even though the screen
    // shows more — see core/db.js getChatMessages.
    messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
  })
  // The prompt bans markdown; this makes sure of it.
  return sanitizeChatReply(reply)
}

/**
 * AI INTEGRATION POINT — coach memory extraction.
 * Runs after a chat exchange and returns only durable facts (usually none).
 * Cheap on purpose: small budget, low temperature, JSON mode.
 * Storage is the caller's job — see core/memory.js.
 *
 * @returns {Promise<Array<{content: string, category: string}>>}
 */
export async function extractMemories({ userMessage, coachReply, existing = [] }) {
  try {
    const text = await callAi({
      system:
        'You extract durable, training-relevant facts about a runner for a coaching' +
        ' assistant. You are conservative: most exchanges yield nothing. You output JSON only.',
      messages: [
        { role: 'user', content: buildExtractionPrompt({ userMessage, coachReply, existing }) },
      ],
      json: true,
      maxTokens: 400,
    })
    const facts = parseExtractedMemories(text, { existing })
    if (IS_DEV) {
      console.log(
        facts.length
          ? `[memory] extracted ${facts.length} new fact(s): ` +
              facts.map((f) => `[${f.category}] ${f.content}`).join(' | ')
          : '[memory] nothing durable in this exchange (the usual outcome).'
      )
    }
    return facts
  } catch (err) {
    // Memory is an enhancement; never let it break a chat reply.
    if (IS_DEV) console.warn('[memory] extraction failed (ignored):', err.message)
    return []
  }
}

// ---------------------------------------------------------------------------
// Onboarding intake
// ---------------------------------------------------------------------------

/**
 * Plain-text summary of everything collected during onboarding. Shared by the
 * follow-up chat and the plan generator so both see the same picture.
 * @param {object} intake - { name, age, weight, fitness_level, goal,
 *   event_name, event_date, hasRunBefore, runs, notes, followUp }
 */
export function intakeSummary(intake) {
  const lines = [
    `New runner intake:`,
    `- Name: ${intake.name}`,
    intake.age ? `- Age: ${intake.age}` : null,
    intake.weight ? `- Weight: ${intake.weight} kg` : null,
    `- Self-assessed fitness level: ${intake.fitness_level}`,
    intake.goal === 'event'
      ? `- Goal: preparing for "${intake.event_name}" on ${intake.event_date}`
      : `- Goal: general fitness`,
  ].filter(Boolean)

  if (intake.hasRunBefore === false) {
    lines.push(`- Brand new to running; did a 3 km test run at conversational pace.`)
  }
  if (intake.runs?.length) {
    lines.push(
      `- Recent runs they logged:`,
      ...intake.runs.map(
        (r) =>
          `  - ${r.date}: ${r.distance} km in ${r.duration} min, effort ${r.effort}/5${
            r.hr ? `, avg HR ${r.hr}` : ''
          }`
      )
    )
  }
  if (intake.notes?.trim()) {
    lines.push(`- In their own words: "${intake.notes.trim()}"`)
  }
  if (intake.followUp?.length) {
    lines.push(
      `- Follow-up conversation with the coach:`,
      ...intake.followUp.map((m) => `  ${m.role === 'user' ? 'Runner' : 'Coach'}: ${m.content}`)
    )
  }
  return lines.join('\n')
}

/** The coach signals it has everything it needs with this token. */
export const INTAKE_READY_TOKEN = '[READY]'

/**
 * AI INTEGRATION POINT — Onboarding follow-up chat (thorough path).
 * The coach reviews the intake and asks short follow-up questions, one per
 * message, at most 3 in total. When satisfied it summarises how it will
 * build the plan and ends the message with INTAKE_READY_TOKEN.
 */
export async function coachIntakeFollowUp(intake, history) {
  const system = `${COACH_PERSONA}

You are onboarding this new runner. Everything they told you so far:

${intakeSummary(intake)}

Your job now: ask the most useful follow-up question to fine-tune their
training plan (things like injuries, weekly time available, preferred running
days, past race times). Ask ONE short question per message and AT MOST 3
questions in the whole conversation. When you have enough — or after the 3rd
answer — reply with 2-3 warm sentences confirming how you'll shape their plan
and end that final message with the exact token ${INTAKE_READY_TOKEN}`

  return callAi({
    system,
    messages: history.length
      ? history.slice(-12)
      : [{ role: 'user', content: '(The runner just finished the intake form. Start the follow-up.)' }],
  })
}

// ---------------------------------------------------------------------------
// Plan generation & adaptation
// ---------------------------------------------------------------------------

/** Shared description of the 7-day shape the model must return for each week. */
const DAYS_SCHEMA = `{
  "day": "Monday",
  "type": "easy" | "tempo" | "long" | "interval" | "cross" | "rest",
  "title": "<short workout name>",
  "description": "<1-2 sentence instruction>",
  "distance_km": <number, 0 for rest/cross>,
  "duration_min": <number, 0 for rest>,
  "pace": "<target pace as min:ss/km, or an effort cue like 'conversational, RPE 3/5' where a pace makes no sense (rest, cross-training)>",
  "purpose": "<ONE short line on why this session exists, e.g. 'builds aerobic base'>"
}
Each week's "days" array must contain all 7 days, Monday through Sunday.
Every day object must include ALL of the keys above — including "pace" and
"purpose" on rest days ("pace": "rest", "purpose": "lets adaptation happen").`

const WEEK_SCHEMA_PROMPT = `Respond ONLY with valid JSON, no prose before or after, matching exactly this shape:
{
  "focus": "<one-line theme for the week>",
  "days": [ <7 day objects> ]
}
where each day object is:
${DAYS_SCHEMA}`


/**
 * AI INTEGRATION POINT — Plan adaptation (premium).
 * Rewrites one week of the plan based on what the runner actually did.
 * Used both for the weekly rollover (adapt the new week from last week's
 * logs) and for immediate triggers (missed or very hard workout).
 *
 * The week's calculated metadata (phase, volume target, paces) is preserved
 * by the caller — see mergeAdapted() in core/plan.js.
 *
 * @param {object} profile
 * @param {object} opts
 * @param {number} opts.weekNumber - the week being rewritten
 * @param {object} [opts.basePlan] - that week's current plan_json, if any
 * @param {Array} [opts.recentWorkouts] - logged runs to adapt from
 * @param {'missed'|'hard'|'weekly'} [opts.trigger]
 */
export async function adaptWeeklyPlan(profile, { weekNumber, basePlan, recentWorkouts = [], trigger = 'weekly' }) {
  const triggerText = {
    missed: 'The runner just MISSED a planned workout. Ease back into volume, do not punish the missed session.',
    hard: 'The runner just logged a VERY HARD workout (effort 4-5/5). Add recovery and reduce intensity early in the week.',
    weekly:
      'A new training week is starting. Adapt it to how the previous week actually went — reduce volume if workouts were missed or felt very hard, progress normally if they went well.',
  }[trigger]

  const text = await callAi({
    system: 'You are an expert running coach who adapts training plans based on athlete feedback.',
    messages: [
      {
        role: 'user',
        content: `${buildCoachContext(profile, null, recentWorkouts)}

${triggerText}
${
  basePlan
    ? `The originally planned week ${weekNumber} was:\n${JSON.stringify(basePlan)}\nAdjust it as needed while keeping its overall intent.`
    : `Write week ${weekNumber} of the plan.`
}
${WEEK_SCHEMA_PROMPT}`,
      },
    ],
    json: true,
    maxTokens: 2048,
  })
  return parseWeekJson(text)
}

/**
 * AI INTEGRATION POINT — Post-log reaction.
 * Short, personal one-liner shown right after the user logs a run.
 */
export async function coachReaction(profile, plan, workout) {
  return callAi({
    system: COACH_PERSONA,
    messages: [
      {
        role: 'user',
        content: `${buildCoachContext(profile, plan)}

I just logged: ${workout.distance} km in ${workout.duration} min, perceived effort ${workout.effort}/5${
          workout.notes ? `, notes: "${workout.notes}"` : ''
        }${Number(workout.distance) === 0 ? ' (I missed / skipped this workout)' : ''}.
React in 1-2 short sentences as my coach — acknowledge the run and give one forward-looking tip.`,
      },
    ],
  })
}

/**
 * AI INTEGRATION POINT — Dashboard motivational message.
 * Cached per-day in sessionStorage by the caller to avoid burning quota.
 */
export async function motivationalMessage(profile, plan, workouts) {
  return callAi({
    system: COACH_PERSONA,
    messages: [
      {
        role: 'user',
        content: `${buildCoachContext(profile, plan, workouts)}

Write ONE short motivational message (max 25 words) for my dashboard today. Personal, warm, no hashtags, no quotes around it.`,
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Plan description — the AI writes the words, the skeleton owns the numbers
// ---------------------------------------------------------------------------

/**
 * How far an AI-returned distance may drift from the calculated one before we
 * discard it: the larger of 0.5 km and 5%.
 */
export const DISTANCE_TOLERANCE_KM = 0.5
export const DISTANCE_TOLERANCE_PCT = 0.05

/** "21.1 km on 2026-11-15" / "30 km, no date — training block". */
function goalLine(skeleton) {
  const d = skeleton.target_distance_km
  if (!d) return skeleton.event_date ? `an event on ${skeleton.event_date}` : 'general fitness'
  return skeleton.event_date
    ? `${d} km on ${skeleton.event_date}`
    : `${d} km, no date set — training toward the distance`
}

/** The goal-time reality check, when there is one to report. */
function goalAssessmentBlock(skeleton) {
  const g = skeleton.goal_assessment
  if (!g) return ''
  const lines = ['GOAL ASSESSMENT']
  lines.push(`- Target distance: ${g.target_distance_km} km`)
  if (g.target_time_min) {
    lines.push(`- Target time: ${formatDurationMin(g.target_time_min)} (${paceLabel(g.target_time_min / g.target_distance_km)}/km)`)
  } else {
    lines.push('- No target time given.')
  }
  lines.push(`- Current fitness predicts about ${formatDurationMin(g.predicted_time_min)}.`)
  lines.push(`- The plan is built toward ${formatDurationMin(g.planning_time_min)} (${paceLabel(g.goal_pace_min_per_km)}/km).`)
  if (g.message) lines.push(`- NOTE FOR YOU: ${g.message}`)
  return lines.join('\n') + '\n'
}

function formatDurationMin(minutes) {
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function paceLabel(minPerKm) {
  const m = Math.floor(minPerKm)
  const sec = Math.round((minPerKm - m) * 60)
  return sec === 60 ? `${m + 1}:00` : `${m}:${String(sec).padStart(2, '0')}`
}

/** Compact view of the skeleton for the prompt — small enough to fit many weeks. */
function skeletonForPrompt(skeleton) {
  return skeleton.weeks.map((w) => ({
    week: w.week_number,
    phase: w.phase,
    recovery: w.is_recovery,
    volume_km: w.target_volume_km,
    days: w.days.map((d) => ({
      day: d.day,
      type: d.type,
      km: d.distance_km,
      pace: d.pace,
      intensity: d.intensity,
      ...(d.hard_km ? { hard_km: d.hard_km } : {}),
    })),
  }))
}

/**
 * Merge the AI's prose onto the calculated skeleton, and VALIDATE.
 *
 * The skeleton is authoritative. If the model changed a distance beyond
 * tolerance or altered a pace, the calculated value wins and we log a warning
 * — silently accepting drift would let the AI quietly undo the periodization.
 *
 * Exported for testing without an API call.
 *
 * @returns {{weeks: Array, warnings: string[], intro: string}}
 */
export function mergeDescriptions(skeleton, aiWeeks, aiIntro = '') {
  const warnings = []
  const byWeek = new Map(
    (Array.isArray(aiWeeks) ? aiWeeks : []).map((w) => [Number(w.week_number), w])
  )

  const weeks = skeleton.weeks.map((week) => {
    const ai = byWeek.get(week.week_number)
    const aiDays = new Map(
      (Array.isArray(ai?.days) ? ai.days : []).map((d) => [String(d.day), d])
    )

    const days = week.days.map((day) => {
      const got = aiDays.get(day.day)

      if (got) {
        // Numbers are the skeleton's business. Check, warn, discard.
        if (got.distance_km !== undefined && got.distance_km !== null) {
          const proposed = Number(got.distance_km)
          const allowed = Math.max(
            DISTANCE_TOLERANCE_KM,
            day.distance_km * DISTANCE_TOLERANCE_PCT
          )
          if (Number.isFinite(proposed) && Math.abs(proposed - day.distance_km) > allowed) {
            warnings.push(
              `week ${week.week_number} ${day.day}: AI proposed ${proposed} km, ` +
                `keeping the calculated ${day.distance_km} km`
            )
          }
        }
        if (got.pace && String(got.pace).trim() !== day.pace) {
          warnings.push(
            `week ${week.week_number} ${day.day}: AI proposed pace "${got.pace}", ` +
              `keeping the calculated "${day.pace}"`
          )
        }
      }

      return {
        ...day, // calculated values always win
        title: cleanText(got?.title).slice(0, 40) || day.title,
        description: cleanText(got?.description) || defaultDescription(day),
        purpose: cleanText(got?.purpose) || defaultPurpose(day),
      }
    })

    return {
      ...week,
      focus: cleanText(ai?.note) || defaultWeekFocus(week),
      days,
    }
  })

  return { weeks, warnings, intro: cleanText(aiIntro, 600) || defaultIntro(skeleton) }
}

function cleanText(s, max = 300) {
  if (typeof s !== 'string') return ''
  // Strip any markdown the model reached for; these render as plain text.
  return s.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** A usable intro when the AI gives none — states the goal and the shape. */
function defaultIntro(skeleton) {
  const d = skeleton.target_distance_km
  const weeks = skeleton.total_weeks
  const goal = d
    ? skeleton.event_date
      ? `${d} km dne ${skeleton.event_date}`
      : `${d} km`
    : 'splošno kondicijo'
  const parts = [`${weeks}-tedenski načrt za ${goal}.`]
  parts.push(
    `Obseg raste postopoma do ${skeleton.peak_volume_km} km na teden, vsak 4. teden je lažji.`
  )
  const g = skeleton.goal_assessment
  if (g && !g.realistic) {
    parts.push(
      `Tvoj ciljni čas je za zdaj še izven dosega — načrt te pelje proti ${formatDurationMin(g.planning_time_min)}, kar je odličen napredek.`
    )
  }
  return parts.join(' ')
}

/** Readable fallbacks so a plan is never blank, even with no AI at all. */
function defaultDescription(day) {
  if (day.type === 'rest') return 'Počitek. Nič teka danes.'
  const km = day.distance_km
  switch (day.type) {
    case 'long':
      return `Dolgi tek, ${km} km pri ${day.pace}. Umirjeno od začetka do konca.`
    case 'tempo':
      return `Ogrej se, nato ${day.hard_km || km} km pri ${day.pace}, na koncu umiri.`
    case 'interval':
      return `Ogrevanje, nato intervali v skupni dolžini ${day.hard_km || km} km pri ${day.pace}.`
    default:
      return `Lahkoten tek, ${km} km pri ${day.pace}. Pogovorni tempo.`
  }
}

function defaultPurpose(day) {
  return {
    rest: 'telo se prilagodi na trening',
    easy: 'gradi aerobno osnovo',
    long: 'razširi vzdržljivost',
    tempo: 'dviguje laktatni prag',
    interval: 'izboljša VO2 max',
    cross: 'ohranja kondicijo brez obremenitve nog',
  }[day.type] || 'gradi aerobno osnovo'
}

function defaultWeekFocus(week) {
  if (week.is_recovery) return `Regeneracijski teden — ${week.target_volume_km} km, brez trdih treningov.`
  const phase = {
    base: 'Osnova',
    build: 'Nadgradnja',
    sharpen: 'Ostrenje',
    taper: 'Razbremenitev',
  }[week.phase] || 'Trening'
  return `${phase} — ${week.target_volume_km} km.`
}

/**
 * AI INTEGRATION POINT — describe a calculated plan skeleton.
 *
 * The model receives the finished structure and writes ONLY prose: each
 * workout's description and purpose, and a short note per week. It never
 * decides distances, paces or which day a session lands on.
 *
 * Retries once on malformed JSON; if it still fails, the caller gets the
 * skeleton with the built-in default descriptions, which is a complete and
 * correct plan — just less personal.
 *
 * @param {object} skeleton - from core/periodization.js
 * @param {object} opts
 * @param {object} opts.profile
 * @param {Array} [opts.memories]
 * @param {string} [opts.language] - 'sl' (default) or 'en'
 * @returns {Promise<{weeks: Array, warnings: string[], described: boolean}>}
 */
export async function describePlanSkeleton(skeleton, { profile = {}, memories = [], language = 'sl' } = {}) {
  const constraints = skeleton.constraints || {}
  const languageName = language === 'sl' ? 'Slovenian' : 'English'

  const prompt = `You are writing the words for a training plan that has ALREADY been calculated.

THE RUNNER
- Name: ${profile.name || 'the runner'}
- Level: ${profile.fitness_level || 'beginner'}
- Goal: ${goalLine(skeleton)}
- Estimated VDOT: ${skeleton.vdot} (${skeleton.vdot_source === 'runs' ? 'from their logged runs' : 'estimated from their self-assessed level'})
- Their training paces per km: ${Object.entries(skeleton.paces)
    .map(([k, v]) => `${k} ${v.label}`)
    .join(', ')}

WHAT YOU KNOW ABOUT THEM
${constraints.notes?.length ? constraints.notes.map((n) => `- ${n}`).join('\n') : '- Nothing yet.'}
${constraints.noBackToBack ? '- The schedule ALREADY avoids back-to-back running days for them.' : ''}
${constraints.timeOfDay ? `- They run in the ${constraints.timeOfDay}; mention it naturally where it helps.` : ''}

${goalAssessmentBlock(skeleton)}
THE CALCULATED PLAN (${skeleton.total_weeks} weeks)
${JSON.stringify(skeletonForPrompt(skeleton))}

YOUR JOB
First write "intro": 2-3 sentences opening the plan. Say what it is building
toward and how it will feel. ${skeleton.goal_assessment?.message ? 'You MUST address the goal-time note above honestly in this intro — plainly, in one sentence, without discouraging them.' : ''}

Then for every day of every week, write:
- "title": a 1-3 word name for the session (e.g. "Lahkoten tek", "Dolgi tek").
- "description": how to actually run that session, 1-2 short sentences. Include
  the distance and target pace naturally. For tempo and interval days describe
  the warm-up, the hard part, and the cool-down.
- "purpose": ONE short phrase for why this session exists (e.g. "gradi aerobno osnovo").
And for every week a "note": one sentence on what that week is building toward.

RULES
- Write in ${languageName}, in the voice of Coach Runko: warm, direct, concrete,
  never preachy. Natural idiomatic ${languageName}, not a translation.
- DO NOT change any distance, pace, day or workout type. They are fixed. Describe
  what is there.
- Rest days get a description too — short.
- No markdown, no bullet points, no headings inside these strings.

Respond with JSON only:
{"intro":"...","weeks":[{"week_number":1,"note":"...","days":[{"day":"Monday","title":"...","description":"...","purpose":"..."}]}]}
Include all ${skeleton.total_weeks} weeks and all 7 days of each.`

  const system =
    'You write training-plan copy for a running coach app. You never alter the' +
    ' numbers you are given — you only describe them. You output JSON only.'

  let text
  try {
    text = await callAi({
      system,
      messages: [{ role: 'user', content: prompt }],
      json: true,
      maxTokens: 8000,
    })
  } catch (err) {
    if (DEBUG) console.warn('[plan] description call failed:', err.message)
    return { ...mergeDescriptions(skeleton, []), described: false }
  }

  let described = parseDescribedWeeks(text)
  if (!described) {
    if (DEBUG) console.warn('[plan] description JSON malformed — retrying once, stricter.')
    try {
      const retry = await callAi({
        system: `${system} Output raw JSON and nothing else.`,
        messages: [
          {
            role: 'user',
            content: `${prompt}

YOUR PREVIOUS ATTEMPT WAS NOT VALID JSON IN THE REQUIRED SHAPE.
Output a single JSON object with one key "weeks". Every entry needs
"week_number", "note" and a "days" array of 7 objects, each with "day",
"title", "description" and "purpose". No other keys, no prose, no markdown fences.`,
          },
        ],
        json: true,
        maxTokens: 8000,
      })
      described = parseDescribedWeeks(retry)
    } catch (err) {
      if (DEBUG) console.warn('[plan] stricter retry also failed:', err.message)
    }
  }

  if (!described) {
    console.warn(
      '[plan] ⚠️ The AI could not describe the plan — falling back to built-in ' +
        'descriptions. The plan STRUCTURE (paces, volume, phases) is still fully ' +
        'personalized; only the wording is generic.'
    )
    return { ...mergeDescriptions(skeleton, []), described: false }
  }

  const merged = mergeDescriptions(skeleton, described.weeks, described.intro)
  if (merged.warnings.length) {
    console.warn(
      `[plan] ⚠️ The AI tried to change ${merged.warnings.length} calculated value(s); ` +
        'the calculated plan was kept. Details:'
    )
    for (const w of merged.warnings.slice(0, 10)) console.warn(`  - ${w}`)
  }
  const describedDays = merged.weeks.reduce(
    (n, w) => n + w.days.filter((d) => d.description).length, 0
  )
  if (DEBUG) {
    console.log(
      `[plan] described ${describedDays} day(s) across ${merged.weeks.length} week(s)` +
        `${merged.warnings.length ? `, ${merged.warnings.length} value(s) rejected` : ''}.`
    )
  }
  return { ...merged, described: true }
}

/** @returns {{weeks: Array, intro: string}|null} null if unusable. */
function parseDescribedWeeks(text) {
  try {
    const parsed = JSON.parse(cleanJson(text))
    const weeks = parsed?.weeks
    if (!Array.isArray(weeks) || weeks.length === 0) return null
    // At least one week must carry usable day text, or this was pointless.
    const usable = weeks.some((w) => Array.isArray(w.days) && w.days.some((d) => d?.description))
    return usable ? { weeks, intro: typeof parsed.intro === 'string' ? parsed.intro : '' } : null
  } catch {
    return null
  }
}

/**
 * Tolerant JSON extraction — small open models often wrap JSON in markdown
 * fences or a line of prose; take everything between the first '{' and the
 * last '}'.
 */
function cleanJson(text) {
  const stripped = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('AI response contained no JSON object.')
  return stripped.slice(start, end + 1)
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Normalize one day object, filling in what the model left out rather than
 * rejecting the whole plan over a missing label. Throws only when the day is
 * unusable (not an object, or no title to show).
 *
 * `pace` and `purpose` are required of the model by the prompt; when it still
 * omits them we derive something honest instead of rendering a blank field.
 */
function normalizeDay(day, index, weekNumber) {
  if (!day || typeof day !== 'object') {
    throw new Error(`Plan JSON malformed: week ${weekNumber} day ${index + 1} is not an object.`)
  }
  const type = String(day.type || '').toLowerCase()
  if (!type) {
    throw new Error(`Plan JSON malformed: week ${weekNumber} day ${index + 1} has no "type".`)
  }
  const title = String(day.title || '').trim()
  if (!title) {
    throw new Error(`Plan JSON malformed: week ${weekNumber} day ${index + 1} has no "title".`)
  }
  const isRest = type === 'rest'
  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return {
    ...day,
    day: WEEKDAYS.includes(day.day) ? day.day : WEEKDAYS[index],
    type,
    title,
    description: String(day.description || '').trim(),
    distance_km: num(day.distance_km),
    duration_min: num(day.duration_min),
    pace: String(day.pace || (isRest ? 'rest' : 'easy, conversational effort')).trim(),
    purpose: String(
      day.purpose || (isRest ? 'lets the training adaptation happen' : 'builds aerobic base')
    ).trim(),
  }
}

function normalizeWeek(week, fallbackNumber) {
  const weekNumber = Number(week.week_number) || fallbackNumber
  if (!Array.isArray(week.days) || week.days.length !== 7) {
    throw new Error(
      `Plan JSON malformed: week ${weekNumber} has ${
        Array.isArray(week.days) ? week.days.length : 0
      } days, expected 7.`
    )
  }
  return {
    ...week,
    week_number: weekNumber,
    focus: String(week.focus || '').trim(),
    days: week.days.map((d, i) => normalizeDay(d, i, weekNumber)),
  }
}

function parseWeekJson(text) {
  return normalizeWeek(JSON.parse(cleanJson(text)), 1)
}

