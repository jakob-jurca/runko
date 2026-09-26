import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { currentWeekNumber, weekStartISO } from '../core/db'
import { PHASE_INTENT, goalLabel } from '../core/periodization'
import { getHydratedPlans } from '../core/plan'
import { FullScreenSpinner } from '../components/Spinner'
import { t } from '../core/strings'

/** One colour per training phase, reused by the curve and the week list. */
export const PHASE_STYLES = {
  foundation: { label: t.plan.phases.foundation, bar: 'bg-lime-600', text: 'text-lime-400', chip: 'bg-lime-500/15 text-lime-400' },
  base: { label: t.plan.phases.base, bar: 'bg-emerald-500', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-400' },
  build: { label: t.plan.phases.build, bar: 'bg-primary', text: 'text-primary', chip: 'bg-primary-faint text-primary' },
  sharpen: { label: t.plan.phases.sharpen, bar: 'bg-rose-500', text: 'text-rose-400', chip: 'bg-rose-500/15 text-rose-400' },
  taper: { label: t.plan.phases.taper, bar: 'bg-sky-500', text: 'text-sky-400', chip: 'bg-sky-500/15 text-sky-400' },
  // Scenario phases (core/planning)
  walk_run: { label: t.plan.phases.walk_run, bar: 'bg-amber-500', text: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-400' },
  walk: { label: t.plan.phases.walk, bar: 'bg-teal-500', text: 'text-teal-400', chip: 'bg-teal-500/15 text-teal-400' },
  return: { label: t.plan.phases.return, bar: 'bg-violet-500', text: 'text-violet-400', chip: 'bg-violet-500/15 text-violet-400' },
  consistency: { label: t.plan.phases.consistency, bar: 'bg-teal-500', text: 'text-teal-400', chip: 'bg-teal-500/15 text-teal-400' },
  maintain: { label: t.plan.phases.maintain, bar: 'bg-zinc-400', text: 'text-zinc-300', chip: 'bg-zinc-500/20 text-zinc-300' },
}

const VERDICT_STYLES = { feasible: 'text-emerald-400', stretch: 'text-amber-400', unsafe: 'text-rose-400' }

export const phaseStyle = (phase) => PHASE_STYLES[phase] || PHASE_STYLES.base

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Plan overview — the whole training block on one screen: every week with its
 * phase, the volume curve, and what each phase is building toward.
 */
export default function Plan() {
  const { profile } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [openWeek, setOpenWeek] = useState(null)

  useEffect(() => {
    let cancelled = false
    getHydratedPlans(profile)
      .then((rows) => !cancelled && setPlans(rows))
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile.id])

  const currentWeek = useMemo(() => currentWeekNumber(plans), [plans])

  // Walk-run weeks are prescribed in minutes; their km are estimates. A plan
  // that starts with walk-run and switches to kilometres is charted in km,
  // while each week in the list keeps its own unit.
  const timeBased = plans.length > 0 && plans.every((row) => row.plan_json?.unit === 'time')
  const weeks = useMemo(
    () =>
      plans.map((row) => {
        const j = row.plan_json || {}
        const inMinutes = j.unit === 'time'
        const minutes = j.target_minutes ?? (j.days || []).reduce((s, d) => s + (d.type === 'race' ? 0 : Number(d.duration_min) || 0), 0)
        const km = j.target_volume_km ?? (j.days || []).reduce((s, d) => s + (Number(d.distance_km) || 0), 0)
        const volume = timeBased ? minutes : km
        return {
          number: row.week_number,
          phase: j.phase || 'base',
          isRecovery: Boolean(j.is_recovery),
          focus: j.focus || '',
          intent: j.intent || '',
          volume: Math.round(volume * 10) / 10,
          ownVolume: Math.round((inMinutes ? minutes : km) * 10) / 10,
          ownUnit: inMinutes ? t.common.min : t.common.km,
          days: j.days || [],
          start: weekStartISO(plans, row.week_number),
        }
      }),
    [plans, timeBased]
  )

  const peak = Math.max(1, ...weeks.map((w) => w.volume))
  const totalKm = Math.round(weeks.reduce((s, w) => s + w.volume, 0))
  const vdot = plans[0]?.plan_json?.vdot
  const paces = plans[0]?.plan_json?.paces
  const intro = plans[0]?.plan_json?.intro
  const assessment = plans[0]?.plan_json?.goal_assessment
  // Why the plan looks the way it does (core/planning): scenario and verdict.
  const explain = plans[0]?.plan_json?.planning?.explain
  const unit = timeBased ? t.common.min : t.common.km
  // Paces and VDOT mean nothing to someone still learning to run.
  const hasWalkRun = plans.some((row) => row.plan_json?.unit === 'time')
  // Explicitly false only on plans built without premium. Plans saved before
  // this flag existed leave it undefined, so they show no notice.
  const genericWording = plans[0]?.plan_json?.ai_described === false

  if (loading) return <FullScreenSpinner />

  if (!weeks.length) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-extrabold">{t.plan.title}</h1>
        <div className="card mt-6 text-center">
          <p className="text-zinc-400">{t.plan.noPlan}</p>
          <Link to="/onboarding?rebuild=1" className="btn-primary mt-4 inline-block">
            {t.dashboard.createPlan}
          </Link>
        </div>
      </main>
    )
  }

  // Phase blocks, for the band above the curve.
  const blocks = []
  for (const w of weeks) {
    const last = blocks[blocks.length - 1]
    if (last && last.phase === w.phase) last.count++
    else blocks.push({ phase: w.phase, count: 1 })
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">{t.plan.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {timeBased ? t.plan.summaryTime(weeks.length, Math.round(totalKm / 60)) : t.plan.summary(weeks.length, totalKm)}
          {vdot && !hasWalkRun ? ` · VDOT ${vdot}` : ''}
        </p>
        {/* An unsafe goal is never built: show the goal this plan is for. */}
        <p className="mt-1 text-sm font-medium text-primary">
          {explain?.goal_plan
            ? explain.adopted_goal_text
            : explain?.verdict === 'unsafe' ? explain.adopted_goal_text : goalLabel(profile)}
        </p>
      </header>

      {/* The maths is the same on every tier; only the prose is generic. Say
          so, rather than letting a stock description read as the coach's. */}
      {genericWording && (
        <p className="mt-4 rounded-xl bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400 animate-fade-up">
          {t.paywall.planLocked}{' '}
          <Link to="/chat" className="text-primary underline">
            {t.paywall.ended}
          </Link>
        </p>
      )}

      {/* The coach's opening note — including an honest word when the target
          time is out of reach for this block. */}
      {intro && (
        <section className="card mt-6 animate-fade-up" style={{ animationDelay: '20ms' }}>
          <p className="text-xs font-semibold text-primary-light">
            Coach Runko
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{intro}</p>
          {explain && <VerdictCard explain={explain} />}
          {!explain && assessment && !assessment.realistic && (
            <p className="mt-3 rounded-xl bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
              This plan is built toward a realistic outcome for these{' '}
              {weeks.length} weeks rather than your stated target. Keep the target — it is a
              great next goal once this block is behind you.
            </p>
          )}
        </section>
      )}

      {/* Ranges, not targets to hit exactly. */}
      <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400 animate-fade-up">
        {t.plan.rangeNote}
      </p>

      {/* training paces */}
      {paces && !hasWalkRun && (
        <section className="card mt-6 animate-fade-up" style={{ animationDelay: '40ms' }}>
          <h2 className="mb-3 text-base font-semibold text-zinc-100">
            {t.plan.yourPaces}
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {Object.entries(paces).map(([name, p]) => (
              <div key={name} className="flex items-baseline justify-between gap-2">
                <span className="text-xs capitalize text-zinc-500">{name}</span>
                <span className="font-mono text-sm font-semibold">{p.label}/km</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* volume curve */}
      <section className="card mt-4 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-zinc-100">
            {t.plan.weeklyVolume}
          </h2>
          <span className="text-xs text-zinc-500">{t.plan.peak(peak, unit)}</span>
        </div>

        {/* phase band */}
        <div className="mb-2 flex gap-0.5 overflow-hidden rounded-full">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={`h-1.5 ${phaseStyle(b.phase).bar} opacity-70`}
              style={{ flexGrow: b.count }}
              title={phaseStyle(b.phase).label}
            />
          ))}
        </div>

        <div className="flex h-36 items-end gap-1" role="img" aria-label={t.plan.weeklyVolume}>
          {weeks.map((w) => {
            const s = phaseStyle(w.phase)
            const isNow = w.number === currentWeek
            return (
              <button
                key={w.number}
                onClick={() => setOpenWeek(openWeek === w.number ? null : w.number)}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                title={t.plan.weekTooltip(w.number, w.volume, w.isRecovery, unit)}
              >
                <span
                  className={`mb-1 text-center text-[9px] font-medium ${
                    isNow ? 'text-primary' : 'text-zinc-600'
                  } opacity-0 group-hover:opacity-100`}
                >
                  {w.volume}
                </span>
                <div
                  className={`w-full rounded-t transition-all ${s.bar} ${
                    w.isRecovery ? 'opacity-40' : 'opacity-85'
                  } ${isNow ? 'ring-2 ring-white/70' : ''} group-hover:opacity-100`}
                  style={{ height: `${Math.max(4, (w.volume / peak) * 100)}%` }}
                />
                <span
                  className={`mt-1 text-center text-[9px] ${
                    isNow ? 'font-bold text-primary' : 'text-zinc-600'
                  }`}
                >
                  {w.number}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(PHASE_STYLES).filter(([phase]) => blocks.some((b) => b.phase === phase)).map(([phase, s]) => (
            <span key={phase} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${s.bar}`} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-zinc-500 opacity-40" />
            {t.plan.recoveryWeekLegend}
          </span>
        </div>
      </section>

      {/* week by week */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-zinc-100">
          {t.plan.weekByWeek}
        </h2>
        <div className="space-y-2">
          {weeks.map((w) => {
            const s = phaseStyle(w.phase)
            const isNow = w.number === currentWeek
            const open = openWeek === w.number
            return (
              <div
                key={w.number}
                className={`card !p-0 overflow-hidden ${isNow ? '!ring-primary/50' : ''}`}
              >
                <button
                  onClick={() => setOpenWeek(open ? null : w.number)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                  aria-expanded={open}
                >
                  <div className="w-9 shrink-0 text-center">
                    <div className={`text-lg font-extrabold ${isNow ? 'text-primary' : ''}`}>
                      {w.number}
                    </div>
                    <div className="text-[9px] uppercase text-zinc-600">{t.common.week}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${s.chip}`}>
                        {s.label}
                      </span>
                      {w.isRecovery && (
                        <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                          {t.plan.recoveryShort}
                        </span>
                      )}
                      {isNow && <span className="text-[10px] font-bold uppercase text-primary">{t.common.current}</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-zinc-300">{w.focus || s.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {shortDate(w.start)} · {w.ownVolume} {w.ownUnit}
                    </p>
                  </div>
                  <span className={`shrink-0 text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`}>
                    ›
                  </span>
                </button>

                {open && (
                  <div className="border-t border-zinc-800 px-4 py-3 animate-fade-in">
                    {w.intent && <p className="mb-3 text-xs italic text-zinc-500">{w.intent}</p>}
                    <ul className="space-y-1.5">
                      {w.days.map((d) => (
                        <li key={d.day} className="flex items-baseline gap-2 text-xs">
                          <span className="w-9 shrink-0 text-zinc-600">{d.day.slice(0, 3)}</span>
                          <span className="min-w-0 flex-1">
                            <span className={d.type === 'rest' ? 'text-zinc-600' : 'text-zinc-200'}>
                              {d.title || d.type}
                            </span>
                            {d.time_based && d.type !== 'race' && d.duration_min > 0 ? (
                              <span className="text-zinc-500"> — {d.duration_min} min</span>
                            ) : d.distance_km > 0 && (
                              <span className="text-zinc-500">
                                {' '}
                                — {d.distance_km} km{d.pace ? ` @ ${d.pace}` : ''}
                              </span>
                            )}
                            {d.purpose && (
                              <span className="block text-[11px] italic text-zinc-600">{d.purpose}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="mt-6 rounded-xl bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-500">
        <p className="mb-1 font-semibold text-zinc-400">{t.plan.howBuilt}</p>
        {t.plan.howBuiltBody}{' '}
        {Object.entries(PHASE_INTENT)
          .filter(([p]) => blocks.some((b) => b.phase === p))
          .map(([p, intent]) => `${phaseStyle(p).label.toLowerCase()} — ${intent}`)
          .join('; ')}
        .
      </div>
    </main>
  )
}

/**
 * The pipeline's verdict under the coach's intro: what kind of plan this is,
 * how the goal was judged, and — for an unsafe goal — what was built instead.
 */
function VerdictCard({ explain }) {
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
      <p>
        <span className="font-semibold text-zinc-300">{t.plan.scenarioLabel}:</span> {explain.scenario_label}
      </p>
      {explain.verdict_label && (
        <p>
          <span className="font-semibold text-zinc-300">{t.plan.verdictLabel}:</span>{' '}
          <span className={`font-semibold ${VERDICT_STYLES[explain.verdict] || ''}`}>{explain.verdict_label}</span>
        </p>
      )}
      {explain.verdict === 'unsafe' && explain.original_goal_text && (
        <>
          <p>
            <span className="font-semibold text-zinc-300">{t.plan.originalGoal}:</span> {explain.original_goal_text}
          </p>
          <p>
            <span className="font-semibold text-zinc-300">{t.plan.builtFor}:</span> {explain.adopted_goal_text}
          </p>
          {explain.other_options?.[0] && (
            <p>
              <span className="font-semibold text-zinc-300">{t.plan.otherOption}:</span> {explain.other_options[0]}
            </p>
          )}
        </>
      )}
      {explain.verdict === 'stretch' && explain.fallback_text && (
        <p>
          <span className="font-semibold text-zinc-300">{t.plan.fallbackLabel}:</span> {explain.fallback_text}
        </p>
      )}
    </div>
  )
}
