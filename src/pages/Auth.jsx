import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../core/supabase'
import { useAuth } from '../context/AuthContext'
import { signUp, logIn, requestPasswordReset, resendConfirmation, MIN_PASSWORD_LENGTH } from '../core/auth-flows'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'

/** Where Supabase sends the runner back to after they click the email link. */
export const RESET_REDIRECT_PATH = '/reset-password'

/**
 * Combined login / signup / forgot-password screen. New signups are routed
 * to onboarding; a password reset sends an email and hands off to
 * pages/ResetPassword.jsx when the runner follows the link.
 *
 * The flows themselves, and every message a runner can see, live in
 * core/auth-flows.js; this screen only shows what they return.
 */
export default function Auth() {
  const [params] = useSearchParams()
  const { sessionEnded } = useAuth()
  // The landing page's signup buttons link here with ?mode=signup.
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // { code, message } from the last failed attempt.
  const [failure, setFailure] = useState(null)
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const switchTo = (next) => {
    setMode(next)
    setFailure(null)
    setInfo('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setFailure(null)
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const result = await signUp(supabase, { email, password, redirectTo: window.location.origin })
        if (!result.ok) return setFailure(result)
        // With email confirmation enabled there is no session yet.
        if (result.needsConfirmation) return setInfo(t.auth.confirmEmail)
        navigate('/onboarding')
      } else if (mode === 'forgot') {
        const result = await requestPasswordReset(supabase, {
          email,
          redirectTo: `${window.location.origin}${RESET_REDIRECT_PATH}`,
        })
        if (!result.ok) return setFailure(result)
        // Deliberately the same message whether or not the address exists —
        // otherwise this endpoint tells strangers who has an account.
        setInfo(result.message)
      } else {
        const result = await logIn(supabase, { email, password })
        if (!result.ok) return setFailure(result)
        navigate('/')
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    const result = await resendConfirmation(supabase, { email, redirectTo: window.location.origin })
    setBusy(false)
    if (!result.ok) return setFailure(result)
    setFailure(null)
    setInfo(result.message)
  }

  // A wrong password and an unknown address get the same answer, and an
  // address that is already registered belongs to someone who may have
  // forgotten theirs: both are exactly when to offer a reset.
  const offerReset = failure?.code === 'invalid_credentials' || failure?.code === 'user_exists'

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10 text-center">
          <img src="/runko.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-4xl font-extrabold tracking-tight">
            Run<span className="text-primary">ko</span>
          </h1>
          <p className="mt-2 text-zinc-400">{t.common.appTagline}</p>
        </div>

        {/* Signed out without asking: say so, once, above the form. */}
        {sessionEnded && !failure && !info && (
          <p className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            {t.auth.sessionEnded}
          </p>
        )}

        <div className="mb-6 grid grid-cols-2 rounded-full bg-zinc-900 p-1">
          {['login', 'signup'].map((m) => (
            <button
              key={m}
              onClick={() => switchTo(m)}
              className={`rounded-full py-2 text-sm font-semibold capitalize transition ${
                // 'forgot' is a sub-state of logging in, so keep Log in lit.
                (mode === 'forgot' ? 'login' : mode) === m
                  ? 'bg-primary text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'login' ? t.auth.login : t.auth.signup}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="auth-email">{t.auth.email}</label>
            <input
              id="auth-email"
              type="email"
              required
              className="input"
              placeholder={t.auth.emailPlaceholder}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {/* Resetting only needs the address. */}
          {mode !== 'forgot' && (
            <div>
              <label className="label" htmlFor="auth-password">{t.auth.password}</label>
              <input
                id="auth-password"
                type="password"
                required
                // Only a NEW password has a minimum: an old account's shorter
                // one must still be allowed to log in.
                minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                className="input"
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchTo('forgot')}
                  className="mt-2 text-sm font-medium text-primary underline underline-offset-4 transition hover:text-primary/80"
                >
                  {t.auth.forgotPassword}
                </button>
              )}
            </div>
          )}

          {mode === 'forgot' && (
            <p className="text-sm leading-relaxed text-zinc-400">
              {t.auth.forgotIntro}
            </p>
          )}

          {failure && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3" role="alert">
              <p className="text-sm text-rose-300">{failure.message}</p>
              {offerReset && (
                <button
                  type="button"
                  onClick={() => switchTo('forgot')}
                  className="mt-2 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {t.auth.resetCta}
                </button>
              )}
              {failure.code === 'email_not_confirmed' && (
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className="mt-2 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {t.auth.confirmResend}
                </button>
              )}
            </div>
          )}
          {info && <p className="text-sm text-emerald-400" role="status">{info}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? (
              <Spinner className="h-5 w-5 text-white" />
            ) : mode === 'login' ? (
              t.auth.loginButton
            ) : mode === 'forgot' ? (
              t.auth.forgotButton
            ) : (
              t.auth.signupButton
            )}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchTo('login')}
              className="w-full pt-1 text-center text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              {t.auth.backToLogin}
            </button>
          )}
        </form>

        {mode === 'signup' && (
          <p className="mt-4 text-center text-xs text-zinc-500">
            {t.auth.trialNote}
          </p>
        )}
      </div>
    </div>
  )
}
