/**
 * errors.js — what a runner reads when a data call fails.
 *
 * Supabase answers in English, for developers: "JWT expired", "new row
 * violates row-level security policy for table …". None of that belongs on
 * screen. friendlyError turns any thrown value into one Slovenian sentence.
 *
 * Errors that core itself throws (new Error(t.errors.…)) are already written
 * for a runner and pass through unchanged; they are recognised by NOT looking
 * like a Supabase error (no code, details or hint, no Auth* name).
 *
 * Platform-agnostic. See ./README.md for the core rules.
 */
import { t } from './strings.js'
import { describeAuthError } from './auth-flows.js'

const E = t.errors

/** Postgres / PostgREST codes → message. */
const BY_CODE = {
  PGRST301: E.sessionInvalid, // JWT expired
  PGRST302: E.sessionInvalid, // anonymous access is disabled
  23505: E.duplicate, // unique_violation
  23502: E.invalidValue, // not_null_violation
  23514: E.invalidValue, // check_violation
  '22P02': E.invalidValue, // invalid_text_representation
  22003: E.invalidValue, // numeric_value_out_of_range
  42501: E.notAllowed, // insufficient_privilege (RLS)
}

/**
 * @param {unknown} err - anything a catch block receives
 * @returns {string} one sentence in Slovenian, safe to show
 */
export function friendlyError(err) {
  if (!err) return E.generic
  // Offline, DNS, CORS: fetch rejects with a TypeError.
  if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err.message || ''))) return E.network
  if (typeof err.name === 'string' && err.name.startsWith('Auth')) {
    const { code, message } = describeAuthError(err)
    return code === 'session_missing' ? E.sessionInvalid : message
  }
  const fromSupabase = 'code' in Object(err) || 'details' in Object(err) || 'hint' in Object(err)
  if (fromSupabase) {
    if (BY_CODE[err.code]) return BY_CODE[err.code]
    if (err.status === 401 || /jwt/i.test(String(err.message || ''))) return E.sessionInvalid
    if (err.status === 403 || /row-level security|permission denied/i.test(String(err.message || ''))) return E.notAllowed
    return E.generic
  }
  // Thrown by core for the runner to read.
  return typeof err.message === 'string' && err.message ? err.message : E.generic
}
