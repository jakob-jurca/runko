import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../core/supabase'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'

/** Where Supabase sends the runner back to after they click the email link. */
export const RESET_REDIRECT_PATH = '/reset-password'

/**
 * Combined login / signup / forgot-password screen. New signups are routed
 * to onboarding; a password reset sends an email and hands off to
 * pages/ResetPassword.jsx when the runner follows the link.
 */
export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  /** Switch to the reset form, carrying the typed email across. */
  const goForgot = () => {
    setMode('forgot')
    setError('')
    setInfo('')
  }

  // Supabase returns "Invalid login credentials" for a wrong password AND for
  // an unknown address, so this is exactly when to offer a reset.
  const isCredentialError = /invalid login credentials|invalid email or password/i.test(error)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // With email confirmation enabled there is no session yet.
        if (!data.session) {
          setInfo(t.auth.confirmEmail)
          return
        }
        navigate('/onboarding')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${RESET_REDIRECT_PATH}`,
        })
        if (error) throw error
        // Deliberately the same message whether or not the address exists —
        // otherwise this endpoint tells strangers who has an account.
        setInfo(t.auth.forgotSent)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

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

        <div className="mb-6 grid grid-cols-2 rounded-full bg-zinc-900 p-1">
          {['login', 'signup'].map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError('')
                setInfo('')
              }}
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
            <label className="label">{t.auth.email}</label>
            <input
              type="email"
              required
              className="input"
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {/* Resetting only needs the address. */}
          {mode !== 'forgot' && (
            <div>
              <label className="label">{t.auth.password}</label>
              <input
                type="password"
                required
                minLength={6}
                className="input"
                placeholder="••••••••"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => goForgot()}
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

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
              <p className="text-sm text-rose-300">{error}</p>
              {isCredentialError && (
                <button
                  type="button"
                  onClick={() => goForgot()}
                  className="mt-2 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  {t.auth.resetCta}
                </button>
              )}
            </div>
          )}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

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
              onClick={() => {
                setMode('login')
                setError('')
                setInfo('')
              }}
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
