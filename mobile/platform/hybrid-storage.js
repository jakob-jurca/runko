/**
 * Session storage for supabase-js on React Native.
 *
 * expo-secure-store refuses values above ~2 KB and a Supabase session is
 * bigger, so small values go to the keychain/keystore and large ones fall
 * back to AsyncStorage. Pure logic over two injected stores, so it is tested
 * without a device.
 */
export const SECURE_LIMIT = 1800

export function createHybridStorage(secure, fallback, limit = SECURE_LIMIT) {
  return {
    async getItem(key) {
      let value = null
      try { value = await secure.getItemAsync(key) } catch { /* fall through */ }
      if (value != null) return value
      return fallback.getItem(key)
    },
    async setItem(key, value) {
      if (value.length <= limit) {
        try {
          await secure.setItemAsync(key, value)
          await fallback.removeItem(key)
          return
        } catch { /* secure store unavailable: use the fallback */ }
      }
      try { await secure.deleteItemAsync(key) } catch { /* nothing stored */ }
      await fallback.setItem(key, value)
    },
    async removeItem(key) {
      try { await secure.deleteItemAsync(key) } catch { /* nothing stored */ }
      await fallback.removeItem(key)
    },
  }
}
