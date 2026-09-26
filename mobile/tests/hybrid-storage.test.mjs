import { check, summary } from '../../tests/harness.mjs'
import { createHybridStorage, SECURE_LIMIT } from '../platform/hybrid-storage.js'

function fakeStores({ secureBroken = false } = {}) {
  const sec = new Map()
  const fb = new Map()
  const secure = {
    getItemAsync: async (k) => { if (secureBroken) throw new Error('x'); return sec.get(k) ?? null },
    setItemAsync: async (k, v) => { if (secureBroken) throw new Error('x'); sec.set(k, v) },
    deleteItemAsync: async (k) => { sec.delete(k) },
  }
  const fallback = {
    getItem: async (k) => fb.get(k) ?? null,
    setItem: async (k, v) => { fb.set(k, v) },
    removeItem: async (k) => { fb.delete(k) },
  }
  return { sec, fb, storage: createHybridStorage(secure, fallback) }
}

{
  const { sec, fb, storage } = fakeStores()
  await storage.setItem('k', 'small')
  check('small value goes to the secure store', sec.get('k') === 'small' && !fb.has('k'))
  check('small value reads back', (await storage.getItem('k')) === 'small')
}
{
  const { sec, fb, storage } = fakeStores()
  const big = 'x'.repeat(SECURE_LIMIT + 1)
  await storage.setItem('k', big)
  check('large value falls back to AsyncStorage', fb.get('k') === big && !sec.has('k'))
  check('large value reads back', (await storage.getItem('k')) === big)
}
{
  const { sec, fb, storage } = fakeStores()
  await storage.setItem('k', 'small')
  await storage.setItem('k', 'y'.repeat(SECURE_LIMIT + 5))
  check('growing value leaves no stale secure copy', !sec.has('k') && fb.has('k'))
  await storage.setItem('k', 'tiny')
  check('shrinking value leaves no stale fallback copy', sec.get('k') === 'tiny' && !fb.has('k'))
}
{
  const { sec, fb, storage } = fakeStores()
  await storage.setItem('k', 'a')
  await storage.removeItem('k')
  check('remove clears both stores', !sec.has('k') && !fb.has('k') && (await storage.getItem('k')) === null)
}
{
  const { fb, storage } = fakeStores({ secureBroken: true })
  await storage.setItem('k', 'small')
  check('broken secure store degrades to AsyncStorage', fb.get('k') === 'small' && (await storage.getItem('k')) === 'small')
}

export const result = summary('hybrid-storage')
