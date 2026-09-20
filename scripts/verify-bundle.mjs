/**
 * verify-bundle.mjs — refuses to let a build ship a secret or a dev bypass.
 *
 * Runs automatically after `npm run build`. It exists because two of the
 * things we care about are invisible in source review:
 *
 *   1. Vite inlines every import.meta.env value, so a stray VITE_* secret
 *      ends up as a plain string in a file anyone can download.
 *   2. `vite build --mode development` leaves import.meta.env.DEV true, which
 *      would ship the paywall bypass to real users. Reading subscription.js
 *      tells you nothing about that; reading the bundle does.
 *
 * Exits non-zero on any finding, so a bad build cannot be deployed by
 * accident.
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST = 'dist'
if (!fs.existsSync(DIST)) {
  console.error('verify-bundle: no dist/ — run the build first.')
  process.exit(1)
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(DIST)
const text = files
  .filter((f) => /\.(js|css|html|map|json|txt)$/.test(f))
  .map((f) => ({ file: f, body: fs.readFileSync(f, 'utf8') }))

/** Values from .env that must never appear in a bundle. */
function envSecrets() {
  if (!fs.existsSync('.env')) return []
  const out = []
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1).trim()
    if (!value || value.length < 12) continue
    // The anon key is designed to be public and is protected by RLS.
    if (key === 'VITE_SUPABASE_ANON_KEY' || key === 'VITE_SUPABASE_URL') continue
    out.push({ key, value })
  }
  return out
}

const findings = []
const note = (label, file, hint) => findings.push({ label, file, hint })

// --- 1. no secret values from .env ------------------------------------------
for (const { key, value } of envSecrets()) {
  for (const { file, body } of text) {
    if (body.includes(value)) note(`secret ${key} is in the bundle`, file, 'move it server-side')
  }
}

// --- 2. no provider key shapes, whatever their source -----------------------
// These are judged by shape alone, so every one of them must be a pattern no
// legitimate public value can take. The anon key is deliberately absent: it
// is a JWT, and JWTs are judged by their role claim in check 3 below.
const KEY_SHAPES = [
  [/\bgsk_[A-Za-z0-9]{20,}/, 'Groq API key'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'OpenAI-style API key'],
  // sbp_ is a Supabase personal access token: full control of the account's
  // projects, and the credential the CLI logs in with.
  [/\bsbp_[A-Za-z0-9]{20,}/, 'Supabase personal access token'],
  // Supabase's newer key format. sb_publishable_ is the anon key's successor
  // and belongs in the bundle; sb_secret_ is the service key's and never does.
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase secret key'],
  [/\bservice_role\b/, 'Supabase service-role reference'],
  [/\bSUPABASE_SERVICE_ROLE_KEY\b/, 'service-role key name'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
]
for (const { file, body } of text) {
  for (const [re, label] of KEY_SHAPES) {
    const m = body.match(re)
    if (m) note(`${label} found`, file, m[0].slice(0, 12) + '…')
  }
}

// --- 3. JWTs: judge them by their role claim, not by matching .env ----------
//
// The anon key is MEANT to be in the bundle. It identifies the project to
// PostgREST, carries no authority of its own, and is exactly what the RLS
// policies are there to constrain — tests/rls-live.test.mjs proves an
// anonymous client holding it reads nothing.
//
// This used to be checked by string-matching the key against .env. That
// worked locally and failed the build on Vercel, where there is no .env file
// (the values come from the platform's environment), so the allow-list was
// empty and the anon key was reported as an unexpected JWT. Worse than the
// false positive: the check only ever recognised ONE specific key, so a
// service-role key from anywhere else would have been reported in the same
// undifferentiated way as the harmless one.
//
// A JWT says what it is. Supabase signs both keys with a `role` claim, so
// decode it and judge the claim: 'anon' is fine, 'service_role' is the
// emergency, and anything else is unexpected and worth a human look.
/** The payload of a JWT, or null if it is not decodable. */
function jwtPayload(jwt) {
  try {
    const [, payload] = jwt.split('.')
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

for (const { file, body } of text) {
  for (const jwt of body.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    const claims = jwtPayload(jwt)
    const role = claims?.role

    if (role === 'anon') continue // public by design, constrained by RLS

    if (role === 'service_role') {
      note(
        'SERVICE-ROLE KEY IN THE BUNDLE — it bypasses every RLS policy',
        file,
        'rotate it now, then move whatever needed it into an Edge Function'
      )
      continue
    }

    note(
      claims ? `unexpected JWT (role: ${role ?? 'none'}) in the bundle` : 'unexpected JWT in the bundle',
      file,
      jwt.slice(0, 16) + '…'
    )
  }
}

// --- 4. the dev paywall bypass must not be here -----------------------------
for (const { file, body } of text) {
  if (/DEV_BYPASS_PAYWALL/.test(body)) {
    note('dev paywall bypass shipped', file, 'built in development mode?')
  }
  if (/paywall bypassed/.test(body)) {
    note('dev paywall log shipped', file, 'built in development mode?')
  }
}

// --- 5. the real gating must still be present -------------------------------
const js = text.filter((t) => t.file.endsWith('.js')).map((t) => t.body).join('')
if (!/trial_end/.test(js)) {
  note('trial gating missing from the bundle', 'dist/*.js', 'hasPremium may have been tree-shaken')
}
if (!/subscription_status/.test(js)) {
  note('subscription gating missing from the bundle', 'dist/*.js', '')
}

// --- 6. the AI must be proxied, not called directly -------------------------
if (/api\.groq\.com/.test(js)) {
  note('bundle calls api.groq.com directly', 'dist/*.js', 'AI calls must go through the Edge Function')
}

// --- report ------------------------------------------------------------------
console.log(`verify-bundle: scanned ${text.length} files in ${DIST}/`)
if (findings.length) {
  console.error(`\n✗ ${findings.length} problem(s):`)
  for (const f of findings) {
    console.error(`  - ${f.label}\n      ${f.file}${f.hint ? '\n      ' + f.hint : ''}`)
  }
  process.exit(1)
}
console.log('✓ no secrets, no dev bypass, gating intact, AI proxied')
