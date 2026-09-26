import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getHealthProfile, saveHealthProfile, deleteHealthProfile, updateProfile } from '../../src/core/db'
import { t } from '../../src/core/strings'
import { Button, Card, Input, Label, Spinner, Text } from './ui'
import { Choice } from './Chips'
import { parseDecimal } from '../lib/parse'
import { colors } from '../lib/theme'

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
  pelvic_floor_symptoms: null,
  severe_tear: null,
  height_gain_cm_3mo: '',
}

const YES_NO = [
  { value: true, label: t.onboarding.yes },
  { value: false, label: t.onboarding.no },
]

const numOrNull = (v) => (v === '' || v == null ? null : parseDecimal(v))

/**
 * "Zdravstveni profil" — optional health data (GDPR special category).
 * Nothing is asked before the runner accepts the consent line, only what the
 * plan engine reads is stored, and one button deletes all of it (including the
 * safety answers from onboarding). Empty fields make the engine choose the
 * conservative option. Same behaviour as the web component.
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
            height_cm: row.height_cm != null ? String(row.height_cm) : '',
            marathons_completed: row.marathons_completed != null ? String(row.marathons_completed) : '',
            height_gain_cm_3mo: row.height_gain_cm_3mo != null ? String(row.height_gain_cm_3mo) : '',
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
  const teen = Number(profile.age) > 0 && Number(profile.age) < 18
  const needsClearance = form.cardiac_symptoms === true || form.known_condition === true

  const flash = (msg) => {
    setStatus(msg)
    setTimeout(() => setStatus(''), 4000)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const fields = {
        ...form,
        height_cm: numOrNull(form.height_cm),
        marathons_completed: numOrNull(form.marathons_completed),
        medical_clearance: needsClearance ? form.medical_clearance : null,
        caesarean: postpartum ? form.caesarean : null,
        postpartum_cleared: postpartum ? form.postpartum_cleared : null,
        pelvic_floor_symptoms: postpartum ? form.pelvic_floor_symptoms : null,
        severe_tear: postpartum ? form.severe_tear : null,
        height_gain_cm_3mo: teen ? numOrNull(form.height_gain_cm_3mo) : null,
      }
      for (const k of ['height_cm', 'marathons_completed', 'height_gain_cm_3mo']) {
        if (Number.isNaN(fields[k])) fields[k] = null
      }
      const row = await saveHealthProfile(profile.id, fields, stored?.consent_at || new Date().toISOString())
      setStored(row)
      flash(H.saved)
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
      flash(H.deleted)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <View className="mb-1 flex-row items-center gap-2">
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.zinc400} />
        <Text className="text-base font-semibold">{H.title}</Text>
      </View>
      <Text className="mb-4 text-sm leading-5 text-zinc-500">{H.body}</Text>

      {stored === undefined && !error ? (
        <View className="h-24 items-center justify-center">
          <Spinner />
        </View>
      ) : !consent ? (
        <View className="gap-4">
          <Text className="rounded-xl bg-canvas/70 p-4 text-sm leading-5 text-zinc-300">{H.consent}</Text>
          <Button title={H.accept} onPress={() => setConsent(true)} />
        </View>
      ) : (
        <View className="gap-6">
          <Text className="text-sm text-zinc-500">{H.optionalHint}</Text>
          <Choice label={H.sex} value={form.sex} onChange={set('sex')} options={H.sexOptions} />
          <View>
            <Label>{H.height}</Label>
            <View className="flex-row items-center gap-2">
              <Input className="flex-1" keyboardType="number-pad" placeholder="172" value={form.height_cm} onChangeText={set('height_cm')} />
              <Text className="text-sm text-zinc-500">cm</Text>
            </View>
          </View>
          <Choice label={H.cardiac} value={form.cardiac_symptoms} onChange={set('cardiac_symptoms')} options={YES_NO} />
          <Choice label={H.condition} value={form.known_condition} onChange={set('known_condition')} options={YES_NO} />
          {needsClearance && <Choice label={H.clearance} value={form.medical_clearance} onChange={set('medical_clearance')} options={YES_NO} />}
          {postpartum && (
            <>
              <Choice label={H.caesarean} value={form.caesarean} onChange={set('caesarean')} options={YES_NO} />
              <Choice label={H.postpartumCleared} value={form.postpartum_cleared} onChange={set('postpartum_cleared')} options={YES_NO} />
              <Choice label={H.pelvicFloor} value={form.pelvic_floor_symptoms} onChange={set('pelvic_floor_symptoms')} options={YES_NO} />
              <Choice label={H.severeTear} value={form.severe_tear} onChange={set('severe_tear')} options={YES_NO} />
            </>
          )}
          {teen && (
            <View>
              <Label>{H.heightGain}</Label>
              <Input keyboardType="decimal-pad" placeholder="0" value={form.height_gain_cm_3mo} onChangeText={set('height_gain_cm_3mo')} />
            </View>
          )}
          <View>
            <Label>{H.marathons}</Label>
            <Input keyboardType="number-pad" placeholder="0" value={form.marathons_completed} onChangeText={set('marathons_completed')} />
          </View>
          <Button busy={busy} title={H.save} onPress={save} />
        </View>
      )}

      <Pressable onPress={removeAll} disabled={busy} className={`mt-5 min-h-[44px] flex-row items-center justify-center gap-1.5 ${busy ? 'opacity-50' : ''}`}>
        <Ionicons name="trash-outline" size={16} color={colors.zinc500} />
        <Text className="text-sm text-zinc-500">{H.deleteAll}</Text>
      </Pressable>
      {!!status && <Text className="mt-3 text-sm text-primary-light">{status}</Text>}
      {!!error && <Text className="mt-3 text-sm text-rose-300">{error}</Text>}
    </Card>
  )
}
