/**
 * auth-url.js — reading the links Supabase emails, as pure functions.
 *
 * An emailed link comes back to the app in one of three shapes:
 *
 *   #access_token=…&type=recovery          the link worked (implicit flow);
 *                                          the SDK turns it into a session
 *   #error=…&error_code=otp_expired        the link was rejected: expired,
 *   ?error=…&error_code=…                  already used, or superseded
 *   ?token_hash=…&type=recovery            a link to the app itself, which is
 *                                          only spent when the runner presses
 *                                          a button (see AUTH_CHECKLIST.md:
 *                                          mail scanners open links, and an
 *                                          opened one-time link is a used one)
 *
 * Nothing here touches window or the SDK, so every case is tested without a
 * browser (tests/auth.test.mjs). See ./README.md for the core rules.
 */

const params = (s, lead) => new URLSearchParams(String(s || '').replace(lead, ''))

/**
 * @param {{hash?: string, search?: string}} location
 * @returns {{
 *   recoveryLink: boolean,   a working recovery link: tokens and type=recovery in the hash
 *   failed: boolean,         the link was rejected
 *   errorCode: string|null,
 *   errorDescription: string|null,
 *   tokenHash: string|null,  a link still to be confirmed by the runner
 *   tokenType: string|null,
 * }}
 */
export function parseAuthUrl({ hash = '', search = '' } = {}) {
  let h
  let q
  try {
    h = params(hash, /^#/)
    q = params(search, /^\?/)
  } catch {
    return { recoveryLink: false, failed: false, errorCode: null, errorDescription: null, tokenHash: null, tokenType: null }
  }
  const errorCode = h.get('error_code') || q.get('error_code')
  const failed = Boolean(errorCode || h.get('error') || q.get('error'))
  const tokenHash = q.get('token_hash')
  return {
    // Only tokens make a link a recovery: `type=recovery` on its own (a typed
    // URL, or a token_hash link nobody has confirmed yet) gives no session.
    recoveryLink: !failed && h.get('type') === 'recovery' && h.has('access_token'),
    failed,
    errorCode: errorCode || null,
    errorDescription: h.get('error_description') || q.get('error_description') || null,
    tokenHash: !failed && tokenHash ? tokenHash : null,
    tokenType: !failed && tokenHash ? q.get('type') || 'recovery' : null,
  }
}

/** Where every emailed link that did not work is explained. */
export const FAILED_LINK_PATH = '/reset-password'

/**
 * A rejected link can land on any path (Supabase falls back to the Site URL
 * when the redirect is not on its allow-list). Returns the URL to show
 * instead, or null when the runner is already in the right place.
 */
export function failedLinkTarget({ pathname = '/', hash = '', search = '' } = {}) {
  const { failed } = parseAuthUrl({ hash, search })
  if (!failed || pathname === FAILED_LINK_PATH) return null
  return `${FAILED_LINK_PATH}${search || ''}${hash || ''}`
}

/**
 * How a session was obtained, from its access token: ["password"],
 * ["recovery"], ["otp"]… Supabase writes this into the token's `amr` claim.
 * Returns [] when it cannot be read, which callers treat as "unknown".
 */
export function sessionAuthMethods(session) {
  try {
    const payload = String(session?.access_token || '').split('.')[1]
    if (!payload) return []
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    const amr = JSON.parse(json).amr
    if (!Array.isArray(amr)) return []
    return amr.map((m) => (typeof m === 'string' ? m : m?.method)).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Does a URL that claims to be a recovery link deserve the reset screen?
 *
 * The screen sets a password without asking for the current one, so a URL
 * alone must not open it for a session that was plainly obtained another way
 * (anyone at an unlocked browser can type `#access_token=x&type=recovery`).
 * Unknown methods keep the old behaviour: the claim stands.
 */
export function recoveryClaimHolds(session) {
  if (!session) return false
  const methods = sessionAuthMethods(session)
  return methods.length === 0 || methods.includes('recovery')
}
