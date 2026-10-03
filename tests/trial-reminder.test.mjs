// "Trial ends in 2 days" email: who gets it, what it says, and that it stays
// off until switched on.
import fs from 'node:fs'
import { dueForReminder, trialReminderEmail } from '../supabase/functions/_shared/trial-reminder.js'
import { check, summary } from './harness.mjs'

const now = new Date('2026-10-03T08:00:00Z')
const inH = (h) => new Date(now.getTime() + h * 3_600_000).toISOString()
const row = (o) => ({ user_id: 'u', status: 'trialing', trial_end: inH(40), cancel_at_period_end: false, trial_reminder_sent_for: null, ...o })

console.log('\nWho is due:')
check('trial ending in 40 h: due', dueForReminder([row()], now).length === 1)
check('ending in 20 h: not (yesterday\'s run had it)', dueForReminder([row({ trial_end: inH(20) })], now).length === 0)
check('ending in 60 h: not yet', dueForReminder([row({ trial_end: inH(60) })], now).length === 0)
check('already reminded for this trial end: not again', dueForReminder([row({ trial_reminder_sent_for: inH(40) })], now).length === 0)
check('already cancelled: no reminder', dueForReminder([row({ cancel_at_period_end: true })], now).length === 0)
check('not trialing: no reminder', dueForReminder([row({ status: 'active' })], now).length === 0)
check('every trial falls in exactly one daily run', [0, 24, 48].filter((h) => dueForReminder([row({ trial_end: inH(40) })], new Date(now.getTime() + (h - 24) * 3_600_000 + 0)).length).length === 1)

console.log('\nThe email:')
const m = trialReminderEmail({ name: 'Ana', tier: 'pro', interval: 'year', trialEnd: '2026-10-05T10:00:00Z', appUrl: 'https://runko.si/' })
check('subject: ends in 2 days', /konča čez 2 dni/.test(m.subject))
check('says the date and the plan and the price', /5\. oktober 2026/.test(m.text) && /Pro, letno/.test(m.text) && /89,99 €/.test(m.text))
check('says it is charged automatically', /samodejno zaračuna/.test(m.text))
check('says how to cancel and that cancelling before costs nothing', /Nastavitvah pod Naročnina/.test(m.text) && /ne plačaš ničesar/.test(m.text))
check('links to Settings', m.html.includes('https://runko.si/settings') && m.text.includes('https://runko.si/settings'))
check('the name is escaped in HTML', trialReminderEmail({ name: '<b>x</b>', tier: 'start', interval: 'month', trialEnd: '2026-10-05T10:00:00Z', appUrl: 'https://a' }).html.includes('&lt;b&gt;'))
check('Slovenian only', !/\b(your|trial ends|cancel)\b/i.test(m.text + m.subject))

console.log('\nDisabled until launch:')
const fn = fs.readFileSync('supabase/functions/trial-reminder/index.ts', 'utf8')
check('does nothing unless TRIAL_REMINDER_ENABLED is "true"', /TRIAL_REMINDER_ENABLED'\) === 'true'/.test(fn) && /if \(!enabled \|\| !resendKey \|\| !from\) return reply\(200, \{ skipped: 'disabled' \}\)/.test(fn))
check('only the cron can call it', /auth !== cronSecret\) return reply\(401/.test(fn))
check('remembers who was reminded', /trial_reminder_sent_for: row\.trial_end/.test(fn))
check('in the Before launch list', /trial-reminder/i.test(fs.readFileSync('PROGRESS.md', 'utf8').split('## Before launch')[1] || ''))

export default summary('trial-reminder')
