import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { t } from '../../src/core/strings'
import { prefillFromPlan } from '../../src/core/logging'
import { Text } from './ui'
import { colors } from '../lib/theme'

/**
 * Muted semantic tints per workout type: a thin rail on the card and the
 * colour of the type label. Same table as the web WorkoutCard.
 */
const TYPE_STYLES = {
  easy: { rail: 'bg-emerald-400/70', text: 'text-emerald-300' },
  tempo: { rail: 'bg-primary', text: 'text-primary-light' },
  long: { rail: 'bg-sky-400/70', text: 'text-sky-300' },
  interval: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
  repetition: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
  cross: { rail: 'bg-violet-400/70', text: 'text-violet-300' },
  race: { rail: 'bg-amber-400', text: 'text-amber-300' },
  rest: { rail: 'bg-zinc-700', text: 'text-zinc-500' },
  walk_run: { rail: 'bg-amber-400/70', text: 'text-amber-300' },
  walk: { rail: 'bg-teal-400/70', text: 'text-teal-300' },
  time_trial: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
}

/** "12 km" -> ["12", "km"], "5:25-5:40/km" -> ["5:25-5:40", "/km"]. Text without a unit stays whole. */
function splitUnit(value) {
  const m = /^(.*?\d)\s*(km|min|bpm|\/km)$/.exec(String(value))
  return m ? [m[1], m[2]] : [String(value), null]
}

/** One figure in the 2x2 grid: the number large, its unit and label small. */
function Metric({ label, value }) {
  if (!value) return <View className="w-1/2" />
  const [number, unit] = splitUnit(value)
  const numeric = unit !== null
  return (
    <View className="w-1/2 pr-3">
      <Text className="text-xs text-zinc-500">{label}</Text>
      <View className={`mt-0.5 flex-row items-baseline gap-1 ${numeric ? '' : 'pt-0.5'}`}>
        <Text
          numberOfLines={1}
          className={numeric ? 'text-xl font-semibold tabular-nums text-zinc-50' : 'text-sm font-medium text-zinc-200'}
        >
          {number}
        </Text>
        {unit && <Text className="text-xs font-medium text-zinc-500">{unit}</Text>}
      </View>
    </View>
  )
}

/** One segment of a varying-intensity workout: a row on a thin timeline. */
function Segment({ segment, last }) {
  const hr = segment.hr ? `${segment.hr.min}-${segment.hr.max} bpm` : null
  const text =
    segment.text ||
    (segment.reps ? segment.reps.summary : `${segment.distance_km} km @ ${segment.pace_range || segment.pace}`)
  const main = segment.kind === 'main'
  return (
    <View className={`flex-row gap-3 ${last ? '' : 'pb-3'}`}>
      <View className="w-[11px] items-center">
        <View className={`mt-1.5 h-[11px] w-[11px] rounded-full ${main ? 'bg-primary' : 'bg-zinc-600'}`} />
        {!last && <View className="mt-1 w-px flex-1 bg-zinc-800" />}
      </View>
      <View className="flex-1">
        <Text className="text-xs text-zinc-500">{segment.label}</Text>
        <Text className={`text-sm leading-5 tabular-nums ${main ? 'font-semibold text-zinc-50' : 'text-zinc-300'}`}>
          {text}
        </Text>
        {hr && <Text className="text-xs tabular-nums text-zinc-500">{hr}</Text>}
      </View>
    </View>
  )
}

function DateBlock({ weekday, dateLabel, isToday }) {
  return (
    <View className="w-11">
      <Text className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-zinc-300'}`}>{weekday}</Text>
      {!!dateLabel && (
        <Text className={`text-[11px] tabular-nums ${isToday ? 'text-primary/80' : 'text-zinc-600'}`}>{dateLabel}</Text>
      )}
    </View>
  )
}

/**
 * One day of a plan week, pinned to a calendar date. Renders entirely from the
 * stored plan (nothing is generated on open). Same behaviour as the web card:
 * 2x2 figures, segment timeline for varying intensity, quiet rest row,
 * one-tap "Opravljeno kot načrtovano", "Prilagodi" opens the prefilled log,
 * "Podrobnosti" folds out Kako izvesti and Zakaj ta trening.
 */
export default function WorkoutCard({ day, date, completed, isToday, locked, canLog, onQuickLog, quickLogging }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const isRest = day.type === 'rest'
  const isTrial = day.type === 'time_trial'
  const style = TYPE_STYLES[day.type] || TYPE_STYLES.easy

  const d = date ? new Date(date + 'T00:00:00') : null
  const weekday = d ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : day.day.slice(0, 3)
  const dateLabel = d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null

  const openPrefilledForm = () => {
    const pre = prefillFromPlan(day, date)
    router.push({
      pathname: '/log',
      params: {
        day: day.day,
        type: day.type,
        title: day.title || '',
        distance: String(pre.distance),
        duration: String(pre.duration),
        effort: String(pre.effort),
        date: pre.date,
      },
    })
  }

  const segments = day.segments || []
  const hasSegments = segments.length > 0
  const time = day.duration_range
    ? `${day.duration_range.min}-${day.duration_range.max} min`
    : day.duration_min
      ? `${day.duration_min} min`
      : null
  const hr = day.hr ? `${day.hr.min}-${day.hr.max} bpm` : null
  const hasDetail = Boolean(day.how || day.why)
  const distance = day.distance_km > 0 ? `${day.time_based && day.type !== 'race' ? '~' : ''}${day.distance_km} km` : null

  if (isRest) {
    return (
      <View className="flex-row items-center gap-4 px-5 py-3">
        <DateBlock weekday={weekday} dateLabel={dateLabel} isToday={isToday} />
        <View className="flex-1 pl-1">
          <Text className="text-sm font-medium text-zinc-400">{day.title || t.workout.types.rest}</Text>
          {!!day.purpose && <Text className="text-xs leading-4 text-zinc-600">{day.purpose}</Text>}
        </View>
      </View>
    )
  }

  const showQuick = canLog && !completed && !locked
  return (
    <View
      className={`overflow-hidden rounded-card border bg-surface ${isToday ? 'border-primary/50' : 'border-surface-line'} ${
        completed || locked ? 'opacity-60' : ''
      }`}
    >
      <View className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} />
      <View className="p-5 pl-6">
        <View className="flex-row items-start gap-4">
          <DateBlock weekday={weekday} dateLabel={dateLabel} isToday={isToday} />
          <View className="flex-1">
            <Text className={`text-xs font-semibold ${style.text}`}>{t.workout.types[day.type] || day.type}</Text>
            <Text className="mt-0.5 text-base font-semibold leading-snug text-zinc-50">{day.title}</Text>
          </View>
          {locked ? (
            <Ionicons name="lock-closed-outline" size={20} color={colors.zinc600} accessibilityLabel={t.workout.lockedHint} />
          ) : completed ? (
            <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
              <Ionicons name="checkmark" size={18} color="#6EE7B7" />
            </View>
          ) : (
            canLog && (
              <Pressable
                onPress={openPrefilledForm}
                className="min-h-[36px] flex-row items-center gap-1.5 rounded-full border border-white/10 bg-surface-raised px-3 active:opacity-70"
              >
                <Ionicons name="pencil-outline" size={14} color="#D4D4D8" />
                <Text className="text-xs font-medium text-zinc-300">{isTrial ? t.goals.trial.logIt : t.workout.adjust}</Text>
              </Pressable>
            )
          )}
        </View>

        <View className="mt-4 flex-row flex-wrap gap-y-3">
          <Metric label={t.workout.distance} value={distance} />
          <Metric label={t.workout.time} value={time} />
          {!hasSegments && (
            <>
              <Metric label={t.workout.pace} value={day.pace_range || day.pace} />
              <Metric label={t.workout.heartRate} value={hr} />
            </>
          )}
        </View>

        {hasSegments && (
          <View className="mt-4 rounded-xl bg-canvas/70 p-4">
            {segments.map((segment, i) => (
              <Segment key={i} segment={segment} last={i === segments.length - 1} />
            ))}
          </View>
        )}

        {(day.strides || day.note || day.strength_note) && (
          <View className="mt-4 gap-1.5 border-l-2 border-zinc-800 pl-3">
            {!!day.strides && <Text className="text-xs leading-5 text-zinc-400">Pospeški: {day.strides}</Text>}
            {!!day.note && <Text className="text-xs leading-5 text-zinc-400">{day.note}</Text>}
            {!!day.strength_note && <Text className="text-xs leading-5 text-zinc-400">{day.strength_note}</Text>}
          </View>
        )}

        {showQuick && !isTrial && onQuickLog && (
          <Pressable
            onPress={() => onQuickLog(day, date)}
            disabled={quickLogging}
            className={`mt-4 min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl px-4 active:opacity-80 ${
              isToday ? 'bg-primary' : 'border border-white/10 bg-surface-raised'
            } ${quickLogging ? 'opacity-60' : ''}`}
          >
            {quickLogging ? (
              <Text className="text-sm font-semibold text-white">{t.workout.logging}</Text>
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={isToday ? '#fff' : '#F4F4F5'} />
                <Text className={`text-sm font-semibold ${isToday ? 'text-white' : 'text-zinc-100'}`}>
                  {t.workout.doneAsPlanned}
                </Text>
              </>
            )}
          </Pressable>
        )}

        {showQuick && isTrial && (
          <Pressable
            onPress={openPrefilledForm}
            className="mt-4 min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 active:opacity-80"
          >
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text className="text-sm font-semibold text-white">{t.goals.trial.logIt}</Text>
          </Pressable>
        )}

        {hasDetail && (
          <>
            <Pressable
              onPress={() => setOpen((o) => !o)}
              accessibilityState={{ expanded: open }}
              className="mt-2 min-h-[40px] flex-row items-center justify-center gap-1.5"
            >
              <Text className="text-sm font-medium text-zinc-500">{t.workout.details}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.zinc500} />
            </Pressable>
            {open && (
              <View className="mt-1 gap-4 rounded-xl bg-canvas/70 p-4">
                {!!day.how && (
                  <View>
                    <Text className="text-xs font-semibold text-primary-light">{t.workout.howTo}</Text>
                    <Text className="mt-1 text-sm leading-5 text-zinc-200">{day.how}</Text>
                  </View>
                )}
                {!!day.why && (
                  <View>
                    <Text className="text-xs font-semibold text-primary-light">{t.workout.why}</Text>
                    <Text className="mt-1 text-sm leading-5 text-zinc-300">{day.why}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  )
}
