import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { t } from '../../src/core/strings'
import { formatTrialTime, blockSummary } from '../../src/core/goal-progress'
import { adjustmentText } from '../../src/core/planning/goals'
import { Card, Text } from './ui'
import { colors } from '../lib/theme'

const G = t.goals

function Bar({ percent }) {
  return (
    <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
      <View className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </View>
  )
}

function Figure({ label, value, hint }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-zinc-500">{label}</Text>
      <Text className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-50">{value}</Text>
      {!!hint && <Text className="mt-0.5 text-xs text-zinc-500">{hint}</Text>}
    </View>
  )
}

function TimeTrial({ metric }) {
  const T = G.trial
  const a = metric.first
  const b = metric.last
  const change = metric.changeMinutes
  return (
    <View>
      <Text className="text-sm font-semibold text-zinc-200">{T.title}</Text>
      <View className="mt-3 flex-row gap-4">
        <Figure label={T.first} value={a?.result ? formatTrialTime(a.result.minutes) : '–'} hint={a?.result ? null : a ? T.notYet : null} />
        {b && <Figure label={T.last} value={b.result ? formatTrialTime(b.result.minutes) : '–'} hint={b.result ? null : T.planned(b.week)} />}
      </View>
      {change !== null && (
        <Text className="mt-3 text-sm text-primary-light">
          {Math.abs(change) < 1 / 60 ? T.same : T.change(change < 0, formatTrialTime(Math.abs(change)))}
        </Text>
      )}
    </View>
  )
}

function LongestRun({ metric }) {
  const L = G.longest
  const { startMinutes: start, bestMinutes: best, targetMinutes: target } = metric
  const span = target && target > start ? target - start : 0
  return (
    <View>
      <Text className="text-sm font-semibold text-zinc-200">{L.title}</Text>
      {best > 0 ? (
        <>
          <Text className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">{L.minutes(best)}</Text>
          <Text className="mt-0.5 text-xs text-zinc-500">
            {L.start(start)}
            {target ? ` · ${L.target(target)}` : ''}
          </Text>
          {span > 0 && <Bar percent={((best - start) / span) * 100} />}
        </>
      ) : (
        <Text className="mt-2 text-sm text-zinc-400">{L.none}</Text>
      )}
    </View>
  )
}

function Completion({ metric }) {
  const C = G.completion
  return (
    <View>
      <Text className="text-sm font-semibold text-zinc-200">{C.title}</Text>
      {metric.planned > 0 ? (
        <>
          <Text className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">{C.of(metric.done, metric.planned)}</Text>
          <Bar percent={metric.percent} />
        </>
      ) : (
        <Text className="mt-2 text-sm text-zinc-400">{C.none}</Text>
      )}
    </View>
  )
}

const METRICS = { time_trial: TimeTrial, longest_run: LongestRun, completion: Completion }

/** The goal's progress metric (and the secondary goal's), under the phase card. */
export function GoalProgressCard({ progress }) {
  const { goal } = progress
  return (
    <View className="mt-3 rounded-card border border-surface-line bg-surface/60 p-5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-sm font-semibold text-primary-light">
          {t.goals.items[goal.main].label} · {G.progressTitle}
        </Text>
        <Text className="text-xs text-zinc-500">{G.blockWeek(progress.week, progress.totalWeeks)}</Text>
      </View>
      <View className="mt-4 gap-5">
        {progress.metrics.map((m) => {
          const Metric = METRICS[m.kind]
          return <Metric key={m.kind} metric={m} />
        })}
      </View>
      {goal.adjustments?.length > 0 && (
        <View className="mt-4 gap-1 border-t border-surface-line pt-3">
          {goal.adjustments.map((a) => (
            <Text key={a.id} className="text-xs leading-5 text-zinc-500">{adjustmentText(a)}</Text>
          ))}
        </View>
      )}
    </View>
  )
}

/** The last week of the block: how it went, and where to go next. */
export function BlockEndCard({ progress, onNext }) {
  const N = G.next
  const options = [
    { id: 'repeat', label: N.repeat, hint: N.repeatHint },
    { id: 'switch', label: N.switch, hint: N.switchHint },
    { id: 'race', label: N.race, hint: N.raceHint },
  ]
  return (
    <Card className="mt-3">
      <Text className="text-xs font-semibold text-primary-light">{G.endTitle}</Text>
      <Text className="mt-1 text-lg font-semibold">{G.endSummaryTitle}</Text>
      <View className="mt-2 gap-1.5">
        {blockSummary(progress).map((line) => (
          <Text key={line} className="text-sm leading-5 text-zinc-300">{line}</Text>
        ))}
      </View>
      <Text className="mt-5 text-sm font-semibold">{N.title}</Text>
      <View className="mt-2 gap-2">
        {options.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => onNext(o.id)}
            className="min-h-[52px] flex-row items-center justify-between gap-3 rounded-2xl border border-surface-line bg-surface px-4 py-3 active:opacity-70"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-zinc-100">{o.label}</Text>
              <Text className="text-xs text-zinc-500">{o.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.zinc500} />
          </Pressable>
        ))}
      </View>
    </Card>
  )
}
