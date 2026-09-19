import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { providers, isConnectedLocally, markDisconnected } from '../lib/integrations'
import { isTrialActive, trialDaysLeft, hasActiveSubscription, startCheckout } from '../core/subscription'
import { getMemories, deleteMemory } from '../core/memory'
import { goalLabel } from '../core/periodization'

const PROVIDER_ICONS = {
  strava: '🟠',
  garmin: '⌚',
  healthkit: '🍎',
}

export default function Settings() {
  const { session, profile, signOut } = useAuth()
  const navigate = useNavigate()
  // bump to re-render after connect/disconnect (stub state is in localStorage)
  const [, setTick] = useState(0)
  const [notice, setNotice] = useState('')

  // What the coach remembers about this runner.
  const [memories, setMemories] = useState([])
  const [memoryError, setMemoryError] = useState('')

  useEffect(() => {
    let cancelled = false
    getMemories(profile.id)
      .then((rows) => !cancelled && setMemories(rows))
      .catch((err) => !cancelled && setMemoryError(err.message))
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
      setMemoryError(err.message)
    }
  }

  const handleConnect = (provider) => {
    const result = provider.connect()
    if (!result.ok && result.reason === 'coming_soon') {
      setNotice(`${provider.name} sync is coming soon — we’ll let you know when it’s live!`)
      setTimeout(() => setNotice(''), 4000)
    }
    setTick((t) => t + 1)
  }

  // startCheckout lives in core and cannot touch the DOM, so it returns a
  // result and the page renders it.
  const handleCheckout = async () => {
    const result = await startCheckout()
    setNotice(result.message)
    setTimeout(() => setNotice(''), 5000)
  }

  const handleDisconnect = (provider) => {
    provider.disconnect()
    markDisconnected(provider.id)
    setTick((t) => t + 1)
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-extrabold animate-fade-up">Settings</h1>

      {/* Profile */}
      <section className="card mt-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">Profile</h2>
        <dl className="space-y-3 text-sm">
          <Row label="Name" value={profile.name} />
          <Row label="Email" value={session.user.email} />
          <Row label="Age" value={profile.age} />
          <Row label="Weight" value={profile.weight ? `${profile.weight} kg` : null} />
          <Row label="Level" value={profile.fitness_level} capitalize />
          <Row label="Goal" value={goalLabel(profile)} />
        </dl>
      </section>

      {/* What the coach remembers */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-500">
          What your coach remembers
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Picked up from your conversations, so you never have to explain the same thing twice.
          Delete anything that is no longer true.
        </p>

        {memories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing yet — chat with your coach and anything worth keeping will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-xl bg-zinc-950/60 p-3 animate-fade-in"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-primary-faint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {String(m.category).replace('_', ' ')}
                </span>
                <p className="min-w-0 flex-1 text-sm text-zinc-200">{m.content}</p>
                <button
                  onClick={() => forget(m.id)}
                  aria-label="Forget this"
                  title="Forget this"
                  className="shrink-0 rounded-full px-2 text-lg leading-none text-zinc-600 transition hover:text-rose-400"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {memoryError && <p className="mt-3 text-xs text-rose-400">{memoryError}</p>}
      </section>

      {/* Training plan — rebuild any time */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '75ms' }}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-500">
          Training plan
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Goal changed, or coming back after a break? Rebuild your plan from scratch — your coach
          starts again from your latest runs.
        </p>
        <button
          onClick={() => navigate('/onboarding?rebuild=1')}
          className="btn-primary w-full text-sm"
        >
          Create new plan
        </button>
      </section>

      {/* Subscription */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '100ms' }}>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
          Subscription
        </h2>
        {hasActiveSubscription(profile) ? (
          <p className="text-sm">
            <span className="font-semibold text-primary">Runko Premium</span> — active
          </p>
        ) : isTrialActive(profile) ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Premium trial</p>
                <p className="text-sm text-zinc-400">{trialDaysLeft(profile)} days remaining</p>
              </div>
              <span className="rounded-full bg-primary-faint px-3 py-1 text-xs font-bold text-primary">
                TRIAL
              </span>
            </div>
            <button onClick={handleCheckout} className="btn-ghost mt-4 w-full text-sm">
              Subscribe early — coming soon
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              Your trial has ended. You’re on the free plan: manual logging and your current
              training plan.
            </p>
            <button onClick={handleCheckout} className="btn-primary mt-4 w-full">
              Upgrade to Premium
            </button>
          </>
        )}
      </section>

      {/* Integrations (skeleton) */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-500">
          Connected apps
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Auto-import runs from your favorite platforms.
        </p>
        <div className="space-y-3">
          {providers.map((p) => {
            const connected = isConnectedLocally(p.id)
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-zinc-950/60 p-3">
                <span className="text-2xl">{PROVIDER_ICONS[p.id]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-zinc-500">{p.description}</p>
                </div>
                {connected ? (
                  <button
                    onClick={() => handleDisconnect(p)}
                    className="rounded-full border border-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:border-rose-500 hover:text-rose-400"
                  >
                    Disconnect
                  </button>
                ) : p.status === 'coming_soon' || !p.isConfigured() ? (
                  <span className="rounded-full bg-zinc-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Coming soon
                  </span>
                ) : (
                  <button
                    onClick={() => handleConnect(p)}
                    className="rounded-full bg-primary-faint px-4 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
                  >
                    Connect
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {notice && <p className="mt-3 text-xs text-primary animate-fade-in">{notice}</p>}
      </section>

      <button
        onClick={signOut}
        className="btn-ghost mt-6 w-full text-rose-400 hover:border-rose-500/50 animate-fade-up"
        style={{ animationDelay: '200ms' }}
      >
        Sign out
      </button>

      <p className="mt-8 text-center text-xs text-zinc-600">Runko v0.1.0 — run happy 🧡</p>
    </main>
  )
}

function Row({ label, value, capitalize }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`truncate font-medium ${capitalize ? 'capitalize' : ''}`}>{value || '—'}</dd>
    </div>
  )
}
