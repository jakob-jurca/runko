import AsyncStorage from '@react-native-async-storage/async-storage'

/** In-progress onboarding survives app restarts (same key as the web draft). */
export const DRAFT_KEY = 'runko_onboarding_v1'

export async function loadDraft() {
  try {
    return JSON.parse(await AsyncStorage.getItem(DRAFT_KEY)) || {}
  } catch {
    return {}
  }
}

export function saveDraft(draft) {
  return AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {})
}

export function clearDraft() {
  return AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
}
