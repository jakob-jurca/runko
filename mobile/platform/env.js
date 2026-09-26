/**
 * platform/env.js — mobile replacement for src/core/env.js (Metro redirects
 * the import, see metro.config.js). Same exported names, EXPO_PUBLIC_ vars.
 * Only the Supabase URL and anon key: no AI key exists in the app, ai.js calls
 * the ai-proxy Edge Function.
 */
import { authStorage } from './storage'

const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '')

export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : false

export const SUPABASE_URL = clean(process.env.EXPO_PUBLIC_SUPABASE_URL)
export const SUPABASE_ANON_KEY = clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)

export const AUTH_OPTIONS = { storage: authStorage, detectSessionInUrl: false }
