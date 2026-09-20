import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../core/supabase'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'

const MIN_LENGTH = 6

/**
 * Where the emailed recovery link lands.
 *
 * Supabase puts the recovery token in the URL fragment; the client parses it
 * (detectSessionInUrl), creates a session and fires PASSWORD_RECOVERY, which
 * AuthContext turns into a flag that routes the user here. So by the time
 * this renders there is normally a valid session — the user is technically
 * signed in, just not finished.
 *
 * The link can also fail: expired, already used, or opened in a different
 * browser than it was requested from. Supabase then returns an error in the
 * URL instead of a session, and this screen has to say so rather than
 * showing a form that cannot work.
 */
export default function ResetPassword() {
  const { session, recovery, clearRecovery, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [linkError, setLinkError] = useState('')

  // Supabase reports a bad link as error_description, in the hash for the
  // implicit flow and the query string for PKCE. Read both.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const description = hash.get('error_description') || query.get('error_description')
    if (description) setLinkError(description.replace(/\+/g, ' '))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < MIN_LENGTH) {
      setError(t.reset.tooShort(MIN_LENGTH))
      return
    }
    if (password !== confirm) {
      setError(t.reset.mismatch)
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // updateUser keeps the session, so the user is now signed in with the
      // new password. Drop the recovery flag so the guards stop diverting,
      // and let them into the app.
      clearRecovery()
      setDone(true)
      // A beat so the confirmation is actually readable.
      setTimeout(() => navigate('/', { replace: true }), 900)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    )
  }

  // No session and no recovery in flight: the link did not work.
  const brokenLink = linkError || (!session && !recovery)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10 text-center">
          <img src="/runko.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-extrabold tracking-tight">
            {brokenLink ? t.reset.expiredTitle : t.reset.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {brokenLink
              ? t.reset.expiredSubtitle
              : t.reset.subtitle}
          </p>
        </div>

        {brokenLink ? (
          <div className="card text-center">
            {linkError && <p className="mb-3 text-sm text-rose-400">{linkError}</p>}
            <p className="text-sm leading-relaxed text-zinc-400">
              {t.reset.expiredBody}
            </p>
            <Link to="/auth" className="btn-primary mt-5 inline-block w-full">
              {t.reset.backToLogin}
            </Link>
          </div>
        ) : done ? (
          <div className="card text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-3 font-semibold">{t.reset.doneTitle}</p>
            <p className="mt-1 text-sm text-zinc-400">{t.reset.doneBody}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">{t.reset.newPassword}</label>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                autoFocus
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.reset.confirmPassword}</label>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.submit}
            </button>

            <Link
              to="/auth"
              className="block pt-1 text-center text-xs text-zinc-600 underline underline-offset-4 hover:text-zinc-400"
            >
              {t.common.cancel}
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
