import { useState } from 'react'
import { FirstAidKit, Minus, Plus, Stethoscope } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { reportHealthBreak, undoHealthBreak } from '../core/plan'
import { doctorAdvised, BREAK_KINDS, MIN_BREAK_DAYS, MAX_BREAK_DAYS } from '../core/health-break'
import { friendlyError } from '../core/errors'
import { todayISO } from '../core/dates'
import { t } from '../core/strings'

/** "8. oktober" from an ISO date. */
const dayMonth = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('sl-SI', { day: 'numeric', month: 'long' })

/**
 * "Poškodba / bolezen": the runner says what and for how long, the plan
 * changes at once by code (core/health-break.js): rest, then a gradual
 * return. No AI call. Shown on the Dashboard and the Plan page.
 *
 * @param {{plans: Array, onChanged: (plans: Array, breakRow: object) => void}} props
 */
export function HealthBreakButton({ plans, onChanged, className = '' }) {
  const H = t.healthBreak
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('injury')
  const [days, setDays] = useState(3)
  const [strongPain, setStrongPain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  if (!plans?.length) return null

  const close = () => {
    if (busy) return
    setOpen(false)
    setResult(null)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await reportHealthBreak(profile, plans, { kind, days, strongPain })
      setResult(r)
      onChanged?.(r.plans, r.breakRow)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const step = (n) => setDays((d) => Math.min(MAX_BREAK_DAYS, Math.max(MIN_BREAK_DAYS, d + n)))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-full bg-surface-raised px-4 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-white/10 transition hover:text-white active:scale-[0.98] ${className}`}
      >
        <FirstAidKit size={18} className="text-rose-300" />
        {H.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 animate-fade-in sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="health-break-title"
          onClick={close}
        >
          <div
            className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-card bg-surface-raised p-6 ring-1 ring-inset ring-white/10 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="health-break-title" className="text-lg font-semibold">{H.title}</h2>

            {result ? (
              <div className="mt-3 space-y-3 text-sm leading-relaxed">
                <p className="text-zinc-200" role="status">
                  {H.done(dayMonth(result.breakRow.rest_until), dayMonth(result.breakRow.return_until))}
                </p>
                {doctorAdvised({ days: result.breakRow.days, strongPain: result.breakRow.strong_pain }) && (
                  <DoctorNote kind={result.breakRow.kind} />
                )}
                {result.raceAtRisk && <p className="text-amber-200">{H.raceAtRisk}</p>}
                <button onClick={close} className="btn-primary mt-2 w-full text-sm">{H.close}</button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-2">
                <p className="text-sm leading-relaxed text-zinc-400">{H.intro}</p>

                <fieldset className="mt-5">
                  <legend className="label">{H.whatLabel}</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {BREAK_KINDS.map((k) => (
                      <button
                        type="button"
                        key={k}
                        aria-pressed={kind === k}
                        onClick={() => setKind(k)}
                        className={`min-h-[44px] rounded-xl px-2 text-sm font-medium ring-1 ring-inset transition ${
                          kind === k ? 'bg-primary-faint text-primary-light ring-primary/50' : 'bg-canvas/60 text-zinc-300 ring-white/10'
                        }`}
                      >
                        {H.kinds[k]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-5">
                  <p className="label" id="hb-days-label">{H.daysLabel}</p>
                  <div className="mt-2 flex items-center gap-3" role="group" aria-labelledby="hb-days-label">
                    <button type="button" onClick={() => step(-1)} aria-label={H.fewer} className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas/60 ring-1 ring-inset ring-white/10">
                      <Minus size={16} />
                    </button>
                    <span className="min-w-[5.5rem] text-center font-mono text-lg font-semibold" aria-live="polite">
                      {days} {H.daysUnit(days)}
                    </span>
                    <button type="button" onClick={() => step(1)} aria-label={H.more} className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas/60 ring-1 ring-inset ring-white/10">
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {[3, 7, 14].map((n) => (
                      <button type="button" key={n} onClick={() => setDays(n)} className="min-h-[36px] rounded-full bg-canvas/60 px-3 text-xs text-zinc-300 ring-1 ring-inset ring-white/10">
                        {n} {H.daysUnit(n)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="mt-5 flex items-start gap-3 text-sm text-zinc-300">
                  <input type="checkbox" checked={strongPain} onChange={(e) => setStrongPain(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                  <span>{H.strongPain}</span>
                </label>

                {doctorAdvised({ days, strongPain }) && <div className="mt-4"><DoctorNote kind={kind} /></div>}

                {error && <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}

                <div className="mt-6 flex gap-2">
                  <button type="button" onClick={close} disabled={busy} className="btn-ghost flex-1 text-sm">
                    {t.common.cancel}
                  </button>
                  <button type="submit" disabled={busy} className="btn-primary flex-1 text-sm">
                    {busy ? H.saving : H.confirm}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** The calm recommendation to see a doctor: more than 14 days, or strong pain. */
function DoctorNote({ kind }) {
  return (
    <p className="flex items-start gap-2.5 rounded-xl bg-sky-500/10 p-3 text-sm leading-relaxed text-sky-100 ring-1 ring-inset ring-sky-500/25">
      <Stethoscope size={18} className="mt-0.5 shrink-0" />
      <span>{kind === 'injury' ? t.healthBreak.doctorInjury : t.healthBreak.doctor}</span>
    </p>
  )
}

/**
 * The active break on the Dashboard: where the runner is in it, the doctor
 * note when it applies, and "Razveljavi".
 */
export function HealthBreakNotice({ breakRow, plans, onUndone }) {
  const H = t.healthBreak
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!breakRow) return null

  const today = todayISO()
  const resting = today <= breakRow.rest_until

  const undo = async () => {
    setBusy(true)
    setError('')
    try {
      onUndone?.(await undoHealthBreak(profile, plans, breakRow))
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <section className="mt-3 rounded-card bg-rose-500/[0.07] p-4 ring-1 ring-inset ring-rose-500/20 animate-fade-in">
      <div className="flex items-start gap-3">
        <FirstAidKit size={20} className="mt-0.5 shrink-0 text-rose-300" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <p className="font-semibold text-zinc-100">{H.activeTitle[breakRow.kind] || H.activeTitle.other}</p>
          <p className="mt-0.5 text-zinc-300">
            {resting ? H.resting(dayMonth(breakRow.rest_until)) : H.returning(dayMonth(breakRow.return_until))}
          </p>
          {doctorAdvised({ days: breakRow.days, strongPain: breakRow.strong_pain }) && (
            <div className="mt-3"><DoctorNote kind={breakRow.kind} /></div>
          )}
          {error && <p className="mt-2 text-rose-300" role="alert">{error}</p>}
          <button onClick={undo} disabled={busy} className="mt-2 text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200">
            {busy ? H.saving : H.undo}
          </button>
        </div>
      </div>
    </section>
  )
}
