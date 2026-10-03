/**
 * http.ts — the response helpers every Runko Edge Function shares.
 *
 * Errors are `{ error: { message, code } }`: `message` is Slovenian and
 * written for a runner, so the app can show it as-is; `code` is for the app
 * to branch on. Internals are logged, never returned.
 */

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

export const fail = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) =>
  json({ error: { message, code, ...extra } }, status)

export const BUSY = 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.'
export const UNAVAILABLE = 'Storitev trenutno ni na voljo.'
