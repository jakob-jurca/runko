/**
 * trial-reminder.js — the "your trial ends in 2 days" email. Pure: who is due
 * and what they are sent. The trial-reminder function does the I/O.
 *
 * Plain JS, imported by the function under Deno and by the tests under Node.
 */
import { PRICES } from './stripe.js'

/** The email goes out when the trial ends between 24 and 48 hours from the run. */
export const WINDOW_FROM_MS = 24 * 60 * 60 * 1000
export const WINDOW_TO_MS = 48 * 60 * 60 * 1000

/**
 * Subscriptions rows that should get the email now: trialing, ending within
 * the window, and not yet reminded for this trial end. Run once a day, every
 * trial falls in the window exactly once.
 */
export function dueForReminder(rows, now = new Date()) {
  const from = now.getTime() + WINDOW_FROM_MS
  const to = now.getTime() + WINDOW_TO_MS
  return rows.filter((r) => {
    if (r.status !== 'trialing' || !r.trial_end || r.cancel_at_period_end) return false
    const end = new Date(r.trial_end).getTime()
    if (end <= from || end > to) return false
    return !r.trial_reminder_sent_for || new Date(r.trial_reminder_sent_for).getTime() !== end
  })
}

const euros = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * @param {object} input
 * @param {string} [input.name] - first name, if known
 * @param {'start'|'pro'} input.tier
 * @param {'month'|'year'} input.interval
 * @param {string} input.trialEnd - ISO time
 * @param {string} input.appUrl - where Settings → Naročnina is
 * @returns {{subject: string, text: string, html: string}}
 */
export function trialReminderEmail({ name = '', tier, interval, trialEnd, appUrl }) {
  const key = `runko_${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`
  const amount = PRICES[key] ? euros(PRICES[key].amount) : ''
  const plan = `${tier === 'pro' ? 'Pro' : 'Start'}, ${interval === 'year' ? 'letno' : 'mesečno'}`
  const date = new Date(trialEnd).toLocaleDateString('sl-SI', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Ljubljana',
  })
  const manage = `${appUrl.replace(/\/$/, '')}/settings`
  const hello = name ? `Živjo, ${name}!` : 'Živjo!'

  const subject = 'Tvoj brezplačni preizkus Runka se konča čez 2 dni'
  const lines = [
    hello,
    '',
    `Tvoj 14-dnevni preizkus se konča ${date}. Takrat se samodejno zaračuna izbrani paket ${plan}${amount ? ` (${amount})` : ''}.`,
    '',
    'Če želiš nadaljevati, ti ni treba narediti ničesar. Načrt, treningi in pogovori s trenerjem ostanejo, kot so.',
    '',
    `Če ne želiš nadaljevati, naročnino prekliči pred ${date} v Nastavitvah pod Naročnina: ${manage}`,
    'Če jo prekličeš prej, ne plačaš ničesar.',
    '',
    'Lep tek,',
    'Runko',
  ]
  const text = lines.join('\n')
  const html = `<!doctype html><html lang="sl"><body style="margin:0;background:#0b0b0d;font-family:Arial,Helvetica,sans-serif;color:#e4e4e7">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:18px;font-weight:bold;color:#fafafa;margin:0 0 16px">${esc(hello)}</p>
<p style="line-height:1.6;margin:0 0 16px">Tvoj 14-dnevni preizkus se konča <strong>${esc(date)}</strong>. Takrat se samodejno zaračuna izbrani paket <strong>${esc(plan)}</strong>${amount ? ` (${esc(amount)})` : ''}.</p>
<p style="line-height:1.6;margin:0 0 16px">Če želiš nadaljevati, ti ni treba narediti ničesar. Načrt, treningi in pogovori s trenerjem ostanejo, kot so.</p>
<p style="line-height:1.6;margin:0 0 24px">Če ne želiš nadaljevati, naročnino prekliči pred ${esc(date)}. Če jo prekličeš prej, ne plačaš ničesar.</p>
<p style="margin:0 0 32px"><a href="${esc(manage)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Upravljaj naročnino</a></p>
<p style="line-height:1.6;margin:0;color:#a1a1aa">Lep tek,<br>Runko</p>
</div></body></html>`
  return { subject, text, html }
}
