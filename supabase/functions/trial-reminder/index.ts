/**
 * trial-reminder — once a day, email runners whose trial ends in 2 days.
 *
 * DISABLED until Resend and the domain are set up: it does nothing unless
 * the Supabase secret TRIAL_REMINDER_ENABLED is "true" AND RESEND_API_KEY and
 * EMAIL_FROM are set. Until then a run answers { skipped: 'disabled' }.
 *
 * Called by pg_cron (see PROGRESS.md "Before launch"), never by the app. It
 * is deployed with --no-verify-jwt and checks its own secret instead:
 * Authorization: Bearer <CRON_SECRET>.
 *
 * Secrets: TRIAL_REMINDER_ENABLED, RESEND_API_KEY, EMAIL_FROM
 * ("Runko <pozdrav@domena.si>"), CRON_SECRET, APP_URL (https://<domain>).
 *
 * Deploy: npx supabase@latest functions deploy trial-reminder --no-verify-jwt
 */

// @ts-ignore — resolved by Deno at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — plain JS, shared with the tests.
import { dueForReminder, trialReminderEmail, WINDOW_TO_MS } from '../_shared/trial-reminder.js'

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!cronSecret || auth !== cronSecret) return reply(401, { error: 'unauthorized' })

  const enabled = Deno.env.get('TRIAL_REMINDER_ENABLED') === 'true'
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  if (!enabled || !resendKey || !from) return reply(200, { skipped: 'disabled' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('APP_URL') ?? 'https://runko-omega.vercel.app'
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const now = new Date()
  const { data: rows, error } = await admin
    .from('subscriptions')
    .select('user_id, status, tier, billing_interval, trial_end, cancel_at_period_end, trial_reminder_sent_for')
    .eq('status', 'trialing')
    .gt('trial_end', now.toISOString())
    .lte('trial_end', new Date(now.getTime() + WINDOW_TO_MS).toISOString())
  if (error) {
    console.error('trial-reminder: lookup failed', error.message)
    return reply(500, { error: 'lookup failed' })
  }

  let sent = 0
  for (const row of dueForReminder(rows ?? [], now)) {
    const { data: userData } = await admin.auth.admin.getUserById(row.user_id)
    const email = userData?.user?.email
    if (!email) continue
    const { data: profile } = await admin.from('users').select('name').eq('id', row.user_id).maybeSingle()
    const mail = trialReminderEmail({
      name: (profile?.name ?? '').split(' ')[0],
      tier: row.tier ?? 'start',
      interval: row.billing_interval ?? 'month',
      trialEnd: row.trial_end,
      appUrl,
    })
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: mail.subject, text: mail.text, html: mail.html }),
    })
    if (!res.ok) {
      console.error('trial-reminder: send failed', row.user_id, res.status, await res.text())
      continue
    }
    // Remembered per trial end, so a rerun the same day sends nothing twice.
    await admin.from('subscriptions').update({ trial_reminder_sent_for: row.trial_end }).eq('user_id', row.user_id)
    sent++
  }
  return reply(200, { sent })
})
