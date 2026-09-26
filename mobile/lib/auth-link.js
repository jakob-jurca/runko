/**
 * Reads the link Supabase sends in the password reset email once it opens the
 * app (runko://reset-password#access_token=…&refresh_token=…&type=recovery).
 * Pure, so it is tested without a device. Tokens arrive in the fragment for
 * the implicit flow; errors (expired, already used) may sit in either part.
 */
function params(str) {
  const out = {}
  for (const pair of (str || '').split('&')) {
    if (!pair) continue
    const i = pair.indexOf('=')
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i))
    const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}

export function parseAuthLink(url) {
  if (!url || typeof url !== 'string') return { kind: null }
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt + 1) : ''
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url
  const queryAt = beforeHash.indexOf('?')
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : ''
  let p
  try {
    p = { ...params(query), ...params(hash) }
  } catch {
    return { kind: null }
  }
  if (p.error_code || p.error) return { kind: 'error', errorCode: p.error_code || p.error }
  if (p.type === 'recovery' && p.access_token && p.refresh_token) {
    return { kind: 'recovery', accessToken: p.access_token, refreshToken: p.refresh_token }
  }
  return { kind: null }
}
