/**
 * ai.js — every call to the AI provider lives here.
 *
 * AI INTEGRATION POINT (central):
 * All of Runko's "coach intelligence" flows through callAi(), which posts to
 * our own Supabase Edge Function (supabase/functions/ai-proxy). The rest of
 * the app never talks to a provider directly — it uses the purpose-built
 * helpers below (askCoach, describePlanSkeleton, adaptWeeklyPlan,
 * coachReaction, motivationalMessage).
 *
 * SECURITY: the browser holds no AI credential. The Groq key is a Supabase
 * secret readable only by the Edge Function, which additionally requires a
 * valid auth JWT and rate-limits per user. Swapping models or providers
 * means touching this file and the function — nothing else.
 */
import { IS_DEV, SUPABASE_URL } from './env'
import { supabase } from './supabase'
import { t } from './strings'
import { withoutBodyTargets, isBodyGoal } from './planning/goals.js'
import {
  COACH_PERSONA,
  buildCoachSystemPrompt,
  buildRunnerContext,
  detectLanguage,
  sanitizeChatReply,
  againstAdviceContext,
  classifyCoachMessage,
  offTopicReply,
} from './coach-prompt'
import { OUTPUT_TOKENS } from './ai-limits'
import { buildKnowledgeBlock, buildScenarioKnowledgeBlock, buildResearchPlanBlock, KNOWLEDGE_BUDGETS } from './knowledge'
import { buildExtractionPrompt, parseExtractedMemories } from './memory'

/**
 * Every AI call goes through our own Edge Function, never to Groq directly.
 *
 * The Groq key used to be VITE_GROQ_API_KEY, which Vite inlines into the
 * browser bundle — readable by anyone with devtools. It now lives as a
 * Supabase secret that only supabase/functions/ai-proxy can read. The proxy
 * also requires a signed-in user and rate-limits per user.
 */
const API_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`
// Groq models, tried in order — a 404 (retired slug) falls through to the next.
// NOTE: llama-3.3-70b-versatile currently 404s on this account's key (Groq has
// retired the slug; it is not in GET /openai/v1/models). It stays first so the
// app picks it up again if it returns; the gpt-oss models below are what
// actually serves requests today.
const MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']

/**
 * Groq's free tier caps tokens-per-minute PER REQUEST, and the figure it
 * checks is prompt + max_tokens together. Asking for a big completion on top
 * of a big prompt returns 413 "Request too large" before any work happens —
 * which is how a 15-week plan silently fell back to generic text.
 *
 * So the output budget is trimmed to fit the ceiling instead of being sent
 * blind. Raise this if the account moves off the free tier.
 */
const TPM_LIMIT = 8000
const TPM_SAFETY_MARGIN = 400

/** ~4 characters per token, matching core/knowledge.js. */
const estimateTokens = (text) => Math.ceil((text || '').length / 4)

const FRIENDLY_QUOTA = t.errors.aiQuota
const FRIENDLY_GENERIC = t.errors.aiGeneric

/** Proxy refusals no retry can change; their message is shown as-is. */
const FINAL_CODES = new Set(['rate_limited', 'not_premium', 'chat_limit', 'daily_limit', 'plan_build_required', 'bad_kind'])

/** Human-readable message for any error thrown from this module. */
export function friendlyAiMessage(err) {
  return err?.friendly || FRIENDLY_GENERIC
}

// COACH_PERSONA now lives in ./coach-prompt.js (imported above) so that the
// personality, the reply rules and the context builder sit together.

/**
 * Every prompt that produces text a RUNNER reads must pin the language.
 * Instructions stay English (models follow them best that way); only the
 * output is Slovenian. Missing this is why the post-run reaction came back
 * as "Nice work, 11km at about 6:45/km".
 *
 * askCoach is the deliberate exception — it mirrors whatever the runner
 * wrote, so it must not be forced.
 */
const IN_SLOVENIAN =
  '\n\nWrite your output in SLOVENIAN — natural, idiomatic Slovenian, not a' +
  ' translation of English phrasing. Never reply in English.'

const DEBUG = IS_DEV
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (DEBUG) {
  console.log('[ai] proxying AI calls through', API_URL)
}

/**
 * The caller's Supabase access token. The proxy rejects anything without a
 * valid one, so there is no anonymous path to the AI.
 */
async function authToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
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
async function callAi({ system, messages, json = false, maxTokens = OUTPUT_TOKENS.chat, kind = null, extra = null }) {
  const token = await authToken()
  if (!token) {
    const err = new Error('No Supabase session — the AI proxy requires a signed-in user.')
    err.friendly = t.errors.aiSignedOut
    throw err
  }

  const apiMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // Trim the completion budget so prompt + output stays inside the per-request
  // ceiling. Without this the call is rejected outright rather than truncated.
  const promptTokens = apiMessages.reduce((n, m) => n + estimateTokens(m.content), 0)
  const headroom = TPM_LIMIT - promptTokens - TPM_SAFETY_MARGIN
  if (headroom < maxTokens) {
    if (DEBUG) {
      console.log(
        `[ai] prompt ~${promptTokens} tokens; trimming max_tokens ${maxTokens} → ` +
          `${Math.max(512, headroom)} to stay under the ${TPM_LIMIT} TPM ceiling.`
      )
    }
    maxTokens = Math.max(512, headroom)
  }

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
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...body, kind, ...(extra || {}) }),
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
      const code = data?.error?.code

      // A refusal aimed at the CALLER is final — another model or a smaller
      // budget cannot help.
      //
      // A 401 arrives in one of two shapes. Our proxy answers
      // { error: { code: 'unauthenticated' } } with a message written for a
      // runner. But Supabase's own gateway rejects an expired or malformed
      // JWT *before* the function runs, and answers in its own shape —
      // { code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: '...' } — with an
      // English message meant for developers. Keying only on our code meant
      // an expired session showed "could not reach the coach", sending the
      // runner to check their connection when the fix is to sign in again.
      // 402 not_premium is equally final: the trial has ended, and no model
      // or budget changes that. Its message is the paywall's, written for a
      // runner, so it is shown as-is.
      // The daily limits (chat_limit, daily_limit) and a plan described
      // without a reserved build are just as final, and their messages are
      // written for the runner too.
      const unauthenticated = status === 401 || code === 'unauthenticated'
      if (unauthenticated || FINAL_CODES.has(code)) {
        const stop = new Error(`ai-proxy ${code || status}: ${detail}`)
        stop.code = code || null
        stop.friendly = unauthenticated
          ? // only our own message is fit to show; the gateway's is not
            (code === 'unauthenticated' && detail) || t.errors.aiSignedOut
          : detail || (code === 'not_premium' ? t.errors.aiNotPremium : FRIENDLY_QUOTA)
        throw stop
      }

      lastErr = new Error(`AI error ${status} (${model}): ${detail}`)
      lastErr.friendly = status === 429 ? FRIENDLY_QUOTA : FRIENDLY_GENERIC

      // 413 = prompt + max_tokens over the per-request ceiling; 400 can also
      // be an output-budget rejection. Halve and retry before giving up.
      if ((status === 400 || status === 413) && budget > 1024) {
        budget = Math.max(1024, Math.floor(budget / 2))
        if (DEBUG) console.log(`[ai] ${status} — retrying ${model} with max_tokens ${budget}`)
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
      if (status === 404 || status === 413 || status === 429 || status >= 500) break // next model
      throw lastErr // other 4xx (bad key, malformed request) won't improve
    }
  }
  throw lastErr
}

/** Builds the context block the coach sees before every conversation. */
export function buildCoachContext(profile, plan, workouts = [], { totalWeeks } = {}) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
  const goalPlan = plan?.plan_json?.goal_plan
  if (goalPlan) lines.push(...goalContextLines(goalPlan))
  const planning = plan?.plan_json?.planning
  if (planning?.explain) {
    lines.push(
      `- Plan type: ${planning.explain.scenario} (goal verdict: ${planning.explain.verdict}` +
        `${planning.explain.adopted_goal_text ? `, built for ${planning.explain.adopted_goal_text}` : ''})`
    )
    if (planning.against_advice) {
      lines.push(againstAdviceContext(planning))
    } else if (planning.explain.verdict === 'unsafe' && planning.explain.original_goal_text) {
      lines.push(`- Their original goal (${planning.explain.original_goal_text}) was judged unsafe in the time available.`)
    }
  }
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
          `- ${d.day}: ${d.title}` +
          (d.time_based
            ? `${d.duration_min ? ` (${d.duration_min} min${d.segments?.[1]?.text ? `: ${d.segments[1].text}` : ''})` : ''}`
            : `${d.distance_km ? ` (${d.distance_km} km)` : ''}${d.pace ? ` at ${d.pace}` : ''}`) +
          `${d.purpose ? ` — ${d.purpose}` : ''}`
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

  // The coach is a running coach, not a general assistant. A message that is
  // plainly about something else gets the one-line redirect here, with no
  // model call: nothing to pay for, and nothing a clever prompt can bend.
  // Everything less clear-cut goes to the model, whose prompt carries the
  // same scope rules (coach-prompt.js).
  if (classifyCoachMessage(lastUser) === 'out') {
    return offTopicReply({ hasPlan: plans.length > 0 })
  }

  const system = buildCoachSystemPrompt({
    message: lastUser,
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
    maxTokens: OUTPUT_TOKENS.chat,
    kind: 'chat',
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
  // An off-topic message was answered with the fixed redirect: there is
  // nothing about the runner's training in it to remember, so no call.
  if (classifyCoachMessage(userMessage) === 'out') return []
  try {
    const text = await callAi({
      system:
        'You extract durable, training-relevant facts about a runner for a coaching' +
        ' assistant. You are conservative: most exchanges yield nothing. You output JSON only.' +
        IN_SLOVENIAN,
      messages: [
        { role: 'user', content: buildExtractionPrompt({ userMessage, coachReply, existing }) },
      ],
      json: true,
      maxTokens: OUTPUT_TOKENS.memory,
      kind: 'memory',
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
    system:
      'You are an expert running coach who adapts training plans based on athlete feedback.' +
      IN_SLOVENIAN,
    messages: [
      {
        role: 'user',
        content: `${buildCoachContext(profile, null, recentWorkouts)}

${triggerText}
${
  basePlan
    ? `The originally planned week ${weekNumber} was:\n${JSON.stringify(compactWeek(basePlan))}\nAdjust it as needed while keeping its overall intent.\n${weekRulesText(basePlan)}${basePlan.planning?.against_advice ? `\n${againstAdviceContext(basePlan.planning)}` : ''}`
    : `Write week ${weekNumber} of the plan.`
}
${WEEK_SCHEMA_PROMPT}`,
      },
    ],
    json: true,
    maxTokens: OUTPUT_TOKENS.adapt,
    kind: 'adapt',
  })
  return parseWeekJson(text)
}

/** A stored week without the plan-wide records the AI does not need. */
function compactWeek(week) {
  const { planning, paces, goal_assessment, intro, ...rest } = week || {}
  return {
    ...rest,
    days: (rest.days || []).map(({ segments, hr, duration_range, walk_run, ...d }) => d),
  }
}

/**
 * What each goal means for the words the model writes. The structure of a
 * goal block is calculated; these lines only keep the prose true to it.
 */
const GOAL_RULES = {
  kondicija: 'The long run is the key session; talk about running longer without stopping.',
  hitrost: 'The block starts and ends with a 5 km time trial; talk about getting faster over 5 km.',
  zdravje: 'Health and wellbeing: easy running in zones 1-2, consistency over speed.',
  navada: 'Habit: the fewest sessions that still progress. A missed session is never a failure and never changes the plan; never guilt, never "catch up".',
  glava: 'Mental wellbeing and less stress: easy, conversational running; how the runner feels after the run matters most.',
  teza: 'Fitness and volume of easy running. NEVER mention weight, kilograms, calories, dieting, fat burning, body size or a target of any of these, not even positively; talk about energy, stamina and consistency.',
  baza: 'Building an aerobic base for a race later: steady, easy volume, ending ready to start a race plan.',
}

/** Goal lines for the runner-context block of any prompt. */
function goalContextLines(goalPlan) {
  const lines = [`- No race: the goal is "${goalPlan.main}" (${GOAL_RULES[goalPlan.main]})`]
  if (goalPlan.secondary) lines.push(`- Secondary goal (the main goal wins conflicts): "${goalPlan.secondary}".`)
  if (isBodyGoal(goalPlan)) lines.push('- Never mention weight, calories or dieting.')
  return lines
}

/** Goal rules for a week the AI may rewrite. */
function goalRuleLines(goalPlan) {
  return [
    `- The goal is "${goalPlan.main}": ${GOAL_RULES[goalPlan.main]}`,
    ...(isBodyGoal(goalPlan) ? ['- Never mention weight, calories or dieting.'] : []),
    ...(goalPlan.main === 'navada' ? ['- Never make the week harder or easier because of missed sessions.'] : []),
  ]
}

/** The scenario's rules for this week, in words the model will follow. */
function weekRulesText(week) {
  const rules = ['RULES YOU MUST KEEP (the app enforces them and discards anything else):']
  if (week?.scenario) rules.push(`- This is a "${week.scenario}" plan.`)
  if (week?.goal_plan) rules.push(...goalRuleLines(week.goal_plan))
  if (week?.allow_hard === false) rules.push('- NO tempo, interval or repetition sessions this week. Easy running only.')
  rules.push('- Runs only on the days that already have a run; rest days stay rest days.')
  rules.push('- Never more total distance than the original week, never a run longer than its longest run.')
  return rules.join('\n')
}

/**
 * AI INTEGRATION POINT — Post-log reaction.
 * Short, personal one-liner shown right after the user logs a run.
 */
export async function coachReaction(profile, plan, workout) {
  return callAi({
    system: COACH_PERSONA + IN_SLOVENIAN,
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
    maxTokens: OUTPUT_TOKENS.reaction,
    kind: 'reaction',
  })
}

/**
 * AI INTEGRATION POINT — Dashboard motivational message.
 * Cached per-day in sessionStorage by the caller to avoid burning quota.
 */
export async function motivationalMessage(profile, plan, workouts) {
  return callAi({
    system: COACH_PERSONA + IN_SLOVENIAN,
    messages: [
      {
        role: 'user',
        content: `${buildCoachContext(profile, plan, workouts)}

Write ONE short motivational message (max 25 words) for my dashboard today. Personal, warm, no hashtags, no quotes around it.`,
      },
    ],
    maxTokens: OUTPUT_TOKENS.motd,
    kind: 'motd',
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

/**
 * COST CONTROL: text is generated per distinct workout SHAPE, not per day.
 *
 * A 16-week plan has ~112 days but only a dozen or so genuinely different
 * sessions — a build-phase tempo, a recovery-week easy run, a sharpen-phase
 * interval session, and so on. Writing prose for each day would mean ~450
 * strings in one response, which neither fits the output budget nor says
 * anything new on day 80 that it did not say on day 12.
 *
 * So one short set of text per shape, generated in a SINGLE call at plan
 * creation and stored on every matching day. The distances, paces, segments
 * and heart rates that make each day specific already come from the
 * skeleton and are rendered from data — the prose only has to explain the
 * kind of session and why it belongs in this phase.
 */
export function shapeKey(day, week) {
  // Deliberately NOT keyed on is_recovery: a recovery-week easy run is the
  // same session as any other easy run, and asking for separate prose for
  // each doubled the output for no new information. The week's own note
  // says it is a recovery week, and mergeDescriptions adds a line to "why".
  return `${day.type}|${week.phase}`
}

/** The distinct shapes in a plan, each with one representative example. */
export function planShapes(skeleton) {
  const shapes = new Map()
  for (const week of skeleton.weeks) {
    for (const day of week.days) {
      // Rest days need no AI text — the built-in line says all there is to
      // say, and asking for one per phase wasted a quarter of the response.
      if (day.type === 'rest') continue
      const key = shapeKey(day, week)
      if (shapes.has(key)) {
        const s = shapes.get(key)
        s.occurrences++
        s.min_km = Math.min(s.min_km, day.distance_km)
        s.max_km = Math.max(s.max_km, day.distance_km)
        continue
      }
      shapes.set(key, {
        key,
        type: day.type,
        phase: week.phase,
        is_recovery: week.is_recovery,
        occurrences: 1,
        min_km: day.distance_km,
        max_km: day.distance_km,
        first_week: week.week_number,
        // One compact line, not nested JSON — this block is repeated for
        // every shape and was the bulk of the prompt.
        example: (day.segments || []).length
          ? day.segments
              .map((g) => `${g.label} ${g.text || (g.reps ? g.reps.summary : `${g.distance_km}km @ ${g.pace}`)}`)
              .join(' | ')
          : day.time_based
            ? `${day.duration_min} min`
            : `${day.distance_km}km @ ${day.pace}`,
      })
    }
  }
  return [...shapes.values()]
}

/** Compact view of the skeleton for the prompt — weeks without the prose. */
function skeletonForPrompt(skeleton) {
  return skeleton.weeks.map((w) => ({
    week: w.week_number,
    phase: w.phase,
    recovery: w.is_recovery,
    ...(w.unit === 'time' ? { minutes: w.target_minutes } : { volume_km: w.target_volume_km }),
    // Deliberately NOT the per-day detail: the model only writes a one-line
    // note per week, and the sessions are described once per shape below.
    sessions: [...new Set(w.days.filter((d) => d.type !== 'rest').map((d) => d.type))].join('+'),
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
 * @param {object} skeleton
 * @param {object} ai - { weeks?, workouts?, intro? } as returned by the model
 * @returns {{weeks: Array, warnings: string[], intro: string}}
 */
export function mergeDescriptions(skeleton, ai = {}) {
  const warnings = []
  // A body-composition goal never reads a weight or a calorie, whatever the model wrote.
  const clean = isBodyGoal(skeleton.goal_plan)
    ? (text, max) => withoutBodyTargets(cleanText(text, max))
    : cleanText
  const aiWeeks = Array.isArray(ai?.weeks) ? ai.weeks : []
  const aiWorkouts = Array.isArray(ai?.workouts) ? ai.workouts : []

  const byWeek = new Map(aiWeeks.map((w) => [Number(w.week_number), w]))
  const byShape = new Map(aiWorkouts.filter((w) => w?.key).map((w) => [String(w.key), w]))

  const weeks = skeleton.weeks.map((week) => {
    const aiWeek = byWeek.get(week.week_number)

    const days = week.days.map((day) => {
      const shape = byShape.get(shapeKey(day, week))

      // Numbers are the skeleton's business. Check, warn, discard.
      if (shape?.distance_km !== undefined && shape?.distance_km !== null) {
        const proposed = Number(shape.distance_km)
        const allowed = Math.max(DISTANCE_TOLERANCE_KM, day.distance_km * DISTANCE_TOLERANCE_PCT)
        if (Number.isFinite(proposed) && Math.abs(proposed - day.distance_km) > allowed) {
          warnings.push(
            `week ${week.week_number} ${day.day}: AI proposed ${proposed} km, ` +
              `keeping the calculated ${day.distance_km} km`
          )
        }
      }
      if (shape?.pace && String(shape.pace).trim() !== day.pace) {
        warnings.push(
          `week ${week.week_number} ${day.day}: AI proposed pace "${shape.pace}", ` +
            `keeping the calculated "${day.pace}"`
        )
      }

      // The race-day guidance of a plan built against advice is the app's
      // own, never the model's: run-walk and a conservative pace.
      if (day.type === 'race' && day.against_advice) {
        return { ...day, purpose: defaultPurpose(day), how: defaultHow(day), why: defaultWhy(day, week) }
      }

      return {
        ...day, // calculated values always win
        title: clean(shape?.title, 40) || day.title,
        purpose: clean(shape?.purpose, 90) || defaultPurpose(day),
        // "Kako izvesti" and "Zakaj ta trening" on the card.
        how: clean(shape?.how, 300) || defaultHow(day),
        why: withRecoveryNote(clean(shape?.why, 300) || defaultWhy(day, week), week),
      }
    })

    return {
      ...week,
      focus: clean(aiWeek?.note, 200) || defaultWeekFocus(week),
      days,
    }
  })

  return { weeks, warnings, intro: clean(ai?.intro, 600) || defaultIntro(skeleton) }
}

/** Recovery weeks get one standard extra line, rather than their own prose. */
function withRecoveryNote(why, week) {
  if (!week?.is_recovery) return why
  const note = 'Ta teden je namenoma lažji, da telo absorbira prejšnje tri.'
  return why.includes('lažji') ? why : `${why} ${note}`
}

function cleanText(s, max = 300) {
  if (typeof s !== 'string') return ''
  // Strip any markdown the model reached for; these render as plain text.
  return s.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

// ---------------------------------------------------------------------------
// Fallbacks — a complete, readable plan even with no AI at all
// ---------------------------------------------------------------------------

const TYPE_SL = {
  easy: 'lahkoten tek',
  long: 'dolgi tek',
  tempo: 'tempo tek',
  interval: 'intervali',
  repetition: 'ponovitve',
  cross: 'nadomestna vadba',
  race: 'tekma',
  rest: 'počitek',
  walk_run: 'hoja-tek',
  walk: 'hitra hoja',
  time_trial: 'preizkus na 5 km',
}

function defaultHow(day) {
  if (day.type === 'rest') return 'Počitek. Danes brez teka — telo dela svoje.'
  if (day.type === 'race' && day.against_advice) {
    return 'Od prvega kilometra izmenjuj tek in hojo, na primer 4 minute teka in 1 minuto hoje, in ostani v pogovornem tempu. ' +
      'Na čas se ne oziraj. Če se pojavi bolečina, ki se stopnjuje, odstopi.'
  }
  if (day.type === 'race' && day.walk_breaks) {
    return 'Začni počasneje, kot se ti zdi potrebno, in hodi, kadar zmanjka sape. Hoja je del načrta, ne poraz.'
  }
  if (day.time_based && day.segments?.length) {
    return `${day.segments.map((g) => `${g.label.toLowerCase()}: ${g.text}`).join('; ')}. Tempo naj bo tak, da lahko govoriš v celih stavkih.`
  }
  if (day.type === 'time_trial') {
    return 'Ogrej se z lahkotnim tekom, nato preteci 5 km enakomerno in čim hitreje: prvi kilometer ne prehitro. Čas vpiši po teku.'
  }
  if (day.variant === 'strides') {
    return 'Lahkoten tek, na koncu 4-6 kratkih pospeškov po 20 sekund, vmes hoja ali počasen tek.'
  }
  if (!day.segments?.length) {
    return `Preteci ${day.distance_km} km pri ${day.pace}. Tempo naj bo enakomeren od začetka do konca.`
  }
  const parts = day.segments.map((g) =>
    g.reps
      ? `${g.label.toLowerCase()}: ${g.reps.summary}`
      : `${g.label.toLowerCase()}: ${g.distance_km} km pri ${g.pace}`
  )
  return `${parts.join('; ')}.`
}

function defaultWhy(day, week) {
  if (day.type === 'race' && day.against_advice) {
    return 'Priprava je bila krajša, kot bi bilo varno za tek v celoti. Izmenjava teka in hoje ter zadržan tempo sta način, da prideš do cilja brez poškodbe.'
  }
  const base = {
    rest: 'Počitek je del treninga — takrat se telo dejansko prilagodi.',
    easy: 'Lahkotni kilometri gradijo aerobno osnovo brez utrujenosti.',
    long: 'Dolgi tek širi vzdržljivost in te pripravlja na ciljno razdaljo.',
    tempo: 'Tempo dviguje laktatni prag, da hitrejši tempo postane vzdržen.',
    interval: 'Intervali dvigujejo VO2 max in tekaško ekonomičnost.',
    repetition: 'Kratke ponovitve izboljšajo hitrost in tehniko teka.',
    race: 'Dan tekme — vse od tu naprej je izvedba.',
    time_trial: 'Preizkus pokaže, kje si danes; ponovljen ob koncu bloka pokaže, koliko si napredoval/a.',
    walk: 'Hitra hoja v pogovornem tempu gradi aerobno osnovo in pripravi kite ter sklepe na obremenitev.',
    walk_run: 'Izmenjava hoje in teka nauči telo teka, ne da bi ga preobremenila — kite in kosti se prilagajajo počasneje kot pljuča.',
  }[day.type] || 'Gradi splošno tekaško pripravljenost.'
  return base
}

function defaultPurpose(day) {
  return {
    rest: 'telo se prilagodi na trening',
    easy: 'gradi aerobno osnovo',
    long: 'razširi vzdržljivost',
    tempo: 'dviguje laktatni prag',
    interval: 'izboljša VO2 max',
    repetition: 'izboljša hitrost',
    race: 'ciljna tekma',
    time_trial: 'izmeri, kje si',
    cross: 'ohranja kondicijo brez obremenitve nog',
    walk: 'gradi aerobno osnovo brez udarne obremenitve',
    walk_run: 'postopno navajanje na tek',
  }[day.type] || 'gradi aerobno osnovo'
}

function defaultWeekFocus(week) {
  const amount = week.unit === 'time' ? `${week.target_minutes} min` : `${week.target_volume_km} km`
  if (week.is_recovery) return `Regeneracijski teden — ${amount}, brez trdih treningov.`
  const phase = t.plan.phases[week.phase] || 'Trening'
  return `${phase} — ${amount}.`
}

/** A usable intro when the AI gives none — states the goal and the shape. */
function defaultIntro(skeleton) {
  // Pipeline plans carry their own explanation: scenario, verdict, priorities.
  if (skeleton.explain?.intro) return skeleton.explain.intro
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

// ---------------------------------------------------------------------------
// The single AI call
// ---------------------------------------------------------------------------

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

/**
 * What the planning pipeline decided and why — scenario, verdict, priorities,
 * and for an unsafe goal what was built instead. The AI explains this; it
 * never decides it.
 */
function planTypeBlock(skeleton) {
  const e = skeleton.explain
  if (!e) return ''
  const lines = ['PLAN TYPE (decided by the app — explain it, do not second-guess it)']
  if (skeleton.goal_plan) {
    lines.push(`- This runner has NO race. ${GOAL_RULES[skeleton.goal_plan.main]}`)
    if (skeleton.goal_plan.secondary) lines.push(`- Secondary goal (the main goal wins conflicts): ${skeleton.goal_plan.secondary}.`)
    for (const a of e.goal_plan?.adjustments || []) lines.push(`- Say this plainly, kindly: ${a}`)
    if (isBodyGoal(skeleton.goal_plan)) lines.push('- NEVER mention weight, kilograms, calories, dieting or body size anywhere in your output.')
  }
  lines.push(`- Scenario: ${e.scenario} ("${e.scenario_label}")`)
  lines.push(`- Verdict on their goal: ${e.verdict} ("${e.verdict_label}")`)
  if (skeleton.against_advice) {
    const a = skeleton.against_advice
    lines.push(`- Their goal: ${e.original_goal_text} — NOT safe in the time available.`)
    lines.push('- The runner was told so, was shown safer alternatives, and chose to train for it anyway (one explicit confirmation).')
    lines.push('- The plan does NOT squeeze the progression: every safe limit holds, easy running only. It is the best safe preparation in the time there is, not full readiness.')
    if (a.long_run_short) {
      lines.push(`- The longest training run reaches about ${a.longest_run_km} km of the ${a.race_km} km race: not enough to count on running all of it.`)
    }
    if (a.has_race) lines.push('- Race day: run-walk from the first kilometre, conversational pace, no time goal.')
  } else if (e.verdict === 'unsafe' && e.original_goal_text) {
    lines.push(`- Their original goal: ${e.original_goal_text} — NOT safe in the time available.`)
    lines.push(`- The plan is built for the closest safe goal instead: ${e.adopted_goal_text}.`)
    if (e.other_options?.length) lines.push(`- Another safe option they could choose: ${e.other_options[0]}.`)
  } else if (e.verdict === 'stretch' && e.fallback_text) {
    lines.push(`- Fallback target if it gets too hard: ${e.fallback_text}.`)
  }
  lines.push(`- What the plan prioritises: ${e.priorities.join('; ')}`)
  lines.push(`- Why (for you, do not quote): ${e.reasons.join(' ')}`)
  return lines.join('\n') + '\n'
}

/** The verdict-specific instruction for the intro. */
function introVerdictRule(skeleton) {
  const v = skeleton.explain?.verdict
  if (skeleton.against_advice) {
    return ' The runner chose this goal against your advice. Be honest and calm:' +
      ' this plan is the best safe preparation in the time they have, and it' +
      ' does not make them fully ready. Say what it focuses on. Do not repeat' +
      ' the warning at length (the app adds its own sentences after yours), do' +
      ' not cheer the decision, and do not shame it.'
  }
  if (v === 'unsafe') {
    return ' The original goal is unsafe: say so plainly and kindly — the body' +
      ' (tendons, bones) needs more time than the date allows — name the goal' +
      ' the plan is built for instead, and mention the other option. Never' +
      ' shame them for the goal; it is a good goal, just not on this timeline.'
  }
  if (v === 'stretch') {
    return ' The goal is a stretch: be clear it is achievable but tight, and' +
      ' name the fallback target so falling short of the stretch still feels like success.'
  }
  return ''
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

/**
 * AI INTEGRATION POINT — describe a calculated plan skeleton.
 *
 * ONE call per plan, ever. It writes only prose: a plan intro, a note per
 * week, and a title / purpose / how / why per distinct workout shape. It
 * never decides distances, paces, heart rates or which day a session lands
 * on — all of that is calculated and already stored.
 *
 * Rendering a workout card calls nothing.
 *
 * Retries once on malformed JSON; if it still fails, the caller gets the
 * skeleton with the built-in Slovenian fallbacks, which is a complete and
 * correct plan — just less personal.
 *
 * @returns {Promise<{weeks: Array, warnings: string[], intro: string, described: boolean}>}
 */
export async function describePlanSkeleton(skeleton, { profile = {}, memories = [], language = 'sl', buildId = null } = {}) {
  const constraints = skeleton.constraints || {}
  const languageName = language === 'sl' ? 'Slovenian' : 'English'
  const shapes = planShapes(skeleton)

  // Only the guidance for THIS runner's scenario — one file's section, not
  // the whole library — keeps the single call cheap.
  // Plus the research summary behind that scenario and at most two population
  // notes (age and schedule only). Still text in the same single request.
  const knowledge = skeleton.scenario
    ? [
        buildScenarioKnowledgeBlock(skeleton.scenario, { budgetTokens: KNOWLEDGE_BUDGETS.plan_generation }),
        buildResearchPlanBlock({ scenario: skeleton.scenario, populations: skeleton.populations || [] }),
      ].filter(Boolean).join('\n\n')
    : buildKnowledgeBlock({ situations: ['plan_generation'], budgetTokens: KNOWLEDGE_BUDGETS.plan_generation })

  const prompt = `You are writing the words for a training plan that has ALREADY been calculated.

${planTypeBlock(skeleton)}
THE RUNNER
- Name: ${profile.name || 'the runner'}
- Level: ${profile.fitness_level || 'beginner'}
- Goal: ${goalLine(skeleton)}
- Estimated VDOT: ${skeleton.vdot} (${skeleton.vdot_source === 'runs' ? 'from their logged runs' : 'estimated from their self-assessed level'})
- Training paces per km: ${Object.entries(skeleton.paces).map(([k, v]) => `${k} ${v.label}`).join(', ')}
${skeleton.hr_max ? `- Max HR ${skeleton.hr_max} bpm (Tanaka, from age ${profile.age}); zones are already calculated per workout.` : '- No age given, so no heart-rate targets.'}

WHAT YOU KNOW ABOUT THEM
${constraints.notes?.length ? constraints.notes.map((n) => `- ${n}`).join('\n') : '- Nothing yet.'}
${constraints.noBackToBack ? '- The schedule ALREADY avoids back-to-back running days for them.' : ''}
${constraints.timeOfDay ? `- They run in the ${constraints.timeOfDay}.` : ''}

${goalAssessmentBlock(skeleton)}
THE PLAN, WEEK BY WEEK
${JSON.stringify(skeletonForPrompt(skeleton))}

THE DISTINCT SESSION TYPES IN IT
${shapes.map((s) => `${s.key}  (${s.min_km}-${s.max_km} km, e.g. ${s.example})`).join('\n')}

YOUR JOB — three things, all in ${languageName}.

1. "intro": 3-4 sentences opening the plan. It MUST say, in plain words: what
   kind of plan this is (the plan type above), the verdict on their goal, and
   what the plan prioritises.${introVerdictRule(skeleton)}${skeleton.goal_assessment?.message ? ' Also address the goal-time note above honestly, in one sentence, without discouraging them.' : ''}

2. "weeks": one short "note" per week (one sentence, what that week is for).

3. "workouts": EXACTLY ${shapes.length} entries, one for each key in the
   session-type list above. Copy each "key" verbatim. Do not skip any.
   - "title": 1-3 words naming the session.
   - "purpose": one short phrase (max 8 words).
   - "how": how to run it. MAX 2 short sentences, under 200 characters. For
     segmented sessions walk through warm-up, main part, cool-down. Speak to
     the runner directly.
   - "why": what it develops and how it serves this phase and the goal. MAX 2
     short sentences, under 200 characters.

RULES
- Coach Runko's voice: warm, direct, concrete, never preachy. Natural
  idiomatic ${languageName}, not a translation. No English terms or
  jargon (not "walk-run", "ladder", "taper", "tempo run" in English) —
  use the ${languageName} words (e.g. hoja-tek, razbremenitev).
- DO NOT restate the numbers. The card already shows distance, time, pace and
  heart rate next to your text. Explain the session, do not recite it.
- DO NOT change any distance, pace, day or workout type.${skeleton.unit === 'time' ? `
- This plan is prescribed in MINUTES (walk-run, then continuous running).
  Talk about time and effort ("able to talk in full sentences"), never about
  kilometres or pace per km. Walking is part of the plan, not a failure.` : ''}${skeleton.unit === 'mixed' ? `
- This plan starts in MINUTES (walk-run, then continuous running) and switches
  to KILOMETRES once the runner can run about 30 minutes non-stop. For weeks
  given in minutes, talk about time and effort, never kilometres or pace;
  walking is part of the plan, not a failure. The switch is a milestone.` : ''}
- Keep it SHORT — this is a strict budget, not a style note. The card already
  shows every number; your text only adds the reasoning.
- No markdown, no bullets, no headings inside these strings.
${knowledge ? `\n${knowledge}\n` : ''}
Respond with JSON only:
{"intro":"...","weeks":[{"week_number":1,"note":"..."}],"workouts":[{"key":"<exact key>","title":"...","purpose":"...","how":"...","why":"..."}]}
Include all ${skeleton.total_weeks} weeks and all ${shapes.length} session keys.`

  const system =
    'You write training-plan copy for a running coach app. You never alter the' +
    ' numbers you are given — you only explain them. You output JSON only.'

  let text
  try {
    text = await callAi({
      system,
      messages: [{ role: 'user', content: prompt }],
      json: true,
      maxTokens: OUTPUT_TOKENS.plan,
      kind: 'plan',
      extra: { build_id: buildId },
    })
  } catch (err) {
    if (DEBUG) console.warn('[plan] description call failed:', err.message)
    return { ...mergeDescriptions(skeleton, {}), described: false }
  }

  let described = parseDescribed(text)
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
Output a single JSON object with exactly the keys "intro", "weeks" and
"workouts". Every "workouts" entry needs "key" (copied exactly from the list),
"title", "purpose", "how" and "why". No other keys, no prose, no fences.`,
          },
        ],
        json: true,
        maxTokens: OUTPUT_TOKENS.plan_retry,
        kind: 'plan',
        extra: { build_id: buildId },
      })
      described = parseDescribed(retry)
    } catch (err) {
      if (DEBUG) console.warn('[plan] stricter retry also failed:', err.message)
    }
  }

  if (!described) {
    console.warn(
      '[plan] ⚠️ The AI could not describe the plan — falling back to built-in ' +
        'descriptions. The plan STRUCTURE (paces, volume, phases, heart rates) is ' +
        'still fully personalized; only the wording is generic.'
    )
    return { ...mergeDescriptions(skeleton, {}), described: false }
  }

  const merged = mergeDescriptions(skeleton, described)
  if (merged.warnings.length) {
    console.warn(
      `[plan] ⚠️ The AI tried to change ${merged.warnings.length} calculated value(s); ` +
        'the calculated plan was kept. Details:'
    )
    for (const w of merged.warnings.slice(0, 10)) console.warn(`  - ${w}`)
  }
  if (DEBUG) {
    const covered = described.workouts?.length ?? 0
    console.log(
      `[plan] one AI call described ${covered}/${shapes.length} session types ` +
        `across ${merged.weeks.length} weeks` +
        `${merged.warnings.length ? `, ${merged.warnings.length} value(s) rejected` : ''}.`
    )
  }
  return { ...merged, described: true }
}

/** @returns {{weeks, workouts, intro}|null} null if the response is unusable. */
function parseDescribed(text) {
  try {
    const parsed = JSON.parse(cleanJson(text))
    const workouts = Array.isArray(parsed?.workouts) ? parsed.workouts : []
    // At least one session must carry usable text, or this was pointless.
    if (!workouts.some((w) => w?.key && (w.how || w.why))) return null
    return {
      intro: typeof parsed.intro === 'string' ? parsed.intro : '',
      weeks: Array.isArray(parsed.weeks) ? parsed.weeks : [],
      workouts,
    }
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

