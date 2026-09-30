/**
 * auth-flows.js — every account flow, as functions of a Supabase client.
 *
 *   signUp · logIn · requestPasswordReset · resendConfirmation
 *   confirmEmailLink · setNewPassword · changePassword · signOutHere
 *
 * Each takes the client as its first argument and returns a plain result:
 *
 *   { ok: true, … }                         or
 *   { ok: false, code, message }            message is Slovenian, ready to show
 *
 * Two reasons for the shape. The screens (web and mobile) stay thin and show
 * the same words for the same failure. And nothing here imports the real
 * client, so the whole file runs under plain Node against a fake one
 * (tests/auth.test.mjs): every flow is tested without a browser.
 *
 * A runner never sees Supabase's English: describeAuthError maps every error
 * to one of the messages in strings.js, and an unknown one to a generic line.
 *
 * Platform-agnostic. See ./README.md for the core rules.
 */
import { t } from './strings.js'

const A = t.auth

/** Supabase's default minimum; a stricter project setting answers weak_password, which is translated. */
export const MIN_PASSWORD_LENGTH = 6

/** Keyboards add a trailing space and a capital letter; Supabase stores addresses in lower case. */
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const fail = (code, message) => ({ ok: false, code, message })

const MESSAGES = {
  invalid_credentials: A.errors.invalidCredentials,
  email_not_confirmed: A.errors.emailNotConfirmed,
  user_exists: A.errors.userExists,
  weak_password: t.reset.weakPassword,
  same_password: t.reset.samePassword,
  invalid_email: A.errors.invalidEmail,
  rate_limited: t.reset.rateLimited,
  email_rate_limited: A.errors.emailRateLimited,
  signup_disabled: A.errors.signupDisabled,
  session_missing: A.errors.sessionMissing,
  reauth_needed: A.errors.sessionMissing,
  link_invalid: t.reset.linkInvalid,
  banned: A.errors.banned,
  network: t.errors.network,
  generic: t.errors.generic,
}

/** Supabase error codes (the stable part of an error) → ours. */
const BY_CODE = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_exists',
  email_exists: 'user_exists',
  weak_password: 'weak_password',
  same_password: 'same_password',
  email_address_invalid: 'invalid_email',
  email_address_not_authorized: 'invalid_email',
  over_email_send_rate_limit: 'email_rate_limited',
  over_request_rate_limit: 'rate_limited',
  signup_disabled: 'signup_disabled',
  email_provider_disabled: 'signup_disabled',
  session_not_found: 'session_missing',
  session_expired: 'session_missing',
  refresh_token_not_found: 'session_missing',
  refresh_token_already_used: 'session_missing',
  bad_jwt: 'session_missing',
  user_not_found: 'session_missing',
  reauthentication_needed: 'reauth_needed',
  otp_expired: 'link_invalid',
  flow_state_expired: 'link_invalid',
  flow_state_not_found: 'link_invalid',
  user_banned: 'banned',
}

/** Older servers send only English text; these keep the mapping working there. */
const BY_MESSAGE = [
  [/invalid login credentials|invalid email or password/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/already (been )?registered|already exists/i, 'user_exists'],
  [/different from the old/i, 'same_password'],
  [/password should be|weak/i, 'weak_password'],
  [/unable to validate email|invalid format|email address .* is invalid/i, 'invalid_email'],
  [/for security purposes, you can only request this|email rate limit/i, 'email_rate_limited'],
  [/rate limit|too many requests/i, 'rate_limited'],
  [/signups? not allowed|signup is disabled/i, 'signup_disabled'],
  [/session missing|session (not found|expired)|jwt/i, 'session_missing'],
  [/link is invalid or has expired|token has expired/i, 'link_invalid'],
  [/failed to fetch|network|load failed/i, 'network'],
]

/**
 * Any error from supabase.auth → { code, message }, message in Slovenian.
 * Never returns the error's own text.
 */
export function describeAuthError(err) {
  const name = err?.name || ''
  const raw = String(err?.message || '')
  let code = BY_CODE[err?.code] || null
  if (!code && name === 'AuthWeakPasswordError') code = 'weak_password'
  if (!code && name === 'AuthSessionMissingError') code = 'session_missing'
  // No answer from the server at all: offline, DNS, a gateway that timed out.
  if (!code && (name === 'AuthRetryableFetchError' || err instanceof TypeError)) code = 'network'
  if (!code) code = BY_MESSAGE.find(([re]) => re.test(raw))?.[1] || null
  if (!code && err?.status === 429) code = 'rate_limited'
  if (!code) code = 'generic'
  return { code, message: MESSAGES[code] }
}

/**
 * Is a stored session beyond saving? True only when the auth server has said
 * so (the user is gone, the token was revoked). A request that never got an
 * answer is NOT that: signing a runner out because the train went through a
 * tunnel is the bug this guards against.
 */
export function isDeadSessionError(err) {
  if (!err) return false
  if (err.name === 'AuthSessionMissingError') return true
  if (['session_missing', 'banned'].includes(BY_CODE[err.code])) return true
  if (err.name === 'AuthRetryableFetchError' || err instanceof TypeError) return false
  return [401, 403, 404].includes(err.status)
}

function failFrom(error) {
  const { code, message } = describeAuthError(error)
  return fail(code, message)
}

function checkNewPassword(password, confirm) {
  if (String(password || '').length < MIN_PASSWORD_LENGTH) return fail('too_short', t.reset.tooShort(MIN_PASSWORD_LENGTH))
  if (confirm !== undefined && password !== confirm) return fail('mismatch', t.reset.mismatch)
  return null
}

/** Run one SDK call; a thrown error (the SDK throws on some network failures) is a result too. */
async function attempt(call) {
  try {
    const { data, error } = await call()
    return { data: data ?? null, error: error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

// ---------------------------------------------------------------------------
// Sign up, log in
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{ok: true, needsConfirmation: boolean}|{ok: false, code: string, message: string}>}
 */
export async function signUp(client, { email, password, redirectTo } = {}) {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return fail('invalid_email', MESSAGES.invalid_email)
  const bad = checkNewPassword(password)
  if (bad) return bad

  const { data, error } = await attempt(() =>
    client.auth.signUp({ email: address, password, ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}) }))
  if (error) return failFrom(error)

  // With email confirmation on, Supabase answers a signup for an address that
  // already has an account with a made-up user and NO error (so the endpoint
  // cannot be used to list accounts). The tell is an empty identities list.
  // No email is sent in that case, so "check your inbox" would strand them.
  if (!data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
    return fail('user_exists', MESSAGES.user_exists)
  }
  return { ok: true, needsConfirmation: !data?.session }
}

/**
 * @returns {Promise<{ok: true}|{ok: false, code: string, message: string}>}
 *   code 'invalid_credentials' covers a wrong password AND an unknown address:
 *   Supabase does not say which, and neither do we.
 */
export async function logIn(client, { email, password } = {}) {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return fail('invalid_email', MESSAGES.invalid_email)
  if (!password) return fail('invalid_credentials', MESSAGES.invalid_credentials)
  const { error } = await attempt(() => client.auth.signInWithPassword({ email: address, password }))
  if (error) return failFrom(error)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Emails: reset link, confirmation link
// ---------------------------------------------------------------------------

/**
 * Ask for a reset link. The answer is the same whether or not the address has
 * an account, so this cannot be used to find out who has one.
 */
export async function requestPasswordReset(client, { email, redirectTo } = {}) {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return fail('invalid_email', MESSAGES.invalid_email)
  const { error } = await attempt(() => client.auth.resetPasswordForEmail(address, redirectTo ? { redirectTo } : undefined))
  if (error) return failFrom(error)
  return { ok: true, message: A.forgotSent }
}

/** Send the signup confirmation email again (for "email not confirmed"). */
export async function resendConfirmation(client, { email, redirectTo } = {}) {
  const address = normalizeEmail(email)
  if (!looksLikeEmail(address)) return fail('invalid_email', MESSAGES.invalid_email)
  const { error } = await attempt(() =>
    client.auth.resend({ type: 'signup', email: address, ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}) }))
  if (error) return failFrom(error)
  return { ok: true, message: A.confirmResent }
}

/**
 * Spend a `?token_hash=…` link (auth-url.js). Called from a button, never on
 * page load: a mail scanner that opens the link must not use it up.
 */
export async function confirmEmailLink(client, { tokenHash, type = 'recovery' } = {}) {
  if (!tokenHash) return fail('link_invalid', MESSAGES.link_invalid)
  const { error } = await attempt(() => client.auth.verifyOtp({ token_hash: tokenHash, type }))
  if (error) {
    const described = describeAuthError(error)
    // Whatever the server's reason, to the runner the link did not work.
    return described.code === 'network' || described.code === 'rate_limited'
      ? fail(described.code, described.message)
      : fail('link_invalid', MESSAGES.link_invalid)
  }
  return { ok: true, recovery: type === 'recovery' }
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/**
 * Finish a password reset: the session is the one the emailed link created.
 *
 * After saving, the recovery session is swapped for an ordinary one by
 * signing in with the new password (which also proves it works), and every
 * other session — the recovery one, and anything still signed in elsewhere
 * on the old password — is revoked.
 */
export async function setNewPassword(client, { password, confirm, email } = {}) {
  const bad = checkNewPassword(password, confirm)
  if (bad) return bad

  const { error } = await attempt(() => client.auth.updateUser({ password }))
  if (error) return failFrom(error)

  let reLoggedIn = false
  if (email) {
    const signIn = await attempt(() => client.auth.signInWithPassword({ email: normalizeEmail(email), password }))
    // If this fails the password is still changed and the session still
    // valid, so the reset has succeeded; only the clean-up is skipped.
    reLoggedIn = !signIn.error
    if (reLoggedIn) await attempt(() => client.auth.signOut({ scope: 'others' }))
  }
  return { ok: true, reLoggedIn }
}

/**
 * Change the password while signed in. The current password is required and
 * checked with the auth server first, so an unlocked laptop is not enough.
 */
export async function changePassword(client, { email, current, next, confirm } = {}) {
  if (!current) return fail('wrong_current_password', A.errors.currentRequired)
  const bad = checkNewPassword(next, confirm)
  if (bad) return bad
  if (next === current) return fail('same_password', MESSAGES.same_password)
  const address = normalizeEmail(email)
  if (!address) return fail('session_missing', MESSAGES.session_missing)

  const check = await attempt(() => client.auth.signInWithPassword({ email: address, password: current }))
  if (check.error) {
    const described = describeAuthError(check.error)
    return described.code === 'invalid_credentials'
      ? fail('wrong_current_password', A.errors.wrongCurrentPassword)
      : fail(described.code, described.message)
  }

  const { error } = await attempt(() => client.auth.updateUser({ password: next }))
  if (error) return failFrom(error)

  // Everything still signed in on the old password, on any device, ends here.
  await attempt(() => client.auth.signOut({ scope: 'others' }))
  return { ok: true, message: t.settings.account.passwordChanged }
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

/**
 * Sign out of THIS browser or phone. The SDK's default is every device, which
 * meant logging out on a laptop quietly logged the phone out too.
 *
 * @returns {Promise<{ok: true}|{ok: false, stuck: true}>} `stuck`: the server
 *   could not be reached and the SDK kept the session; the caller must drop
 *   its stored copy so that signing out works offline too.
 */
export async function signOutHere(client) {
  const { error } = await attempt(() => client.auth.signOut({ scope: 'local' }))
  return error ? { ok: false, stuck: true } : { ok: true }
}
