/**
 * Adapters that run a persona through a plan engine and return one common
 * result shape, so the same properties can judge the old engine and the new
 * one. Select with PLAN_ENGINE=legacy; the default is the planning pipeline.
 */
import { TODAY } from './personas.mjs'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function mondayOf(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}

/** The engine that shipped before the pipeline: one skeleton for everyone. */
async function legacy(persona) {
  const { buildPlanSkeleton } = await import('../../src/core/periodization.js')
  const profile = persona.profile
  // Mirrors plan.js totalWeeksFor(), which cannot be imported under plain
  // node because plan.js pulls in the Vite-only env module.
  let totalWeeks = 12
  if (profile.event_date) {
    const start = new Date(mondayOf(TODAY) + 'T00:00:00')
    const weeks = Math.ceil((new Date(profile.event_date) - start + 1) / (7 * 86_400_000))
    totalWeeks = Math.min(Math.max(weeks, 1), 16)
  }
  const skeleton = buildPlanSkeleton({
    profile, totalWeeks, runs: persona.runs || [], memories: persona.memories || [], today: TODAY,
  })
  return {
    status: 'ready',
    questions: [],
    scenario: null,
    verdict: null,
    unit: 'distance',
    goal: { distance_km: profile.target_distance_km ?? null, event_date: profile.event_date ?? null },
    proposal: null,
    fallbackTarget: null,
    startDate: mondayOf(TODAY),
    weeks: skeleton.weeks,
    stored: skeleton.weeks[0],
  }
}

/** The planning pipeline (src/core/planning). */
async function pipeline(persona, { withAnswers = true } = {}) {
  const { runPlanningPipeline } = await import('../../src/core/planning/index.js')
  const result = runPlanningPipeline({
    profile: persona.profile,
    runs: persona.runs || [],
    memories: persona.memories || [],
    answers: withAnswers ? persona.answers || {} : {},
    today: TODAY,
  })
  return {
    ...result,
    stored: result.weeks?.[0],
  }
}

export const ENGINE = process.env.PLAN_ENGINE === 'legacy' ? 'legacy' : 'pipeline'

export async function planFor(persona, opts) {
  return ENGINE === 'legacy' ? legacy(persona) : pipeline(persona, opts)
}
