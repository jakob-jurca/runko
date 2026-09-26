import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildReminders, DEFAULT_REMINDERS } from './reminders'
import { t } from '../../src/core/strings'

/**
 * Local notifications with expo-notifications: scheduled on the device, no
 * server, no push token. Everything is a no-op in the browser preview and
 * degrades quietly wherever the native module is missing or limited (Expo Go
 * on Android).
 */
const SETTINGS_KEY = 'runko_reminders_v1'
const CHANNEL = 'reminders'

let Notifications = null
function native() {
  if (Platform.OS === 'web') return null
  if (Notifications) return Notifications
  try {
    Notifications = require('expo-notifications')
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    })
  } catch (err) {
    console.warn('[reminders] expo-notifications unavailable:', err?.message)
    Notifications = null
  }
  return Notifications
}

export async function loadReminderSettings() {
  try {
    return { ...DEFAULT_REMINDERS, ...(JSON.parse(await AsyncStorage.getItem(SETTINGS_KEY)) || {}) }
  } catch {
    return { ...DEFAULT_REMINDERS }
  }
}

export function saveReminderSettings(settings) {
  return AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {})
}

/** Ask for permission (only ever called after an explicit opt-in). Returns 'granted' | 'denied' | 'unavailable'. */
export async function ensurePermission() {
  const N = native()
  if (!N) return 'unavailable'
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CHANNEL, { name: t.reminders.title, importance: N.AndroidImportance.DEFAULT })
    }
    const current = await N.getPermissionsAsync()
    if (current.granted) return 'granted'
    const asked = await N.requestPermissionsAsync()
    return asked.granted ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}

/**
 * Replace everything scheduled with what the plan says for the next two
 * weeks. Cheap to call often (app start, dashboard load, settings change).
 * @returns {Promise<number>} how many reminders are scheduled
 */
export async function rescheduleReminders(plans, settings) {
  const N = native()
  if (!N) return 0
  try {
    const s = settings || (await loadReminderSettings())
    await N.cancelAllScheduledNotificationsAsync()
    if (!s.morning && !s.evening) return 0
    if (!(await N.getPermissionsAsync()).granted) return 0
    const reminders = buildReminders(plans, s)
    for (const r of reminders) {
      await N.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
      })
    }
    return reminders.length
  } catch (err) {
    console.warn('[reminders] scheduling failed:', err?.message)
    return 0
  }
}
