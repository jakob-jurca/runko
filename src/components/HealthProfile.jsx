import { useEffect, useState } from 'react'
import { getHealthProfile, saveHealthProfile, deleteHealthProfile, updateProfile } from '../core/db'
import { t } from '../core/strings'

const H = t.settings.health

/** Onboarding's safety answers, cleared together with the health profile. */
const SAFETY_COLUMNS = {
  pregnancy_status: null,
  weeks_postpartum: null,
  pain_at_rest: null,
  break_days: null,
  injury_last_12m: null,
}

const EMPTY = {
  sex: null,
  height_cm: '',
  cardiac_symptoms: null,
  known_condition: null,
  medical_clearance: null,
  caesarean: null,
  postpartum_cleared: null,
  marathons_completed: '',
}

/**
 * "Zdravstveni profil" — optional health data (GDPR special category).
 *
 * Nothing is asked before the runner accepts the consent line, only what the
 * plan engine reads is stored, and one button deletes all of it (including
 * the safety answers from onboarding). When a field is left empty the engine
 * falls back to the conservative choice.
 */
export default function HealthProfile({ profile, onChanged }) {
  const [stored, setStored] = useState(undefined) // undefined = loading, null = none
  const [form, setForm] = useState(EMPTY)
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHealthProfile(profile.id)
      .then((row) => {
        if (cancelled) return
        setStored(row)
        if (row) {
          setConsent(true)
          setForm({
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k] ?? EMPTY[k]])),
            height_cm: row.height_cm ?? '',
            marathons_completed: row.marathons_completed ?? '',
          })
        }
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [profile.id])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const postpartum = profile.pregnancy_status === 'postpartum'
  const needsClearance = form.cardiac_symptoms === true || form.known_condition === true

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const fields = {
        ...form,
        height_cm: form.height_cm === '' ? null : Number(form.height_cm),
        marathons_completed: form.marathons_completed === '' ? null : Number(form.marathons_completed),
        medical_clearance: needsClearance ? form.medical_clearance : null,
        caesarean: postpartum ? form.caesarean : null,
        postpartum_cleared: postpartum ? form.postpartum_cleared : null,
      }
      const row = await saveHealthProfile(profile.id, fields, stored?.consent_at || new Date().toISOString())
      setStored(row)
      setStatus(H.saved)
      setTimeout(() => setStatus(''), 4000)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeAll = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteHealthProfile(profile.id)
      await updateProfile(profile.id, SAFETY_COLUMNS)
      setStored(null)
      setForm(EMPTY)
      setConsent(false)
      setStatus(H.deleted)
      setTimeout(() => setStatus(''), 4000)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mt-4 animate-fade-up" style={{ animationDelay: '70ms' }}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-widest text-zinc-500">{H.title}</h2>
      <p className="mb-4 text-xs text-zinc-500">{H.body}</p>

      {stored === undefined && !error ? null : !consent ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">{H.consent}</p>
          <button className="btn-primary w-full text-sm" onClick={() => setConsent(true)}>
            {H.accept}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-zinc-600">{H.optionalHint}</p>
          <Choice label={H.sex} value={form.sex} onChange={set('sex')} options={H.sexOptions} />
          <div>
            <label className="label">{H.height}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="100"
                max="250"
                className="input"
                placeholder="172"
                value={form.height_cm}
                onChange={(e) => set('height_cm')(e.target.value)}
              />
              <span className="text-sm text-zinc-500">cm</span>
            </div>
          </div>
          <Choice label={H.cardiac} value={form.cardiac_symptoms} onChange={set('cardiac_symptoms')} options={YES_NO} />
          <Choice label={H.condition} value={form.known_condition} onChange={set('known_condition')} options={YES_NO} />
          {needsClearance && (
            <Choice label={H.clearance} value={form.medical_clearance} onChange={set('medical_clearance')} options={YES_NO} />
          )}
          {postpartum && (
            <>
              <Choice label={H.caesarean} value={form.caesarean} onChange={set('caesarean')} options={YES_NO} />
              <Choice
                label={H.postpartumCleared}
                value={form.postpartum_cleared}
                onChange={set('postpartum_cleared')}
                options={YES_NO}
              />
            </>
          )}
          <div>
            <label className="label">{H.marathons}</label>
            <input
              type="number"
              min="0"
              max="500"
              className="input"
              placeholder="0"
              value={form.marathons_completed}
              onChange={(e) => set('marathons_completed')(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full text-sm" disabled={busy} onClick={save}>
            {H.save}
          </button>
        </div>
      )}

      <button
        onClick={removeAll}
        disabled={busy}
        className="mt-4 w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-rose-400"
      >
        {H.deleteAll}
      </button>
      {status && <p className="mt-3 text-xs text-primary">{status}</p>}
      {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
    </section>
  )
}

const YES_NO = [
  { value: true, label: t.onboarding.yes },
  { value: false, label: t.onboarding.no },
]

function Choice({ label, value, onChange, options }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => onChange(value === o.value ? null : o.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              value === o.value ? 'bg-primary text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
