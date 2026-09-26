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

## Phase 3: core screens — done (bundles for Android; not run on a device)
Order as asked, all reusing src/core: Dashboard (app/(tabs)/index.jsx: week, ring, phase, coach message or free-tier text, create plan, goal progress, end-of-block card, pull to refresh), WorkoutCard (2x2 figures, segment timeline, rest row, Podrobnosti, one-tap done, Prilagodi), Log (prefill, unplanned, time trial min+sec, date picker capped at today), Chat (inverted FlatList = opens at the bottom, load earlier, clear dialog, KeyboardAvoidingView), Plan overview, Onboarding (full flow incl. Tekma/Samo tečem, goals, block length, safety questions, gate/verdict/clarify), Settings, Zdravstveni profil (own screen, consent first, delete all), Paywall (UI only, "kmalu").
Notes: web's hardcoded English "Continue" buttons use t.common.continue; decimal commas from Slovenian keyboards are normalised (lib/parse.js); a saved run resets the Log tab; Geist Mono is not used (Geist with tabular numbers).

## Phase 4: mobile-only features — done
- Local reminders (lib/reminders.js pure + lib/notifications.js expo-notifications + Settings "Opomniki"): morning reminder with today's workout (type, distance, time range) at a chosen time (default 7:30), evening-before reminder (19:00) for long run / tempo / intervals / repetitions / time trial / race. Both OFF by default; the permission is asked only on opt-in. Rescheduled for the next 14 days on dashboard load and settings change. No server.
- Haptics on quick-log and on saving a run (expo-haptics). Pull to refresh on Dashboard (done in phase 3).
- Core change: `t.reminders` strings in src/core/strings.js (web suite 1902 checks pass).
- Expo Go note: on Android, Expo Go limits expo-notifications; use a development build to test reminders there.

## Phase 5: store readiness (configuration only) — done
- app.json: name Runko, `si.runko.app` (iOS bundle id, Android package), version 0.1.0, scheme `runko`, dark UI, dark splash (#0B0B0D), adaptive icon (foreground + monochrome + colour background), ITSAppUsesNonExemptEncryption false. Icons generated from public/runko.svg (placeholders).
- eas.json: development (dev client, internal), preview (internal APK), production (auto increment). expo-dev-client added.
- STORE_CHECKLIST.md: accounts, EAS login and env, privacy policy, privacy labels, screenshots, age rating, RevenueCat later, HealthKit/Health Connect requirements.
- FLAGGED: the app has no in-app **account deletion**, which Apple and Google require before release (needs an Edge Function). Written into the checklist; not built (out of scope, backend change).
