/**
 * Research summaries (knowledge/research): the 35 runtime summaries of the
 * runko-research files. Size, frontmatter, which ones the plan call and the
 * chat load, and that the plan call stays ONE AI request.
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseResearchDoc, selectPlanResearch, selectChatResearch, detectPopulations, planPopulations,
  RESEARCH_SUMMARY_MAX_TOKENS, RESEARCH_BUDGETS, POPULATION_ORDER, PLAN_POPULATIONS, MAX_POPULATION_NOTES, MAX_CHAT_NOTES,
} from '../src/core/research-select.js'
import { SITUATIONS, detectSituations } from '../src/core/situations.js'
import { SCENARIOS } from '../src/core/planning/rules.js'
import { check, summary } from './harness.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'knowledge', 'research')

console.log('\n=== RESEARCH SUMMARIES ===')

const SOURCES = [
  'b01-runner-assessment', 'b02-methodology-selection', 'b03-periodization-phases',
  'b04-weekly-volume-progression', 'b05-weekly-structure-workout-placement', 'b06-recovery-weeks-taper',
  'b07-adaptation-missed-sessions-fatigue', 'b08-intensity-prescription',
  'm01-jack-daniels', 'm02-pfitzinger', 'm03-hansons', 'm04-arthur-lydiard', 'm05-norwegian-double-threshold',
  'm06-fitzgerald-8020', 'm07-hal-higdon', 'm08-galloway-run-walk', 'm09-couch-to-5k', 'm10-renato-canova',
  'm11-polarized-vs-pyramidal',
  'p01-complete-beginners', 'p02-women-menstrual-cycle', 'p03-pregnancy-postpartum', 'p04-masters-runners',
  'p05-overweight-runners', 'p06-return-from-injury', 'p07-time-crunched-runners', 'p08-teenagers',
  's01-strength-training', 's02-mobility', 's03-cross-training', 's04-sleep-recovery', 's05-heat-and-cold',
  's06-altitude', 's07-hills', 's08-overtraining',
]

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
const docs = files.map((f) => parseResearchDoc(fs.readFileSync(path.join(dir, f), 'utf8'), f))
const byName = Object.fromEntries(docs.map((d) => [d.source, d]))

// -- one summary per research file -----------------------------------------------
check('35 summaries, one per research file', files.length === 35 && SOURCES.length === 35)
check('every research file has its summary', SOURCES.every((s) => byName[s]))
check('no summary without a research file', docs.every((d) => SOURCES.includes(d.source)))
check('file name = source', docs.every((d) => d.name === `${d.source}.md`))

// -- size and frontmatter ------------------------------------------------------------
for (const d of docs) {
  check(`${d.source}: ${d.tokens} tokens, at most ${RESEARCH_SUMMARY_MAX_TOKENS}`, d.tokens > 0 && d.tokens <= RESEARCH_SUMMARY_MAX_TOKENS)
}
check('every summary has a valid role', docs.every((d) => ['scenario', 'population', 'reference'].includes(d.role)))
check('every summary declares scenarios, populations or situations',
  docs.every((d) => d.scenarios.length || d.populations.length || d.situations.length))
check('every situation is in the vocabulary', docs.every((d) => d.situations.every((s) => SITUATIONS.includes(s))))
check('every population is a known one', docs.every((d) => d.populations.every((p) => POPULATION_ORDER.includes(p))))
check('only scenario summaries declare scenarios', docs.every((d) => d.role === 'scenario' || d.scenarios.length === 0))
for (const scenario of SCENARIOS) {
  const owners = docs.filter((d) => d.role === 'scenario' && d.scenarios.includes(scenario))
  check(`${scenario}: exactly one scenario summary (${owners.map((o) => o.source).join(', ') || 'none'})`, owners.length === 1)
}
check('every population has a note', POPULATION_ORDER.every((p) => docs.some((d) => d.populations.includes(p))))

// -- the plan call: the scenario summary plus at most two population notes -------------
for (const scenario of SCENARIOS) {
  const { docs: picked, tokens } = selectPlanResearch(docs, { scenario, populations: [] })
  check(`plan (${scenario}): the scenario summary alone`, picked.length === 1 && picked[0].role === 'scenario' && picked[0].scenarios.includes(scenario))
  check(`plan (${scenario}): ${tokens} tokens within the ${RESEARCH_BUDGETS.plan} budget`, tokens <= RESEARCH_BUDGETS.plan)
}
{
  const teen = selectPlanResearch(docs, { scenario: 'short_race', populations: ['teen'] }).docs.map((d) => d.source)
  check('plan: a teenager also gets the teenage note', teen.join() === 'm01-jack-daniels,p08-teenagers')
  const masters = selectPlanResearch(docs, { scenario: 'long_race', populations: ['masters'] }).docs.map((d) => d.source)
  check('plan: a masters runner also gets the masters note', masters.join() === 'm02-pfitzinger,p04-masters-runners')
  const crunched = selectPlanResearch(docs, { scenario: 'recreational', populations: ['time_crunched'] }).docs.map((d) => d.source)
  check('plan: a runner with few days also gets the time-crunched note', crunched.join() === 'm06-fitzgerald-8020,p07-time-crunched-runners')
  const all = selectPlanResearch(docs, { scenario: 'short_race', populations: ['time_crunched', 'masters', 'teen', 'overweight', 'postpartum'] })
  check(`plan: never more than ${MAX_POPULATION_NOTES} population notes`, all.docs.filter((d) => d.role !== 'scenario' || !d.scenarios.length).length - 0 <= MAX_POPULATION_NOTES + 1 && all.docs.length <= 1 + MAX_POPULATION_NOTES)
  check('plan: the most safety-relevant populations win the two slots', all.docs.map((d) => d.source).join() === 'm01-jack-daniels,p08-teenagers,p03-pregnancy-postpartum')
  const beginner = selectPlanResearch(docs, { scenario: 'complete_beginner', populations: ['masters'] }).docs.map((d) => d.source)
  check('plan: a scenario summary is never loaded twice', new Set(beginner).size === beginner.length)
  check('plan: an unknown scenario loads no scenario summary', selectPlanResearch(docs, { scenario: 'nonsense' }).docs.length === 0)
}

// -- what the plan call may be told (no health data) ------------------------------------------
check('populations: a teenager, a masters runner, few run days',
  detectPopulations({ age: 16 }).join() === 'teen' && detectPopulations({ age: 45 }).join() === 'masters' &&
  detectPopulations({ age: 30, daysPerWeek: 2 }).join() === 'time_crunched')
check('populations: BMI, postpartum, injury and sex are detected for chat',
  detectPopulations({ age: 30, bmi: 33, pregnancyStatus: 'postpartum', injury: true, sex: 'female' }).join() ===
  'postpartum,overweight,returning_injury,female')
check('the plan call is offered age and schedule only',
  PLAN_POPULATIONS.join() === 'teen,masters,time_crunched' &&
  planPopulations({ age: 30, bmi: 35, pregnancyStatus: 'postpartum', injury: true, sex: 'female' }).length === 0 &&
  planPopulations({ age: 62, daysPerWeek: 3 }).join() === 'masters,time_crunched')

// -- chat: situations through detectSituations ---------------------------------------------------
const chat = (text) => selectChatResearch(docs, detectSituations(text))
const first = (text) => chat(text).docs.map((d) => d.source)
check('chat: heat', first('It is 32 degrees and very humid, should I run?').includes('s05-heat-and-cold'))
check('chat: hills', first('Should I do hill repeats this week?').includes('s07-hills'))
check('chat: altitude', first('I am going to a training camp at altitude').includes('s06-altitude'))
check('chat: strength', first('How many times a week should I do strength training at the gym?').includes('s01-strength-training'))
check('chat: sleep', first('I only sleep five hours, is that a problem?').includes('s04-sleep-recovery'))
check('chat: fatigue', first('I feel exhausted and my legs are heavy all the time').includes('s08-overtraining'))
check('chat: menstrual cycle', first('Does my menstrual cycle matter for training?').includes('p02-women-menstrual-cycle'))
check('chat: pregnancy', first('I gave birth six weeks ago, when can I run?').includes('p03-pregnancy-postpartum'))
check('chat: masters', first('I am in my 50s, how should I train?').includes('p04-masters-runners'))
check('chat: weight', first('I am overweight and want to start running').includes('p05-overweight-runners'))
check('chat: injury return', first('How do I return to running after an injury?').includes('p06-return-from-injury'))
check('chat: few days', first('I only have two days a week to run').includes('p07-time-crunched-runners'))
check('chat: a teenager', first('My daughter is a teenager and wants to run a half').includes('p08-teenagers'))
check('chat: beginner', first('I have never run, is couch to 5k right for me?').includes('m09-couch-to-5k'))
check('chat: Galloway', first('What is the Galloway run-walk method?').includes('m08-galloway-run-walk'))
check('chat: Pfitzinger', first('Should I follow Pfitzinger for my marathon?').includes('m02-pfitzinger'))
check('chat: taper', first('How long should my taper be?').includes('b06-recovery-weeks-taper'))
check('chat: missed sessions', first('I was sick for two weeks and missed sessions').includes('b07-adaptation-missed-sessions-fatigue'))
check('chat: polarized', first('Is polarized training better than pyramidal?').includes('m11-polarized-vs-pyramidal'))
check('chat: slovenian (no diacritics): hrib', first('Kako naj treniram klance?').includes('s07-hills'))
check('chat: slovenian: nosecnost', first('Ali lahko tecem v nosecnosti?').includes('p03-pregnancy-postpartum'))
check('chat: nothing matched, nothing loaded', chat('Hello, how are you?').docs.length === 0)
check(`chat: at most ${MAX_CHAT_NOTES} summaries`,
  chat('My knee hurts, it is hot, I sleep badly, I am in my 50s and my hills training is stuck').docs.length <= MAX_CHAT_NOTES)
check(`chat: within the ${RESEARCH_BUDGETS.chat} token budget`, chat('My knee hurts, it is hot, I sleep badly').tokens <= RESEARCH_BUDGETS.chat)
check('chat: "periodization" is not a period', !detectSituations('what is periodization').includes('cycle_question'))

// -- exactly one AI call per plan -------------------------------------------------------------------
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const between = (text, start, end) => {
  const a = text.indexOf(start)
  const b = text.indexOf(end, a + start.length)
  return text.slice(a, b === -1 ? undefined : b)
}
const ai = read('src/core/ai.js')
const describeBody = between(ai, 'export async function describePlanSkeleton', '\nexport ')
// One request per plan. The only other callAi is the once-only retry when the
// JSON came back malformed; the research block adds none.
const calls = [...describeBody.matchAll(/\bcallAi\(/g)].map((m) => m.index)
const retryAt = describeBody.indexOf('retrying once')
check('describePlanSkeleton makes exactly one AI call (plus the malformed-JSON retry)',
  calls.length >= 1 && calls.length <= 2 && (calls.length === 1 || calls[1] > retryAt))
check('...the first call is not inside the retry branch', calls[0] < retryAt)
check('...the research block is built with plain text, not another request',
  /buildResearchPlanBlock\(/.test(describeBody) && !/\bawait\b[^\n]*(Research|knowledge)/i.test(describeBody))
const plan = read('src/core/plan.js')
const createBody = between(plan, 'export async function createInitialPlan', '\nexport ')
check('createInitialPlan describes the plan once', (createBody.match(/describePlanSkeleton\(/g) || []).length === 1)
const selectSrc = read('src/core/research-select.js')
check('research selection is synchronous and offline', !/\bawait\b|\bfetch\(|supabase|async /.test(selectSrc.replace(/\/\*[\s\S]*?\*\//g, '')))
const idx = read('src/core/planning/index.js')
check('the skeleton carries the age-and-schedule populations only', /populations: planPopulations\(/.test(idx) && !/populations:[^\n]*bmi/i.test(idx))

// ai.js and knowledge.js need the bundler and cannot be imported here, but a
// syntax error in them (the plan call, the chat call) must still fail the suite.
for (const f of ['src/core/ai.js', 'src/core/knowledge.js']) {
  let ok = true
  try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }) } catch { ok = false }
  check(`${f} parses`, ok)
}

export default summary('research summaries')
