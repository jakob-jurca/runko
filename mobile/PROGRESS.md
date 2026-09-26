# Mobile app progress

(Committed log for mobile/. The repo-root PROGRESS.md carries uncommitted landing-page notes, so it is not staged from here.)

## Phase 1: setup — done
- Expo SDK 57, expo-router, JavaScript, NativeWind 4 (Tailwind 3 tokens copied from the web config), Geist via @expo-google-fonts/geist.
- Metro imports ../src/core directly; proved by app/index.jsx running strings, periodization, supabase and knowledge from core. Android and web bundles export, expo-doctor 21/21.
- Core changes (shared, web tested): `src/core/knowledge-files.js` holds the two import.meta.glob constants (was inline in knowledge.js); `env.js` exports `AUTH_OPTIONS`, spread into the supabase client. Mobile replaces env.js and knowledge-files.js through Metro.
- Supabase session: SecureStore for values <= 1800 chars, AsyncStorage fallback (platform/hybrid-storage.js).

## Phase 2: auth — done
- app/auth.jsx (login, signup, forgot), app/reset-password.jsx, context/AuthContext.jsx (recovery flag persisted in AsyncStorage, written before the session from the link is set; `Linking` reads runko:// and exp:// links; cold start and warm start).
- Guards: app/index.jsx and (tabs)/_layout.jsx redirect recovery -> /reset-password, no session -> /auth, no profile -> /onboarding.
- Supabase Redirect URLs to add: `runko://reset-password` and (Expo Go only) `exp://**`. See README.
- Tests: lib/auth-link.js, platform/hybrid-storage.js, platform adapter (`npm test`, 30 checks).
- Note: Bash tool mangles backslashes in heredocs; code with regexes was written with the Write tool.
