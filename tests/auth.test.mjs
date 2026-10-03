/**
 * Account flows, without a browser.
 *
 * core/auth-flows.js takes the Supabase client as an argument, so here it
 * gets a small in-memory stand-in for the auth server (FakeAuth below) that
 * answers the way Supabase does: the same error names, status codes, `code`
 * values and English messages, including the awkward cases (a duplicate
 * signup that returns a made-up user and no error, a sign-out that fails
 * offline and keeps the session).
 *
 * What cannot run here — the emailed link in a real inbox, several tabs, a
 * phone — is in AUTH_CHECKLIST.md.
 */
import fs from 'node:fs'
import {
  signUp, logIn, requestPasswordReset, resendConfirmation, confirmEmailLink, setNewPassword, changePassword,
  signOutHere, describeAuthError, isDeadSessionError, normalizeEmail, MIN_PASSWORD_LENGTH,
} from '../src/core/auth-flows.js'
import { parseAuthUrl, failedLinkTarget, sessionAuthMethods, recoveryClaimHolds } from '../src/core/auth-url.js'
import { friendlyError } from '../src/core/errors.js'
import { t } from '../src/core/strings.js'
import { check, summary } from './harness.mjs'

// ---------------------------------------------------------------------------
// A stand-in auth server
// ---------------------------------------------------------------------------

const apiError = (message, status, code) => ({ name: 'AuthApiError', message, status, code, __isAuthError: true })
const networkError = () => ({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0, __isAuthError: true })
const sessionMissing = () => ({ name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400, __isAuthError: true })

class FakeAuth {
  constructor({ confirmEmail = false, minPassword = 6 } = {}) {
    this.confirmEmail = confirmEmail
    this.minPassword = minPassword
    this.users = new Map() // email -> { id, password, confirmed }
    this.session = null // the session in THIS browser
    this.otherSessions = new Map() // email -> sessions signed in elsewhere
    this.tokens = new Map() // token_hash -> { email, type, used }
    this.emails = [] // { to, kind }
    this.calls = []
    this.offline = false
    this.emailQuotaHit = false
    this.nextId = 1
  }

  seed(email, password, { confirmed = true, elsewhere = 0 } = {}) {
    this.users.set(email, { id: `u${this.nextId++}`, password, confirmed })
    this.otherSessions.set(email, elsewhere)
  }

  issueLink(email, type = 'recovery') {
    const hash = `hash-${this.tokens.size + 1}`
    this.tokens.set(hash, { email, type, used: false })
    return hash
  }

  #log(name, args) {
    this.calls.push([name, args])
  }

  async signUp({ email, password }) {
    this.#log('signUp', { email, password })
    if (this.offline) return { data: { user: null, session: null }, error: networkError() }
    if (password.length < this.minPassword) {
      return { data: { user: null, session: null }, error: { ...apiError('Password should be at least 8 characters.', 422, 'weak_password'), name: 'AuthWeakPasswordError' } }
    }
    const existing = this.users.get(email)
    if (existing) {
      // Confirmation on: no error, a made-up user with no identities.
      if (this.confirmEmail) return { data: { user: { id: 'fake', email, identities: [] }, session: null }, error: null }
      return { data: { user: null, session: null }, error: apiError('User already registered', 422, 'user_already_exists') }
    }
    const user = { id: `u${this.nextId++}`, password, confirmed: !this.confirmEmail }
    this.users.set(email, user)
    if (this.confirmEmail) {
      this.emails.push({ to: email, kind: 'confirm' })
      return { data: { user: { id: user.id, email, identities: [{ provider: 'email' }] }, session: null }, error: null }
    }
    this.session = { user: { id: user.id, email }, via: 'password' }
    return { data: { user: { id: user.id, email, identities: [{ provider: 'email' }] }, session: this.session }, error: null }
  }

  async signInWithPassword({ email, password }) {
    this.#log('signInWithPassword', { email, password })
    if (this.offline) throw new TypeError('Failed to fetch')
    const user = this.users.get(email)
    if (!user || user.password !== password) {
      return { data: { user: null, session: null }, error: apiError('Invalid login credentials', 400, 'invalid_credentials') }
    }
    if (!user.confirmed) return { data: { user: null, session: null }, error: apiError('Email not confirmed', 400, 'email_not_confirmed') }
    this.session = { user: { id: user.id, email }, via: 'password' }
    return { data: { user: this.session.user, session: this.session }, error: null }
  }

  async resetPasswordForEmail(email, options) {
    this.#log('resetPasswordForEmail', { email, options })
    if (this.offline) return { data: null, error: networkError() }
    if (this.emailQuotaHit) {
      return { data: null, error: apiError('For security purposes, you can only request this after 48 seconds.', 429, 'over_email_send_rate_limit') }
    }
    // The same answer for a known and an unknown address.
    if (this.users.has(email)) this.emails.push({ to: email, kind: 'recovery' })
    return { data: {}, error: null }
  }

  async resend({ type, email }) {
    this.#log('resend', { type, email })
    if (this.emailQuotaHit) return { data: null, error: apiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit') }
    this.emails.push({ to: email, kind: type === 'signup' ? 'confirm' : type })
    return { data: {}, error: null }
  }

  async verifyOtp({ token_hash: hash, type }) {
    this.#log('verifyOtp', { hash, type })
    if (this.offline) return { data: null, error: networkError() }
    const token = this.tokens.get(hash)
    if (!token || token.used || token.type !== type) {
      return { data: { user: null, session: null }, error: apiError('Email link is invalid or has expired', 403, 'otp_expired') }
    }
    token.used = true
    const user = this.users.get(token.email)
    user.confirmed = true
    // Replaces whoever was signed in here.
    this.session = { user: { id: user.id, email: token.email }, via: type }
    return { data: { user: this.session.user, session: this.session }, error: null }
  }

  async updateUser({ password }) {
    this.#log('updateUser', { password })
    if (this.offline) return { data: { user: null }, error: networkError() }
    if (!this.session) return { data: { user: null }, error: sessionMissing() }
    const user = this.users.get(this.session.user.email)
    if (password.length < this.minPassword) return { data: { user: null }, error: apiError('Password should be at least 8 characters.', 422, 'weak_password') }
    if (password === user.password) {
      return { data: { user: null }, error: apiError('New password should be different from the old password.', 422, 'same_password') }
    }
    user.password = password
    return { data: { user: this.session.user }, error: null }
  }

  async signOut({ scope = 'global' } = {}) {
    this.#log('signOut', { scope })
    // Offline the SDK returns the error and KEEPS the session.
    if (this.offline) return { error: networkError() }
    const email = this.session?.user?.email
    if (scope === 'others' || scope === 'global') this.otherSessions.set(email, 0)
    if (scope !== 'others') this.session = null
    return { error: null }
  }
}

const client = (opts) => {
  const auth = new FakeAuth(opts)
  return { auth }
}

const SLOVENIAN_ONLY = (message) =>
  typeof message === 'string' && message.length > 8 &&
  !/\b(invalid|password should|already registered|not confirmed|rate limit|for security purposes|session missing|expired|failed to fetch|jwt|the|error)\b/i.test(message)

const RAW_SUPABASE = []
const fails = (result, code) => {
  RAW_SUPABASE.push(result.message)
  return result.ok === false && result.code === code && SLOVENIAN_ONLY(result.message)
}

// ---------------------------------------------------------------------------
console.log('\nAuth — sign up:')
{
  const c = client()
  const ok = await signUp(c, { email: '  Ana@Primer.SI ', password: 'dolgogeslo1' })
  check('a new account signs in straight away (confirmation off)', ok.ok && ok.needsConfirmation === false && c.auth.session?.user.email === 'ana@primer.si')
  check('the address is trimmed and lower-cased before it is sent', c.auth.calls[0][1].email === 'ana@primer.si' && normalizeEmail(' A@B.si ') === 'a@b.si')
  check('duplicate email (confirmation off) → account exists', fails(await signUp(c, { email: 'ana@primer.si', password: 'drugogeslo2' }), 'user_exists'))
  const before = c.auth.calls.length
  check(`password under ${MIN_PASSWORD_LENGTH} characters is stopped before the server`, fails(await signUp(c, { email: 'b@primer.si', password: '123' }), 'too_short') && c.auth.calls.length === before)
  check('not an email address → invalid email, no call', fails(await signUp(c, { email: 'ana.primer.si', password: 'dolgogeslo1' }), 'invalid_email') && c.auth.calls.length === before)

  const strict = client({ minPassword: 8 })
  check('a password the server finds too weak → weak password', fails(await signUp(strict, { email: 'c@primer.si', password: '1234567' }), 'weak_password'))

  const confirming = client({ confirmEmail: true })
  const pending = await signUp(confirming, { email: 'eva@primer.si', password: 'dolgogeslo1' })
  check('confirmation on: no session, "check your email"', pending.ok && pending.needsConfirmation === true && !confirming.auth.session && confirming.auth.emails.length === 1)
  // Supabase answers this with a made-up user and NO error, and sends nothing.
  const dup = await signUp(confirming, { email: 'eva@primer.si', password: 'dolgogeslo1' })
  check('duplicate email (confirmation on) is recognised, not "check your email"', fails(dup, 'user_exists') && confirming.auth.emails.length === 1)

  const off = client()
  off.auth.offline = true
  check('offline → network message', fails(await signUp(off, { email: 'd@primer.si', password: 'dolgogeslo1' }), 'network'))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — log in:')
{
  const c = client()
  c.auth.seed('ana@primer.si', 'pravogeslo')
  c.auth.seed('nepotrjen@primer.si', 'pravogeslo', { confirmed: false })
  check('right password → signed in', (await logIn(c, { email: 'Ana@primer.si ', password: 'pravogeslo' })).ok && c.auth.session?.user.email === 'ana@primer.si')
  const wrong = await logIn(c, { email: 'ana@primer.si', password: 'napacno' })
  const unknown = await logIn(c, { email: 'nihce@primer.si', password: 'karkoli1' })
  check('wrong password → one clear message', fails(wrong, 'invalid_credentials'))
  check('unknown email → the very same message (no account enumeration)', fails(unknown, 'invalid_credentials') && unknown.message === wrong.message)
  check('unconfirmed email → says to confirm, with its own code for the resend button', fails(await logIn(c, { email: 'nepotrjen@primer.si', password: 'pravogeslo' }), 'email_not_confirmed'))
  check('a short password can still log in (no client minimum on login)', (await logIn(c, { email: 'ana@primer.si', password: 'abc' })).code === 'invalid_credentials')
  const resent = await resendConfirmation(c, { email: 'nepotrjen@primer.si' })
  check('the confirmation email can be sent again', resent.ok && c.auth.emails.at(-1).kind === 'confirm' && SLOVENIAN_ONLY(resent.message))
  c.auth.offline = true
  check('offline (the SDK throws) → network message, not a crash', fails(await logIn(c, { email: 'ana@primer.si', password: 'pravogeslo' }), 'network'))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — forgot password, request:')
{
  const c = client()
  c.auth.seed('ana@primer.si', 'starogeslo')
  const known = await requestPasswordReset(c, { email: ' Ana@primer.si', redirectTo: 'https://runko-omega.vercel.app/reset-password' })
  const unknown = await requestPasswordReset(c, { email: 'nihce@primer.si', redirectTo: 'https://runko-omega.vercel.app/reset-password' })
  check('known address → link sent to the reset page', known.ok && c.auth.emails.length === 1 && c.auth.calls[0][1].options.redirectTo.endsWith('/reset-password'))
  check('unknown address → the same answer, nothing sent', unknown.ok && unknown.message === known.message && c.auth.emails.length === 1)
  check('not an email address → caught before the server', fails(await requestPasswordReset(c, { email: 'ana' }), 'invalid_email'))
  c.auth.emailQuotaHit = true
  check('asked again too soon / email quota → wait message, not English', fails(await requestPasswordReset(c, { email: 'ana@primer.si' }), 'email_rate_limited'))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — forgot password, the emailed link:')
{
  const parse = (url) => {
    const u = new URL(url)
    return parseAuthUrl({ hash: u.hash, search: u.search })
  }
  const good = parse('https://app/reset-password#access_token=abc&refresh_token=def&type=recovery')
  check('a working link is a recovery link', good.recoveryLink && !good.failed && !good.tokenHash)
  const expired = parse('https://app/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  check('expired or used link (hash) → failed, code kept', expired.failed && expired.errorCode === 'otp_expired' && !expired.recoveryLink)
  check('expired link via query string (PKCE) → failed', parse('https://app/reset-password?error=access_denied&error_code=otp_expired').failed)
  check('a failed link on "/" is moved to the reset page, hash intact',
    failedLinkTarget({ pathname: '/', hash: '#error=access_denied&error_code=otp_expired', search: '' }) === '/reset-password#error=access_denied&error_code=otp_expired')
  check('already on the reset page → stays', failedLinkTarget({ pathname: '/reset-password', hash: '#error_code=otp_expired', search: '' }) === null)
  check('an ordinary URL is left alone', failedLinkTarget({ pathname: '/plan', hash: '', search: '?x=1' }) === null)
  check('signup confirmation link is not a recovery', !parse('https://app/#access_token=abc&type=signup').recoveryLink)
  check('type=recovery with no tokens is not a recovery (typed URL)', !parse('https://app/#type=recovery').recoveryLink && !parse('https://app/?type=recovery').recoveryLink)
  const pending = parse('https://app/reset-password?token_hash=h1&type=recovery')
  check('a token_hash link waits for the runner: not yet a recovery', pending.tokenHash === 'h1' && pending.tokenType === 'recovery' && !pending.recoveryLink)

  // The claim in the URL against how the session was really obtained.
  const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`
  const recoverySession = { access_token: jwt({ amr: [{ method: 'recovery', timestamp: 1 }] }) }
  const passwordSession = { access_token: jwt({ amr: [{ method: 'password', timestamp: 1 }] }) }
  check('session methods are read from the token', sessionAuthMethods(recoverySession)[0] === 'recovery' && sessionAuthMethods(passwordSession)[0] === 'password')
  check('a recovery session backs a recovery URL', recoveryClaimHolds(recoverySession))
  check('a password session does NOT: a typed recovery URL cannot open the reset form', !recoveryClaimHolds(passwordSession))
  check('no session → no recovery', !recoveryClaimHolds(null))
  check('unreadable token → the claim stands (old behaviour)', recoveryClaimHolds({ access_token: 'garbage' }) && sessionAuthMethods({ access_token: 'garbage' }).length === 0)

  // token_hash links: spent by the button, once.
  const c = client()
  c.auth.seed('ana@primer.si', 'starogeslo')
  c.auth.seed('bor@primer.si', 'borovogeslo')
  const hash = c.auth.issueLink('ana@primer.si')
  await logIn(c, { email: 'bor@primer.si', password: 'borovogeslo' })
  const first = await confirmEmailLink(c, { tokenHash: hash, type: 'recovery' })
  check('link opened while signed in as someone else → the session becomes the link\'s account', first.ok && first.recovery && c.auth.session.user.email === 'ana@primer.si')
  check('used link → "link no longer works"', fails(await confirmEmailLink(c, { tokenHash: hash, type: 'recovery' }), 'link_invalid'))
  check('unknown / expired link → the same', fails(await confirmEmailLink(c, { tokenHash: 'nope', type: 'recovery' }), 'link_invalid'))
  check('no token at all → the same, no call', fails(await confirmEmailLink(c, {}), 'link_invalid'))
  const other = client()
  other.auth.seed('ana@primer.si', 'starogeslo')
  const h2 = other.auth.issueLink('ana@primer.si')
  other.auth.offline = true
  check('offline while confirming → network message, the link is NOT declared dead', fails(await confirmEmailLink(other, { tokenHash: h2, type: 'recovery' }), 'network') && other.auth.tokens.get(h2).used === false)
  // A link works in any browser: nothing about it depends on local state.
  const phone = { auth: other.auth }
  other.auth.offline = false
  check('link opened on a different device or browser works', (await confirmEmailLink(phone, { tokenHash: h2, type: 'recovery' })).ok)
}

// ---------------------------------------------------------------------------
console.log('\nAuth — forgot password, new password form:')
{
  const c = client()
  c.auth.seed('ana@primer.si', 'starogeslo', { elsewhere: 2 })
  await confirmEmailLink(c, { tokenHash: c.auth.issueLink('ana@primer.si'), type: 'recovery' })
  const calls = () => c.auth.calls.filter(([n]) => n === 'updateUser').length
  check('too short → stopped before the server', fails(await setNewPassword(c, { password: '123', confirm: '123', email: 'ana@primer.si' }), 'too_short') && calls() === 0)
  check('the two fields differ → stopped before the server', fails(await setNewPassword(c, { password: 'novogeslo1', confirm: 'novogeslo2', email: 'ana@primer.si' }), 'mismatch') && calls() === 0)
  check('same as the old password → says so', fails(await setNewPassword(c, { password: 'starogeslo', confirm: 'starogeslo', email: 'ana@primer.si' }), 'same_password'))
  const done = await setNewPassword(c, { password: 'novogeslo1', confirm: 'novogeslo1', email: 'ana@primer.si' })
  check('new password saved', done.ok && c.auth.users.get('ana@primer.si').password === 'novogeslo1')
  check('the recovery session is swapped for an ordinary one', done.reLoggedIn && c.auth.session.via === 'password')
  check('sessions on other devices are revoked', c.auth.otherSessions.get('ana@primer.si') === 0 && c.auth.calls.at(-1)[1].scope === 'others')
  check('the old password no longer logs in', (await logIn(c, { email: 'ana@primer.si', password: 'starogeslo' })).code === 'invalid_credentials')
  check('the new one does', (await logIn(c, { email: 'ana@primer.si', password: 'novogeslo1' })).ok)

  const gone = client()
  gone.auth.seed('ana@primer.si', 'starogeslo')
  check('recovery session already gone → "request a new link"', fails(await setNewPassword(gone, { password: 'novogeslo1', confirm: 'novogeslo1', email: 'ana@primer.si' }), 'session_missing'))
  const strict = client({ minPassword: 8 })
  strict.auth.seed('ana@primer.si', 'starogeslo')
  await logIn(strict, { email: 'ana@primer.si', password: 'starogeslo' })
  check('server-side weak password → translated', fails(await setNewPassword(strict, { password: '1234567', confirm: '1234567' }), 'weak_password'))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — change password while logged in:')
{
  const c = client()
  c.auth.seed('ana@primer.si', 'starogeslo', { elsewhere: 3 })
  await logIn(c, { email: 'ana@primer.si', password: 'starogeslo' })
  const args = { email: 'ana@primer.si', current: 'starogeslo', next: 'novogeslo1', confirm: 'novogeslo1' }
  const updates = () => c.auth.calls.filter(([n]) => n === 'updateUser').length
  check('current password missing → asked for', fails(await changePassword(c, { ...args, current: '' }), 'wrong_current_password') && updates() === 0)
  check('wrong current password → refused, nothing changed', fails(await changePassword(c, { ...args, current: 'ugibam' }), 'wrong_current_password') && updates() === 0 && c.auth.users.get('ana@primer.si').password === 'starogeslo')
  check('new password too short → stopped', fails(await changePassword(c, { ...args, next: '12', confirm: '12' }), 'too_short') && updates() === 0)
  check('confirmation differs → stopped', fails(await changePassword(c, { ...args, confirm: 'drugace12' }), 'mismatch') && updates() === 0)
  check('new equals current → stopped', fails(await changePassword(c, { ...args, next: 'starogeslo', confirm: 'starogeslo' }), 'same_password') && updates() === 0)
  const before = c.auth.calls.length
  const done = await changePassword(c, args)
  const order = c.auth.calls.slice(before).map(([n]) => n)
  check('right current password → changed', done.ok && c.auth.users.get('ana@primer.si').password === 'novogeslo1' && SLOVENIAN_ONLY(done.message))
  check('the current password is verified with the server BEFORE the change', order.join() === 'signInWithPassword,updateUser,signOut')
  check('other devices are signed out, this one stays in', c.auth.otherSessions.get('ana@primer.si') === 0 && c.auth.session?.user.email === 'ana@primer.si')
  c.auth.offline = true
  check('offline → network message, not "wrong password"', fails(await changePassword(c, { ...args, current: 'novogeslo1', next: 'tretjegeslo', confirm: 'tretjegeslo' }), 'network'))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — change email:')
{
  const settings = fs.readFileSync('src/pages/Settings.jsx', 'utf8')
  check('not supported: no code path changes the email address', !/updateUser\(\s*\{\s*email/.test(settings + fs.readFileSync('src/core/auth-flows.js', 'utf8')))
  check('and Settings offers no control for it (the address is read-only)', !/type="email"(?![^>]*readOnly)/.test(settings))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — log out and session expiry:')
{
  const c = client()
  c.auth.seed('ana@primer.si', 'pravogeslo', { elsewhere: 2 })
  await logIn(c, { email: 'ana@primer.si', password: 'pravogeslo' })
  const out = await signOutHere(c)
  check('signs out of this browser', out.ok && c.auth.session === null)
  check('and only this one: the phone stays signed in', c.auth.calls.at(-1)[1].scope === 'local' && c.auth.otherSessions.get('ana@primer.si') === 2)
  await logIn(c, { email: 'ana@primer.si', password: 'pravogeslo' })
  c.auth.offline = true
  const stuck = await signOutHere(c)
  check('offline: the SDK keeps the session, and the flow reports it so the app can drop it', stuck.ok === false && stuck.stuck === true && c.auth.session !== null)

  // Which startup errors mean "this session is dead" (sign out) and which
  // mean "no answer" (keep the session).
  check('revoked / deleted user (403) → dead', isDeadSessionError(apiError('User from sub claim in JWT does not exist', 403, 'user_not_found')))
  check('session not found → dead', isDeadSessionError(apiError('Session from session_id claim in JWT does not exist', 403, 'session_not_found')))
  check('no session at all → dead', isDeadSessionError(sessionMissing()))
  check('offline → NOT dead: a tunnel must not sign the runner out', !isDeadSessionError(networkError()) && !isDeadSessionError(new TypeError('Failed to fetch')))
  check('server error (500) → NOT dead', !isDeadSessionError(apiError('Internal error', 500, 'unexpected_failure')))
  check('no error → not dead', !isDeadSessionError(null))

  const ctx = fs.readFileSync('src/context/AuthContext.jsx', 'utf8')
  check('startup only clears a session the server has rejected', /if \(error && isDeadSessionError\(error\)\)/.test(ctx))
  check('an ended session is announced on the login screen', /setSessionEnded\(true\)/.test(ctx) && fs.readFileSync('src/pages/Auth.jsx', 'utf8').includes('t.auth.sessionEnded'))
  check('the profile is reloaded per USER, not per token refresh', /\[userId, profileAttempt\]/.test(ctx))
  check('a failed profile read is not treated as "no profile"', /profileError/.test(ctx) && /if \(profileError( \|\| accessError)?\) return <ProfileLoadError \/>/.test(fs.readFileSync('src/App.jsx', 'utf8')))
  const web = ['src/context/AuthContext.jsx', 'src/pages/Auth.jsx', 'src/pages/ResetPassword.jsx', 'src/pages/Settings.jsx', 'src/core/auth-flows.js']
    .map((f) => fs.readFileSync(f, 'utf8')).join('\n')
  check('no sign-out in the web app uses the every-device default', !/auth\.signOut\(\s*\)/.test(web))
}

// ---------------------------------------------------------------------------
console.log('\nAuth — every error in Slovenian, never raw Supabase English:')
{
  const RAW = [
    apiError('Invalid login credentials', 400, 'invalid_credentials'),
    apiError('Email not confirmed', 400, 'email_not_confirmed'),
    apiError('User already registered', 422, 'user_already_exists'),
    apiError('Password should be at least 6 characters.', 422, 'weak_password'),
    apiError('New password should be different from the old password.', 422, 'same_password'),
    apiError('Unable to validate email address: invalid format', 400, 'validation_failed'),
    apiError('Email address "a@b" is invalid', 400, 'email_address_invalid'),
    apiError('For security purposes, you can only request this after 37 seconds.', 429, 'over_email_send_rate_limit'),
    apiError('Request rate limit reached', 429, 'over_request_rate_limit'),
    apiError('Signups not allowed for this instance', 422, 'signup_disabled'),
    apiError('Email link is invalid or has expired', 403, 'otp_expired'),
    apiError('Session from session_id claim in JWT does not exist', 403, 'session_not_found'),
    apiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    apiError('User is banned', 400, 'user_banned'),
    apiError('Something nobody has seen before', 500, 'unexpected_failure'),
    // Older servers: text only, no code.
    { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 },
    { name: 'AuthApiError', message: 'User already registered', status: 400 },
    { name: 'AuthApiError', message: 'Email rate limit exceeded', status: 429 },
    sessionMissing(), networkError(), new TypeError('Failed to fetch'), new Error('weird'), null, undefined, {},
  ]
  const all = RAW.map((e) => describeAuthError(e))
  check('every error maps to a code and a Slovenian message', all.every((d) => d.code && SLOVENIAN_ONLY(d.message)))
  check('none returns the error\'s own text', RAW.every((e, i) => !e?.message || all[i].message !== e.message))
  check('codeless old-server errors still map by text', all[15].code === 'invalid_credentials' && all[16].code === 'user_exists' && all[17].code === 'email_rate_limited')
  check('unknown errors get the generic line', all[14].code === 'generic' && all[21].code === 'generic' && all[14].message === t.errors.generic)
  check('every message produced by the flows above passed the same check', RAW_SUPABASE.length > 25 && RAW_SUPABASE.every(SLOVENIAN_ONLY))

  // Data calls (profile, runs, plan): the same rule outside the auth screens.
  check('expired JWT on a data call → "session no longer valid"', friendlyError({ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }) === t.errors.sessionInvalid)
  check('RLS refusal → "not allowed"', friendlyError({ code: '42501', message: 'new row violates row-level security policy for table "workouts"', details: null, hint: null }) === t.errors.notAllowed)
  check('unknown database error → generic, not its text', friendlyError({ code: 'XX000', message: 'internal error', details: 'x', hint: null }) === t.errors.generic)
  check('offline → network', friendlyError(new TypeError('Failed to fetch')) === t.errors.network)
  check('an auth error on a data path → Slovenian too', SLOVENIAN_ONLY(friendlyError(sessionMissing())))
  check('a message core wrote for the runner passes through', friendlyError(new Error(t.errors.linkFailed)) === t.errors.linkFailed)
  check('the message for a profile that cannot be linked exists (was undefined)', typeof t.errors.linkFailed === 'string' && fs.readFileSync('src/core/db.js', 'utf8').includes('t.errors.linkFailed') && !('profileLink' in t.errors))

  const pages = ['Auth', 'ResetPassword', 'Settings', 'Chat', 'Log', 'Dashboard', 'Onboarding'].map((p) => `src/pages/${p}.jsx`)
  const shown = [...pages, 'src/components/HealthProfile.jsx'].filter((f) => /set\w*Error\w*\(\s*err(or)?\.message\s*\)/.test(fs.readFileSync(f, 'utf8')))
  check(`no screen shows a raw error message (${shown.join(', ') || 'none'})`, shown.length === 0)
}

// ---------------------------------------------------------------------------
console.log('\nAuth — the reset form is only for a recovery:')
{
  const reset = fs.readFileSync('src/pages/ResetPassword.jsx', 'utf8')
  check('an ordinary signed-in session is sent to Settings, not shown the form', /!recovery && !linkFailed && !awaitingConfirm && session[\s\S]{0,80}Navigate to="\/settings"/.test(reset))
  check('a token_hash link is spent only by the button', /onClick=\{confirmLink\}/.test(reset) && !/useEffect/.test(reset))
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  check('the login screen redirects a signed-in runner home', /if \(session\) return <Navigate to="\/" replace \/>/.test(app))
  const dash = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8')
  check('the cached daily message is per account', /runko_motd_\$\{profile\.id\}_/.test(dash))
}

export default summary('auth')
