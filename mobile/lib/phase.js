import { t } from '../../src/core/strings.js'

/** One colour per training phase (same table as the web Plan page). */
export const PHASE_STYLES = {
  foundation: { label: t.plan.phases.foundation, bar: 'bg-lime-600', barHex: '#65A30D', text: 'text-lime-400', chip: 'bg-lime-500/15', chipText: 'text-lime-400' },
  base: { label: t.plan.phases.base, bar: 'bg-emerald-500', barHex: '#10B981', text: 'text-emerald-400', chip: 'bg-emerald-500/15', chipText: 'text-emerald-400' },
  build: { label: t.plan.phases.build, bar: 'bg-primary', barHex: '#F97316', text: 'text-primary', chip: 'bg-primary-faint', chipText: 'text-primary' },
  sharpen: { label: t.plan.phases.sharpen, bar: 'bg-rose-500', barHex: '#F43F5E', text: 'text-rose-400', chip: 'bg-rose-500/15', chipText: 'text-rose-400' },
  taper: { label: t.plan.phases.taper, bar: 'bg-sky-500', barHex: '#0EA5E9', text: 'text-sky-400', chip: 'bg-sky-500/15', chipText: 'text-sky-400' },
  walk_run: { label: t.plan.phases.walk_run, bar: 'bg-amber-500', barHex: '#F59E0B', text: 'text-amber-400', chip: 'bg-amber-500/15', chipText: 'text-amber-400' },
  walk: { label: t.plan.phases.walk, bar: 'bg-teal-500', barHex: '#14B8A6', text: 'text-teal-400', chip: 'bg-teal-500/15', chipText: 'text-teal-400' },
  return: { label: t.plan.phases.return, bar: 'bg-violet-500', barHex: '#8B5CF6', text: 'text-violet-400', chip: 'bg-violet-500/15', chipText: 'text-violet-400' },
  consistency: { label: t.plan.phases.consistency, bar: 'bg-teal-500', barHex: '#14B8A6', text: 'text-teal-400', chip: 'bg-teal-500/15', chipText: 'text-teal-400' },
  maintain: { label: t.plan.phases.maintain, bar: 'bg-zinc-400', barHex: '#A1A1AA', text: 'text-zinc-300', chip: 'bg-zinc-500/20', chipText: 'text-zinc-300' },
}

export const phaseStyle = (phase) => PHASE_STYLES[phase] || PHASE_STYLES.base
