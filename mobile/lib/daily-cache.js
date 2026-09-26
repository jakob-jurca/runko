import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Per-device UI cache (the web uses sessionStorage for the same purpose).
 * Every read and write is guarded: the cache is a convenience, never state.
 */
export async function cacheGet(key) {
  try {
    return await AsyncStorage.getItem(key)
  } catch {
    return null
  }
}

export async function cacheSet(key, value) {
  try {
    await AsyncStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
