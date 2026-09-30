# Account flows: manual checklist

Everything that can run without a browser is automated in `tests/auth.test.mjs`
(`npm test`): every flow in `src/core/auth-flows.js` against an in-memory
stand-in for Supabase Auth, the emailed-link parsing in `src/core/auth-url.js`,
the Slovenian error mapping, and static checks on the screens. This list is the
rest: what needs a real inbox, several tabs, a second device or a network you
can switch off.

Web only for now. The mobile app has not caught up yet (see `mobile/PROGRESS.md`,
"To catch up"), so do not tick mobile behaviour off from this list.

Use a test address you can read (`ime+test1@gmail.com`, `+test2`, …: Gmail
delivers them all to one inbox). Production is https://runko-omega.vercel.app.

## 0. Supabase settings (once, in the dashboard)

- [ ] **Authentication → URL Configuration → Site URL** is `https://runko-omega.vercel.app`.
- [ ] **Redirect URLs** contain `https://runko-omega.vercel.app/**` and, for local testing,
      `http://localhost:5173/**` (the reset link goes to `/reset-password`; a missing entry
      silently falls back to the Site URL).
- [ ] **Email confirmation** is currently OFF (checked on 2026-09-30: `mailer_autoconfirm: true`).
      Section 1b only applies if you turn it on.
- [ ] **Emails actually arrive.** Supabase's built-in email sender allows only a few emails per
      hour for the whole project. If testers "never got the reset email", this is the likely
      cause: set up custom SMTP under **Authentication → Emails → SMTP Settings**. The app now
      says "Sporočila trenutno ne moremo poslati. Počakaj nekaj minut…" instead of English when
      the limit is hit.
- [ ] Recommended: **Authentication → Providers → Email → Secure password change** ON. The app's
      Settings form already checks the current password; this makes the server insist too.
- [ ] Optional, recommended if testers use Outlook or company mail: mail scanners open every link
      in a message, and an opened one-time link is a used one ("Povezava ne deluje več" on the
      first real click). Change **Emails → Templates → Reset password** so the button links to
      `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery`. The app then
      shows a "Nadaljuj" button and spends the link only when it is pressed. The default template
      keeps working as before if you leave it.

## 1. Sign up

- [ ] New address, password `testtest1` → onboarding opens. Settings shows the address in lower
      case even if you typed ` Ime+Test1@Gmail.com ` with capitals and a trailing space.
- [ ] Same address again → "Račun s tem e-naslovom že obstaja. Prijavi se ali ponastavi geslo."
      with a "Ponastavi geslo →" link.
- [ ] Password `12345` → the browser refuses (6 characters minimum) before anything is sent.
- [ ] Address `ime.primer.si` → the browser refuses (not an email).
- [ ] DevTools → Network → Offline, sign up → "Ni povezave s strežnikom…", no English.

### 1b. Only if email confirmation is ON

- [ ] Sign up → "Preveri e-pošto in potrdi račun, nato se prijavi." Email arrives; its link
      signs you in and opens onboarding.
- [ ] Log in before confirming → "E-naslov še ni potrjen…" and a "Pošlji potrditveno sporočilo
      znova" button; pressing it → "Potrditveno sporočilo je na poti…", a second email arrives.
- [ ] Sign up again with the same unconfirmed or confirmed address → "Račun s tem e-naslovom že
      obstaja…" (not "check your email": Supabase sends nothing in that case).

## 2. Log in

- [ ] Right password → dashboard.
- [ ] Wrong password → "E-naslov ali geslo ni pravilno…" with "Ponastavi geslo →".
- [ ] Unknown address → exactly the same message (the app never reveals who has an account).
- [ ] While logged in, open `/auth` → you are sent to the dashboard, not shown a login form.
- [ ] Offline → "Ni povezave s strežnikom…".

## 3. Forgot password

- [ ] Login → "Pozabljeno geslo?" → your address → "Če za ta e-naslov obstaja račun, je povezava
      na poti." Email arrives.
- [ ] Unknown address → the same sentence, and no email.
- [ ] Ask twice within a minute → "Sporočila trenutno ne moremo poslati. Počakaj nekaj minut…"
      (not "For security purposes…").
- [ ] **Link in the same browser** → "Nastavi novo geslo" with your address shown above the form.
      Try: different passwords → "Gesli se ne ujemata."; the old password → "Novo geslo mora biti
      drugačno od starega."; a good new one → "Geslo posodobljeno", then the dashboard.
- [ ] Log out, log in with the OLD password → refused. The NEW one → works.
- [ ] **Link on a different device or browser** (e.g. requested on the laptop, opened on the
      phone) → the same form works there.
- [ ] **Used link**: open the same email link again → "Povezava ne deluje več" with a form to
      send a new one.
- [ ] **Expired link**: request two links, open the OLDER one → "Povezava ne deluje več".
      (Supabase links also expire after an hour.)
- [ ] **Link while logged in as someone else**: log in as account A, then open B's reset link
      in the same browser → the form shows B's address; after saving you are B. A's onboarding
      draft (if any) is not carried over to B.
- [ ] While the form is open, open the app in a second tab → it also shows the reset form, not
      the dashboard.
- [ ] "Prekliči in se odjavi" on the form → login screen; reopening the app does not return to
      the reset form.
- [ ] Logged in normally (no link), type `/reset-password` → you land in Settings. Type
      `/#access_token=x&type=recovery` → you do NOT get a form that sets a password without the
      current one.
- [ ] After a successful reset, another device that was logged in on the old password is signed
      out within an hour (its session was revoked).
- [ ] With the optional token_hash template: the email opens "Ponastavitev gesla" with a
      "Nadaljuj" button; only pressing it opens the form. Forward the email to an Outlook address
      first to check a scanner no longer spends it.

## 4. Change password (Settings → Račun → Spremeni geslo)

- [ ] Wrong current password → "Trenutno geslo ni pravilno.", nothing changes.
- [ ] New and repeat differ → "Gesli se ne ujemata."; new equals current → "Novo geslo mora biti
      drugačno od starega."
- [ ] Correct → "Geslo je spremenjeno. Na drugih napravah se bo treba prijaviti znova." You stay
      logged in here; log out and back in with the new password.
- [ ] A second browser that was logged in is signed out within an hour.
- [ ] Your password manager offers to update the saved password for the right address.

## 5. Change email

- [ ] Not supported: Settings shows the address, with no way to edit it. Nothing to test.

## 6. Log out and session expiry

- [ ] Settings → Odjava → login screen. Reopen the app: still logged out.
- [ ] **All tabs**: two tabs open, log out in one → the other leaves the app within a moment and
      its login screen says "Tvoja seja se je končala. Prijavi se znova."
- [ ] **Only this device**: logged in on laptop and phone browser, log out on the laptop → the
      phone stays logged in (this used to log out every device).
- [ ] **Offline logout**: DevTools → Offline, Settings → Odjava → you are logged out anyway.
- [ ] **Offline start**: logged in, go offline, reload → the app does NOT log you out (it used to).
      Pages that need data show "Ni povezave s strežnikom…" or "Tvojega profila ni bilo mogoče
      naložiti" with "Poskusi znova"; back online, "Poskusi znova" brings the dashboard back.
      It never sends you to onboarding.
- [ ] **Revoked session**: log in on two browsers, reset the password in one → in the other,
      reload after a while → login screen with "Tvoja seja se je končala…", not the landing page.
- [ ] **Tab focus**: start typing in Vpiši tek or in the coach chat, switch to another tab for a
      minute, come back → what you typed is still there (no full-screen spinner).
- [ ] Log out as A, log in as B in the same tab → the dashboard's coach message is B's, not A's.

## 7. Errors in Slovenian

- [ ] Nowhere in 1-6 did an English sentence appear (no "Invalid login credentials",
      "User already registered", "For security purposes…", "JWT expired", "Failed to fetch").
