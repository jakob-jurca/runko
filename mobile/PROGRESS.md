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

## Phase 6: verification — done
- Mobile tests (`cd mobile && npm test`): 78 checks (auth links, session storage adapter, knowledge bundle vs Vite glob, env adapter names, Metro redirects, decimal parsing, onboarding seed, reminders).
- Web: `npm test` 1902 checks pass, `npm run build` succeeds (verify-bundle clean).
- Mobile bundles export for Android, iOS and web; expo-doctor 21/21.
- NOT verified (needs a real device or Supabase project): everything at runtime. Screens compile and the logic is tested, but none was run on a phone or in a browser (browser automation was off limits).

## To catch up (web changes of 2026-09-30, not yet in mobile/)
The web app got three fixes that live partly in shared src/core (already active on mobile where
mobile calls core) and partly in web screens (NOT yet on mobile). Nothing in mobile/ was edited;
`npm test` here still passes (78 checks). Manual test list: ../AUTH_CHECKLIST.md.

Already shared, no mobile work needed:
- Coach scope: `askCoach` answers plainly off-topic messages with a fixed Slovenian redirect and no
  AI call; `extractMemories` skips them; the persona has a SCOPE section; every AI call sends a
  `kind` and the ai-proxy caps reply length per kind (prose 1024 tokens).
- Plan engine: `safe_goal: 'override'` + `override_confirmed: true` builds an unsafe goal against
  advice; `proposal.override_allowed`, `explain.risk_texts`, `planning.against_advice`. Without
  those answers mobile behaves exactly as before.
- Strings: new keys only (t.auth.errors, t.auth.sessionEnded, t.settings.account, t.onboarding.override*,
  t.dashboard.againstAdvice, t.plan.againstAdvice, t.chat.offTopic…); `walkBase` intro wording fixed.

Auth screens (app/auth.jsx, app/reset-password.jsx, context/AuthContext.jsx, (tabs)/settings.jsx):
- Use `src/core/auth-flows.js` (signUp, logIn, requestPasswordReset, resendConfirmation,
  setNewPassword, changePassword, signOutHere) instead of calling supabase.auth directly. Today
  `app/auth.jsx` shows `err.message`, i.e. Supabase's English ("Invalid login credentials").
- Sign-up: recognise a duplicate address when email confirmation is on (empty `identities`), and
  lower-case + trim the address (`normalizeEmail`).
- Login: offer "Pošlji potrditveno sporočilo znova" on `email_not_confirmed`; offer the reset link
  on `invalid_credentials` / `user_exists` (by result code, not by matching English text).
- Log out: `supabase.auth.signOut()` defaults to EVERY device. Use `signOutHere` (scope local) and,
  when it reports `stuck` (offline), drop the stored session anyway.
- Startup: `AuthContext` clears the session on ANY `getUser()` error, so opening the app offline
  logs the runner out. Clear only when `isDeadSessionError(error)`.
- Profile: reload on user id change, not on every session object (TOKEN_REFRESHED / app resume
  replace the session and flash the spinner). Treat a failed profile read as an error screen with
  "Poskusi znova" (`t.auth.profileLoadFailed`), never as "no profile" → onboarding.
- Session ended without asking (SIGNED_OUT not triggered by the runner): show `t.auth.sessionEnded`
  on the login screen.
- Account switch: clear the onboarding draft when a different user id signs in (web: `runko_last_user`).
- Reset screen: show the new-password form only while `recovery` is true; an ordinary session goes
  to Settings. Show the account's email above the form.
- Settings: add "Račun → Spremeni geslo" (current + new + repeat) using `changePassword`, strings in
  `t.settings.account`. Email stays read-only (change email is not supported).
- Dashboard: the cached daily coach message key (`runko_motd_${todayISO()}` in (tabs)/index.jsx)
  must include the profile id, or the next account on the device sees the last one's message.
- Other screens: replace `setError(err.message)` with `friendlyError(err)` from `src/core/errors.js`.
- Optional: support `?token_hash=…&type=recovery` links (`parseAuthUrl`, `confirmEmailLink` behind
  a "Nadaljuj" button) if the reset email template is switched to them (AUTH_CHECKLIST.md §0).

Unsafe goals (app/onboarding.jsx):
- Verdict screen: show `preview.explain.risk_texts` + `t.planning.risk.body` under "Zakaj je
  tvegano" (`t.onboarding.verdictWhy`), the safer alternatives as today, then a third option
  "Vseeno naredi plan" when `preview.proposal.override_allowed`; it opens a screen with
  `t.onboarding.overrideBody`, one confirmation checkbox (`t.onboarding.overrideConfirm`) and the
  button, which builds with `{ safe_goal: OVERRIDE_GOAL, override_confirmed: true }`
  (`OVERRIDE_GOAL` from src/core/planning/feasibility.js). When not allowed, show
  `t.onboarding.overrideNotAllowed`.
- `prepare()` must drop `safe_goal` and `override_confirmed` from the answers before previewing
  (web does): a choice saved in the draft for an earlier goal must never carry over, least of all
  a risk confirmation.
- Dashboard ((tabs)/index.jsx): a small persistent note `t.dashboard.againstAdvice` while
  `plans[0].plan_json.planning.against_advice` is set and the plan has not ended.
- Plan tab: for `explain.against_advice` show `t.plan.againstAdvice` and the first safer option
  (`t.plan.saferOption`) instead of "Tvoj prvotni cilj / Načrt je zgrajen za".

## To catch up (web changes of 2026-10-03: paid plans, Start / Pro)
Nothing in mobile/ was edited. Until these land, mobile still reads the RETIRED rule (old no-card
trial on the profile row) through deprecated exports kept in src/core/subscription.js
(`hasPremium`, `isTrialActive`, `hasActiveSubscription`, `trialDaysLeft`, `startCheckout`, `PLANS`).
The server enforces the new rules either way, so mobile cannot over-spend; it can only show the
wrong screens.

- Access: load `fetchAccess()` (src/core/subscription.js) next to the profile in
  context/AuthContext.jsx, keyed on the user id, with "Poskusi znova" on failure (web: `access`,
  `accessError`, `refreshAccess`). Gate every screen with `canUseApp(access)`; tier `none` shows
  the paywall only. Replace every `hasPremium(profile)` / `isTrialActive(profile)` /
  `trialDaysLeft(profile)` with the access versions (`canUseApp`, `isTrial`, `trialDaysLeft(access)`).

## Blocked / questions
- None blocking. Open item: in-app account deletion (see Phase 5) must be built before store submission.
