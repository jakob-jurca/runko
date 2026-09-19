import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../core/supabase'
import Spinner from '../components/Spinner'

/** Combined login / signup screen. New signups are routed to onboarding. */
export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

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
          setInfo('Check your inbox to confirm your email, then log in.')
          return
        }
        navigate('/onboarding')
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
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10 text-center">
          <img src="/runko.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-4xl font-extrabold tracking-tight">
            Run<span className="text-primary">ko</span>
          </h1>
          <p className="mt-2 text-zinc-400">Your AI running coach.</p>
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
                mode === m ? 'bg-primary text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner className="h-5 w-5 text-white" /> : mode === 'login' ? 'Log in' : 'Start free month'}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="mt-4 text-center text-xs text-zinc-500">
            Includes a 1-month free trial of Runko Premium. No card required.
          </p>
        )}
      </div>
    </div>
  )
}
