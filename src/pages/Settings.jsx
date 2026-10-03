import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isTrial, trialDaysLeft, canUseApp, startCheckout } from '../core/subscription'
import { getMemories, deleteMemory } from '../core/memory'
import { goalLabel } from '../core/periodization'
import { maxHeartRate } from '../core/heart-rate'
import { X } from '@phosphor-icons/react'
import { t } from '../core/strings'
import { friendlyError } from '../core/errors'
import HealthProfile from '../components/HealthProfile'
import { supabase } from '../core/supabase'
import { changePassword, MIN_PASSWORD_LENGTH } from '../core/auth-flows'

export default function Settings() {
  const { session, profile, access, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')

  // What the coach remembers about this runner.
  const [memories, setMemories] = useState([])
  const [memoryError, setMemoryError] = useState('')

  useEffect(() => {
    let cancelled = false
    getMemories(profile.id)
      .then((rows) => !cancelled && setMemories(rows))
      .catch((err) => !cancelled && setMemoryError(friendlyError(err)))
    return () => {
      cancelled = true
    }
  }, [profile.id])

  const forget = async (id) => {
    const previous = memories
    setMemories((rows) => rows.filter((r) => r.id !== id)) // optimistic
    try {
      await deleteMemory(id)
    } catch (err) {
      setMemories(previous) // put it back
      setMemoryError(friendlyError(err))
    }
  }

  // startCheckout lives in core and cannot touch the DOM, so it returns a
  // result and the page renders it.
  const handleCheckout = async () => {
    const result = await startCheckout()
    setNotice(result.message)
    setTimeout(() => setNotice(''), 5000)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <h1 className="text-[1.75rem] font-bold tracking-tight animate-fade-up">{t.settings.title}</h1>

      {/* Profile */}
      <section className="card mt-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
        <h2 className="mb-4 text-base font-semibold text-zinc-100">{t.settings.profile}</h2>
        <dl className="divide-y divide-surface-line text-sm">
          <Row label={t.settings.name} value={profile.name} />
          <Row label={t.settings.email} value={session.user.email} />
          <Row label={t.settings.age} value={profile.age} />
          <Row label={t.settings.weight} value={profile.weight ? `${profile.weight} kg` : null} />
          <Row label={t.settings.level} value={t.settings.levels[profile.fitness_level]} />
          <Row label={t.settings.goal} value={goalLabel(profile)} />
          <Row label={t.settings.maxHr} value={maxHeartRate(profile.age) ? `${maxHeartRate(profile.age)} bpm` : null} />
        </dl>
      </section>

      {/* Optional health data — consent first, delete any time */}
      <HealthProfile profile={profile} onChanged={refreshProfile} />

      {/* What the coach remembers */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <h2 className="mb-1 text-base font-semibold text-zinc-100">
          {t.settings.memoryTitle}
        </h2>
        <p className="mb-4 max-w-[60ch] text-sm leading-relaxed text-zinc-500">
          {t.settings.memoryBody}
        </p>

        {memories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {t.settings.memoryEmpty}
          </p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-xl bg-canvas/70 p-3 animate-fade-in"
              >
                <span className="mt-0.5 shrink-0 rounded-md bg-primary-faint px-1.5 py-0.5 text-[11px] font-semibold text-primary-light">
                  {t.settings.memoryCategories[m.category] || m.category}
                </span>
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-200">{m.content}</p>
                <button
                  onClick={() => forget(m.id)}
                  aria-label={t.settings.forget}
                  title={t.settings.forget}
                  className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {memoryError && <p className="mt-3 text-sm text-rose-300">{memoryError}</p>}
      </section>

      {/* Training plan — rebuild any time */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '75ms' }}>
        <h2 className="mb-1 text-base font-semibold text-zinc-100">
          {t.settings.planTitle}
        </h2>
        <p className="mb-4 max-w-[60ch] text-sm leading-relaxed text-zinc-500">
          {t.settings.planBody}
        </p>
        <button
          onClick={() => navigate('/onboarding?rebuild=1')}
          className="btn-primary w-full text-sm"
        >
          {t.settings.createNewPlan}
        </button>
      </section>

      {/* Subscription */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <h2 className="mb-4 text-base font-semibold text-zinc-100">
          {t.settings.subscription}
        </h2>
        {canUseApp(access) && !isTrial(access) ? (
          <p className="text-sm">
            <span className="font-semibold text-primary-light">{t.subscription.planName}</span> · {t.settings.premiumActive}
          </p>
        ) : isTrial(access) ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.settings.trial}</p>
                <p className="text-sm text-zinc-400">{t.settings.trialDaysLeft(trialDaysLeft(access))}</p>
              </div>
              <span className="rounded-md bg-primary-faint px-2 py-1 font-mono text-[11px] font-semibold text-primary-light">
                TRIAL
              </span>
            </div>
            <button onClick={handleCheckout} className="btn-ghost mt-4 w-full text-sm">
              {t.settings.subscribeEarly}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              {t.settings.trialEnded}
            </p>
            <button onClick={handleCheckout} className="btn-primary mt-4 w-full">
              {t.settings.upgrade}
            </button>
          </>
        )}
      </section>

      {/* Account: the password is changed here, with the current one. The
          email address is shown in the profile above and cannot be changed
          in the app (not supported yet, so there is no control for it). */}
      <ChangePassword email={session.user.email} />

      <button
        onClick={signOut}
        className="btn-ghost mt-6 w-full !text-rose-300 hover:!bg-rose-500/10 animate-fade-up"
        style={{ animationDelay: '200ms' }}
      >
        {t.settings.signOut}
      </button>

      <p className="mt-8 text-center font-mono text-xs text-zinc-600">{t.settings.version}</p>
    </main>
  )
}

/**
 * Change the password while signed in. Closed by default; the flow and its
 * messages are core/auth-flows.js changePassword (the current password is
 * checked with the auth server before anything is saved).
 */
function ChangePassword({ email }) {
  const A = t.settings.account
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setDone('')
    setBusy(true)
    const result = await changePassword(supabase, { email, current, next, confirm })
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setCurrent('')
    setNext('')
    setConfirm('')
    setOpen(false)
    setDone(result.message)
  }

  return (
    <section className="card mt-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
      <h2 className="text-base font-semibold text-zinc-100">{A.title}</h2>
      {done && <p className="mt-3 text-sm text-emerald-400" role="status">{done}</p>}
      {!open ? (
        <button onClick={() => { setOpen(true); setDone('') }} className="btn-ghost mt-4 w-full text-sm">
          {A.changePassword}
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          {/* Lets a password manager file the new password under the right account. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <div>
            <label className="label" htmlFor="pw-current">{A.currentPassword}</label>
            <input
              id="pw-current"
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="pw-new">{A.newPassword}</label>
            <input
              id="pw-new"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="pw-confirm">{A.confirmPassword}</label>
            <input
              id="pw-confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full text-sm">
            {busy ? t.log.saving : A.save}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError('') }}
            className="w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
          >
            {t.common.cancel}
          </button>
          <p className="text-xs leading-relaxed text-zinc-500">{A.forgot}</p>
        </form>
      )}
    </section>
  )
}

function Row({ label, value, capitalize }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`truncate text-right font-medium ${capitalize ? 'capitalize' : ''}`}>{value || '-'}</dd>
    </div>
  )
}
