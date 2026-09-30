import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../core/supabase'
import { parseAuthUrl } from '../core/auth-url'
import { setNewPassword, requestPasswordReset, confirmEmailLink, MIN_PASSWORD_LENGTH } from '../core/auth-flows'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'
import { RESET_REDIRECT_PATH } from './Auth'

/**
 * Where the emailed recovery link lands.
 *
 * Supabase puts the recovery token in the URL fragment; the client parses it
 * (detectSessionInUrl), creates a session and fires PASSWORD_RECOVERY, which
 * AuthContext turns into a flag that routes the user here. So by the time
 * this renders there is normally a valid session — the user is technically
 * signed in, just not finished, and every other route bounces back here
 * until they either set a password or cancel (which ends the session).
 *
 * The new-password form is shown ONLY in that state. It asks for no current
 * password, so an ordinary signed-in session must never reach it: that runner
 * is sent to Settings, where changing the password requires the current one.
 *
 * The link can also fail: expired, already used, or opened after a newer one
 * was sent. Supabase then returns an error in the URL instead of a session,
 * and this screen says so and lets the runner request a fresh link on the
 * spot rather than showing a form that cannot work.
 *
 * A third shape, `?token_hash=…&type=recovery`, is a link to this page that
 * is spent only when the runner presses "Nadaljuj". Mail scanners open every
 * link in a message, and a one-time link that has been opened is used up; a
 * link that needs a click survives them (see AUTH_CHECKLIST.md for the email
 * template that produces it).
 */
export default function ResetPassword() {
  const { session, recovery, clearRecovery, cancelRecovery, loading } = useAuth()
  const navigate = useNavigate()

  // Read once: the link this page was opened with.
  const [link] = useState(() => parseAuthUrl(window.location))

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [linkFailed, setLinkFailed] = useState(() => {
    // Supabase reports a bad link as error / error_code / error_description,
    // in the hash for the implicit flow and the query string for PKCE. The
    // English description is not shown, only the fact that it failed.
    if (link.failed) console.warn('[reset] Recovery link rejected:', link.errorCode, link.errorDescription)
    return link.failed
  })

  // Request-a-new-link form, shown when the link did not work.
  const [email, setEmail] = useState('')
  const [resendInfo, setResendInfo] = useState('')
  const [resendError, setResendError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const result = await setNewPassword(supabase, { password, confirm, email: session?.user?.email })
    if (!result.ok) {
      setError(result.message)
      setBusy(false)
      return
    }
    // Drop the recovery flag so the guards stop diverting, and let them in.
    clearRecovery()
    setDone(true)
    // A beat so the confirmation is actually readable.
    setTimeout(() => navigate('/', { replace: true }), 900)
  }

  /** Spend a token_hash link: only ever from this button. */
  const confirmLink = async () => {
    setBusy(true)
    const result = await confirmEmailLink(supabase, { tokenHash: link.tokenHash, type: link.tokenType })
    setBusy(false)
    // On success the SDK fires PASSWORD_RECOVERY and the form below appears.
    if (!result.ok) setLinkFailed(true)
  }

  const requestNewLink = async (e) => {
    e.preventDefault()
    setResendError('')
    setResendInfo('')
    setBusy(true)
    const result = await requestPasswordReset(supabase, {
      email,
      redirectTo: `${window.location.origin}${RESET_REDIRECT_PATH}`,
    })
    setBusy(false)
    // Same answer whether or not the address exists, as on the login page.
    if (result.ok) setResendInfo(t.reset.newSent)
    else setResendError(result.message)
  }

  const cancel = async () => {
    await cancelRecovery()
    navigate('/auth', { replace: true })
  }

  // `done` first: the re-login above reloads the profile, and the spinner
  // would otherwise hide the confirmation.
  if (loading && !done) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    )
  }

  // A link waiting for the runner's click (and not yet turned into a session).
  const awaitingConfirm = !done && !linkFailed && !recovery && Boolean(link.tokenHash)

  // Signed in the ordinary way, with no recovery in progress and no link to
  // explain: this page has nothing for them. The password is changed in
  // Settings, with the current one.
  if (!done && !recovery && !linkFailed && !awaitingConfirm && session) {
    return <Navigate to="/settings" replace />
  }

  // The link was rejected, or there is no recovery session to set a password on.
  const brokenLink = !done && !awaitingConfirm && (linkFailed || !recovery || !session)

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10 text-center">
          <img src="/runko.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-extrabold tracking-tight">
            {awaitingConfirm ? t.reset.confirmTitle : brokenLink ? t.reset.expiredTitle : t.reset.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {awaitingConfirm ? t.reset.confirmBody : brokenLink ? t.reset.expiredSubtitle : t.reset.subtitle}
          </p>
        </div>

        {awaitingConfirm ? (
          <div className="space-y-4">
            <button type="button" onClick={confirmLink} disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.confirmButton}
            </button>
            <Link
              to="/auth"
              replace
              className="block pt-1 text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
            >
              {t.reset.backToLogin}
            </Link>
          </div>
        ) : brokenLink ? (
          <form onSubmit={requestNewLink} className="card space-y-4">
            <p className="text-sm leading-relaxed text-zinc-400">{t.reset.expiredBody}</p>
            <div>
              <label className="label" htmlFor="reset-email">{t.auth.email}</label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className="input"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {resendError && <p className="text-sm text-rose-400" role="alert">{resendError}</p>}
            {resendInfo && <p className="text-sm text-emerald-400" role="status">{resendInfo}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.requestNew}
            </button>

            <Link
              to={session ? '/' : '/auth'}
              replace
              className="block pt-1 text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
            >
              {session ? t.log.backToDashboard : t.reset.backToLogin}
            </Link>
          </form>
        ) : done ? (
          <div className="card text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-3 font-semibold">{t.reset.doneTitle}</p>
            <p className="mt-1 text-sm text-zinc-400">{t.reset.doneBody}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Whose password this is: a link opened while someone else was
                signed in here replaces that session, and it should be plain. */}
            {session?.user?.email && (
              <p className="text-center text-sm text-zinc-400">{session.user.email}</p>
            )}
            <div>
              <label className="label" htmlFor="reset-new">{t.reset.newPassword}</label>
              <input
                id="reset-new"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoFocus
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="reset-confirm">{t.reset.confirmPassword}</label>
              <input
                id="reset-confirm"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.submit}
            </button>

            {/* Leaving must end the recovery session, not just the screen —
                a plain link to /auth would bounce straight back here. */}
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="block w-full pt-1 text-center text-xs text-zinc-600 underline underline-offset-4 hover:text-zinc-400"
            >
              {t.reset.cancel}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
