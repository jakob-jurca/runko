import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isTrialActive, trialDaysLeft, hasActiveSubscription, startCheckout } from '../core/subscription'
import { getMemories, deleteMemory } from '../core/memory'
import { goalLabel } from '../core/periodization'
import { maxHeartRate } from '../core/heart-rate'
import { t } from '../core/strings'
import HealthProfile from '../components/HealthProfile'

export default function Settings() {
  const { session, profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
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

  // startCheckout lives in core and cannot touch the DOM, so it returns a
  // result and the page renders it.
  const handleCheckout = async () => {
    const result = await startCheckout()
    setNotice(result.message)
    setTimeout(() => setNotice(''), 5000)
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-extrabold animate-fade-up">{t.settings.title}</h1>

      {/* Profile */}
      <section className="card mt-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">{t.settings.profile}</h2>
        <dl className="space-y-3 text-sm">
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
        <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-500">
          {t.settings.memoryTitle}
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
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
                className="flex items-start gap-3 rounded-xl bg-zinc-950/60 p-3 animate-fade-in"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-primary-faint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {t.settings.memoryCategories[m.category] || m.category}
                </span>
                <p className="min-w-0 flex-1 text-sm text-zinc-200">{m.content}</p>
                <button
                  onClick={() => forget(m.id)}
                  aria-label={t.settings.forget}
                  title={t.settings.forget}
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
          {t.settings.planTitle}
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
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
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-zinc-500">
          {t.settings.subscription}
        </h2>
        {hasActiveSubscription(profile) ? (
          <p className="text-sm">
            <span className="font-semibold text-primary">{t.subscription.planName}</span> — {t.settings.premiumActive}
          </p>
        ) : isTrialActive(profile) ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.settings.trial}</p>
                <p className="text-sm text-zinc-400">{t.settings.trialDaysLeft(trialDaysLeft(profile))}</p>
              </div>
              <span className="rounded-full bg-primary-faint px-3 py-1 text-xs font-bold text-primary">
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

      <button
        onClick={signOut}
        className="btn-ghost mt-6 w-full text-rose-400 hover:border-rose-500/50 animate-fade-up"
        style={{ animationDelay: '200ms' }}
      >
        {t.settings.signOut}
      </button>

      <p className="mt-8 text-center text-xs text-zinc-600">{t.settings.version}</p>
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
