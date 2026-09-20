/**
 * rls-live.test.mjs — proves that one runner cannot reach another's data.
 *
 * This runs as part of `npm test` whenever .env holds Supabase credentials,
 * because the thing it checks is the one that would be catastrophic and
 * cannot be verified by reading policy text: a policy can exist, be enabled,
 * and still be wrong. rls-schema.test.mjs reads the SQL; this one attacks the
 * live database the way a browser would.
 *
 * It creates two REAL users through the public anon key — exactly the access
 * a browser has — has user A write a row in every table, then has user B and
 * an anonymous client try every way of reaching it: unfiltered select, select
 * by row id, select filtered to A's user_id, update, delete, and inserting
 * rows owned by A. Finally it checks RLS has not over-blocked A itself.
 *
 * The two audit users are created once and REUSED: their credentials are kept
 * in .rls-audit.json (gitignored), so running the suite a hundred times does
 * not leave a hundred accounts behind. Delete that file to start fresh. Data
 * rows are removed after every run.
 *
 * It SKIPS, loudly and without failing, when .env is absent or the project is
 * unreachable — `npm test` must still work offline and in CI. A skip is
 * reported at the end of the run so it cannot pass unnoticed.
 *
 * Requires "Confirm email" switched OFF in Authentication -> Providers ->
 * Email; otherwise signup yields no session and there is nothing to test with.
 *
 * Run on its own with: npm run audit:rls
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { check, summary } from './harness.mjs'

const STORE = '.rls-audit.json'

/** A skip is a result, not a pass: it carries its reason to the runner. */
const skip = (reason) => {
  console.log('\nRLS — live audit')
  console.log(`  SKIPPED — ${reason}`)
  return { name: 'rls-live', passes: 0, failures: [], skipped: reason }
}

function readEnv() {
  if (!fs.existsSync('.env')) return {}
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  )
}

const env = readEnv()
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY

const result =
  !URL_ || !ANON ? skip('no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env') : await audit()

async function audit() {
  let createClient
  try {
    ;({ createClient } = await import('@supabase/supabase-js'))
  } catch {
    return skip('@supabase/supabase-js is not installed (npm install)')
  }

  const client = () => createClient(URL_, ANON, { auth: { persistSession: false } })

  /** Credentials for the two reusable audit users. */
  function credentials() {
    if (fs.existsSync(STORE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(STORE, 'utf8'))
        if (saved.project === URL_ && saved.a && saved.b) return saved
      } catch {
        /* unreadable store — fall through and make new users */
      }
    }
    const make = (tag) => ({
      email: `rls-audit-${tag}-${Date.now()}@example.test`,
      password: `Rls-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}!9`,
    })
    const fresh = { project: URL_, a: make('a'), b: make('b') }
    fs.writeFileSync(STORE, JSON.stringify(fresh, null, 2))
    return fresh
  }

  /** Sign in if the user already exists, otherwise create it. */
  async function user(creds) {
    const sb = client()
    const signIn = await sb.auth.signInWithPassword(creds)
    if (signIn.data?.session) return { sb, id: signIn.data.user.id, email: creds.email }

    const { data, error } = await sb.auth.signUp(creds)
    if (error) throw new Error(`signup failed for ${creds.email}: ${error.message}`)
    if (!data.session) {
      throw new Error('signup returned no session — turn OFF "Confirm email" to run this audit')
    }
    return { sb, id: data.user.id, email: creds.email }
  }

  const creds = credentials()
  let A, B
  try {
    A = await user(creds.a)
    B = await user(creds.b)
  } catch (err) {
    // Unreachable project, email confirmation on, rate-limited signups: an
    // environment problem, not a policy regression. Skip rather than fail.
    return skip(String(err.message || err))
  }

  const anon = client()

  console.log('\nRLS — live audit')
  console.log(`  project ${URL_}`)
  console.log(`  user A  ${A.id}`)
  console.log(`  user B  ${B.id}`)

  /** A write is correctly refused if it errors OR silently affects no rows. */
  const refused = ({ error, data }) => Boolean(error) || !data || data.length === 0
  const detail = (label, err) => (err ? `${label} — ${err.message}` : label)

  // --- A writes one row in every table --------------------------------------
  const created = {}

  const profile = await A.sb
    .from('users')
    .upsert({ id: A.id, name: 'Runner A', age: 30 })
    .select()
    .single()
  check(detail('A can create its own profile', profile.error), !profile.error)
  created.users = profile.data?.id

  const plan = await A.sb
    .from('training_plans')
    .upsert({ user_id: A.id, week_number: 1, plan_json: { secret: 'A-plan' } }, { onConflict: 'user_id,week_number' })
    .select()
    .single()
  check(detail('A can create its own plan', plan.error), !plan.error)
  created.training_plans = plan.data?.id

  const workout = await A.sb
    .from('workouts')
    .insert({ user_id: A.id, date: '2026-09-19', distance: 10, duration: 60, effort: 3, notes: 'A-secret-run' })
    .select()
    .single()
  check(detail('A can create its own workout', workout.error), !workout.error)
  created.workouts = workout.data?.id

  const message = await A.sb
    .from('chat_messages')
    .insert({ user_id: A.id, role: 'user', content: 'A-private-message' })
    .select()
    .single()
  check(detail('A can create its own chat message', message.error), !message.error)
  created.chat_messages = message.data?.id

  const memory = await A.sb
    .from('coach_memory')
    .insert({ user_id: A.id, content: 'A-private-memory', category: 'injury' })
    .select()
    .single()
  check(detail('A can create its own memory', memory.error), !memory.error)
  created.coach_memory = memory.data?.id

  // B needs a profile too, so "B sees only its own row" is a real assertion.
  await B.sb.from('users').upsert({ id: B.id, name: 'Runner B' })

  const TABLES = [
    { table: 'users', rowId: created.users, ownerCol: 'id', patch: { name: 'HACKED' } },
    { table: 'training_plans', rowId: created.training_plans, ownerCol: 'user_id', patch: { plan_json: { secret: 'HACKED' } } },
    { table: 'workouts', rowId: created.workouts, ownerCol: 'user_id', patch: { notes: 'HACKED' } },
    { table: 'chat_messages', rowId: created.chat_messages, ownerCol: 'user_id', patch: { content: 'HACKED' } },
    { table: 'coach_memory', rowId: created.coach_memory, ownerCol: 'user_id', patch: { content: 'HACKED' } },
  ]

  // --- B tries to READ A's data ---------------------------------------------
  for (const { table, rowId, ownerCol } of TABLES) {
    const all = await B.sb.from(table).select('*')
    const leaked = (all.data ?? []).some((r) => (r[ownerCol] ?? r.id) === A.id)
    check(`${table}: B's unfiltered select does not return A's rows`, !leaked)

    if (!rowId) continue
    const byId = await B.sb.from(table).select('*').eq('id', rowId)
    check(`${table}: B selecting A's row id gets nothing`, (byId.data ?? []).length === 0)

    const byOwner = await B.sb.from(table).select('*').eq(ownerCol, A.id)
    check(`${table}: B filtering on A's user_id gets nothing`, (byOwner.data ?? []).length === 0)
  }

  // --- B tries to WRITE to A's data -----------------------------------------
  for (const { table, rowId, patch } of TABLES) {
    if (!rowId) continue
    check(`${table}: B cannot update A's row`, refused(await B.sb.from(table).update(patch).eq('id', rowId).select()))
    check(`${table}: B cannot delete A's row`, refused(await B.sb.from(table).delete().eq('id', rowId).select()))
  }

  // --- B tries to create rows OWNED BY A (impersonation) --------------------
  const impersonations = [
    ['training_plans', { user_id: A.id, week_number: 99, plan_json: {} }],
    ['workouts', { user_id: A.id, date: '2026-09-19', distance: 1, duration: 1, effort: 1 }],
    ['chat_messages', { user_id: A.id, role: 'user', content: 'injected' }],
    ['coach_memory', { user_id: A.id, content: 'injected', category: 'injury' }],
  ]
  for (const [table, row] of impersonations) {
    check(`${table}: B cannot insert a row owned by A`, refused(await B.sb.from(table).insert(row).select()))
  }
  check(
    "users: B cannot upsert over A's profile",
    refused(await B.sb.from('users').upsert({ id: A.id, name: 'HACKED' }).select())
  )

  // --- anonymous (the anon key that ships in the bundle) --------------------
  for (const { table } of TABLES) {
    const res = await anon.from(table).select('*')
    check(`${table}: anonymous reads nothing`, (res.data ?? []).length === 0)
  }
  check(
    'workouts: anonymous cannot insert',
    refused(
      await anon
        .from('workouts')
        .insert({ user_id: A.id, date: '2026-09-19', distance: 1, duration: 1, effort: 1 })
        .select()
    )
  )

  // ai_usage has RLS on and no policy: unreachable from any client at all.
  //
  // "Unreachable" and "does not exist" look identical from here — both come
  // back as an error — so the missing-table case is called out by name. A
  // silent pass would mean the rate limiter has no table to count and the
  // suite happily reporting that the AI proxy is safe.
  const usageRead = await A.sb.from('ai_usage').select('*')
  const missing = usageRead.error?.code === 'PGRST205'
  check(
    missing ? 'ai_usage: table is MISSING — run supabase/migration_v5.sql' : 'ai_usage: table exists',
    !missing
  )
  if (!missing) {
    check('ai_usage: a signed-in user cannot read usage rows', (usageRead.data ?? []).length === 0)
    check(
      'ai_usage: a signed-in user cannot forge a usage row',
      refused(await A.sb.from('ai_usage').insert({ user_id: A.id, kind: 'forged' }).select())
    )
  }

  // --- the paywall columns are not user-writable ----------------------------
  // RLS scopes access to the ROW, not the column, so the "own profile" policy
  // happily allowed a runner to set their own subscription_status to 'active'
  // or push trial_end a year out — the paywall bypassed in one request, with
  // the anon key that ships in the bundle. migration_v6.sql withdraws the
  // table-level grant and hands back every column except these. They are also
  // what a Stripe webhook will write, so a customer must not be able to.
  const selfGrant = await A.sb
    .from('users')
    .update({ subscription_status: 'active' })
    .eq('id', A.id)
    .select()
  check('users: A cannot grant itself an active subscription', refused(selfGrant))

  const selfExtend = await A.sb
    .from('users')
    .update({ trial_end: new Date(Date.now() + 365 * 86_400_000).toISOString() })
    .eq('id', A.id)
    .select()
  check('users: A cannot extend its own trial', refused(selfExtend))

  // The revoke must not be over-broad: ordinary profile edits still work, and
  // neither forbidden column was actually changed by the attempts above.
  const rename = await A.sb.from('users').update({ name: 'Runner A renamed' }).eq('id', A.id).select().single()
  check(detail('users: A can still edit its own profile', rename.error), rename.data?.name === 'Runner A renamed')

  const billing = await A.sb.from('users').select('subscription_status, trial_end').eq('id', A.id).single()
  check(
    'users: A\'s subscription_status was not changed by the attempt',
    billing.data?.subscription_status !== 'active'
  )

  // --- RLS must not over-block: A still sees its own data -------------------
  for (const { table, ownerCol } of TABLES) {
    const res = await A.sb.from(table).select('*')
    const mine = (res.data ?? []).filter((r) => (r[ownerCol] ?? r.id) === A.id)
    check(detail(`${table}: A still sees its own row`, res.error), mine.length >= 1)
  }
  if (created.workouts) {
    const intact = await A.sb.from('workouts').select('notes').eq('id', created.workouts).single()
    check("workouts: A's row was not modified by B", intact.data?.notes === 'A-secret-run')
  }

  // --- cleanup ---------------------------------------------------------------
  for (const u of [A, B]) {
    for (const table of ['coach_memory', 'chat_messages', 'workouts', 'training_plans']) {
      await u.sb.from(table).delete().eq('user_id', u.id)
    }
    await u.sb.from('users').delete().eq('id', u.id)
  }

  return summary('rls-live')
}

// `npm run audit:rls` runs this file directly; print a verdict and set an exit
// code so it is usable on its own, not only through the runner.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('')
  if (result.skipped) {
    console.log(`RLS audit SKIPPED — ${result.skipped}`)
    process.exit(0)
  }
  if (result.failures.length) {
    console.log(`RLS AUDIT FAILED — ${result.failures.length} of ${result.passes + result.failures.length} checks`)
    for (const f of result.failures) console.log('  x ' + f)
    process.exit(1)
  }
  console.log(`RLS AUDIT PASSED — all ${result.passes} checks. Users are isolated.`)
}

export default result
