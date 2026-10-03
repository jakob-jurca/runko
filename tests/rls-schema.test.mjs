/**
 * Static audit of the RLS rules in supabase/*.sql.
 *
 * This is the half of the RLS story that can be checked without a database,
 * and it runs on every `npm test`. It exists because the realistic regression
 * is not "someone rewrites a policy to be wrong" — it is "someone adds a
 * table and forgets RLS entirely". A new table with no `enable row level
 * security` is world-readable through the anon key that ships in the bundle,
 * and nothing else in the repo would notice.
 *
 * What it cannot do is prove the policies are CORRECT — a policy can exist,
 * be enabled and still be wrong. That is what rls-live.test.mjs is for.
 */
import fs from 'node:fs'
import path from 'node:path'
import { check, summary } from './harness.mjs'

const SQL_DIR = 'supabase'
const files = fs
  .readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({ name: f, body: fs.readFileSync(path.join(SQL_DIR, f), 'utf8') }))

const sql = files.map((f) => f.body).join('\n')
/** Strip `-- comments` so prose about policies is never mistaken for one. */
const code = sql.replace(/--[^\n]*/g, '')

console.log('\nRLS — schema audit')
check('supabase/*.sql files were found', files.length > 0)

// --- every table declared must have RLS enabled -----------------------------
const tables = [...code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map(
  (m) => m[1]
)
const unique = [...new Set(tables)]
check('at least the five core tables are declared', unique.length >= 5)

const rlsEnabled = new Set(
  [...code.matchAll(/alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/gi)].map(
    (m) => m[1]
  )
)
for (const table of unique) {
  check(`${table}: row level security is enabled`, rlsEnabled.has(table))
}

// --- policies must be scoped to the caller, never open ----------------------
const policies = [
  ...code.matchAll(
    /create\s+policy\s+"([^"]+)"\s+on\s+public\.(\w+)([\s\S]*?);/gi
  ),
].map(([, name, table, rest]) => ({ name, table, body: rest }))

check('policies are declared', policies.length > 0)

for (const p of policies) {
  check(`policy "${p.name}" on ${p.table} is scoped to auth.uid()`, /auth\.uid\(\)/i.test(p.body))

  // `using (true)` / `with check (true)` would let any authenticated caller
  // touch any row — the exact failure this audit exists to catch.
  check(
    `policy "${p.name}" on ${p.table} is not open to everyone`,
    !/\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(p.body)
  )

  // A policy that filters reads but not writes lets a user insert rows owned
  // by someone else. `for all` needs both halves.
  if (/for\s+all/i.test(p.body) || /for\s+insert/i.test(p.body) || /for\s+update/i.test(p.body)) {
    check(`policy "${p.name}" on ${p.table} constrains writes too (with check)`, /with\s+check/i.test(p.body))
  }
}

// --- every user-owned table is actually covered by a policy -----------------
const withPolicy = new Set(policies.map((p) => p.table))
/** True if `create table public.<table> (...)` declares a user_id column. */
const ownershipColumn = (table) => {
  const start = code.indexOf(`public.${table} (`)
  if (start === -1) return false
  const end = code.indexOf('\n);', start)
  if (end === -1) return false
  return /\buser_id\b/.test(code.slice(start, end))
}
// Written and read only by the Edge Functions (service role). RLS on, NO
// policy: a client must not see, forge or delete what is counted against it.
const SERVER_ONLY = ['ai_usage', 'plan_builds', 'stripe_events']
for (const table of unique) {
  if (SERVER_ONLY.includes(table)) continue // deliberately policy-free; asserted below
  if (table === 'users' || ownershipColumn(table)) {
    check(`${table}: has at least one policy`, withPolicy.has(table))
  }
}

// --- ai_usage must stay unreachable from any client -------------------------
// RLS on with NO policy means no client can read, write, forge or delete a
// usage row; only the Edge Function reaches it with the service-role key.
// A well-meaning "let users see their own usage" policy would hand a user the
// ability to delete their own rate-limit records.
check('ai_usage: table exists', unique.includes('ai_usage'))
check('ai_usage: row level security is enabled', rlsEnabled.has('ai_usage'))
check('ai_usage: has NO policy, so no client can reach it', !withPolicy.has('ai_usage'))
for (const table of SERVER_ONLY.filter((t) => unique.includes(t) && t !== 'ai_usage')) {
  check(`${table}: row level security is enabled`, rlsEnabled.has(table))
  check(`${table}: has NO policy, so no client can reach it`, !withPolicy.has(table))
}

// --- subscriptions: the runner may read their own, never write it -----------
// Writing it would be granting yourself Pro.
if (unique.includes('subscriptions')) {
  const subPolicies = policies.filter((p) => p.table === 'subscriptions')
  check('subscriptions: has a read policy', subPolicies.length > 0)
  check('subscriptions: every policy is read-only (for select)', subPolicies.every((p) => /for\s+select/i.test(p.body)))
  check('subscriptions: client writes revoked', /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.subscriptions\s+from\s+anon,\s*authenticated/i.test(code))
}

// --- the service-role key must never appear outside the function ------------
const clientFiles = []
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|jsx|mjs)$/.test(e.name)) clientFiles.push(p)
  }
}
walk('src')
const leaks = clientFiles.filter((f) =>
  /service_role|SERVICE_ROLE_KEY/.test(fs.readFileSync(f, 'utf8'))
)
check('no service-role key reference anywhere in src/', leaks.length === 0)

export default summary('rls-schema')
