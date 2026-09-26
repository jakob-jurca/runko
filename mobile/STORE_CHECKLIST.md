# Runko: App Store and Google Play checklist

Everything below is done by you (accounts, legal, store listings). The code side is configured:
`app.json` (name Runko, `si.runko.app` on both stores, version 0.1.0, dark splash, adaptive icon),
`eas.json` (development, preview, production). Nothing is submitted.

## 1. Accounts

- [ ] **Apple Developer Program**, 99 USD per year, https://developer.apple.com/programs/ (individual or organisation; an organisation needs a D-U-N-S number and takes longer).
- [ ] **Google Play Console**, 25 USD once. A new personal account must run a closed test with 12+ testers for 14 days before it can publish to production.
- [ ] **Expo account** (free) at https://expo.dev.

## 2. EAS (builds and submission)

```
npm install -g eas-cli
eas login
cd mobile
eas init                      # creates the project id, writes it into app.json
eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<project>.supabase.co" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"                    --environment production --visibility sensitive
eas build --profile preview --platform android      # installable APK for your own testing
eas build --profile production --platform all       # store builds
eas submit --platform ios / android                 # later, when the listings are ready
```

`.env` is git-ignored and is not uploaded by EAS, so the two `EXPO_PUBLIC_` values must be set with `eas env:create`
(repeat for the `preview` and `development` environments). Only the Supabase URL and anon key are ever needed;
there is no AI key in the app.

For iOS builds EAS asks to sign in to your Apple account and creates certificates and the App ID `si.runko.app` for you.
For Android it creates the upload keystore; keep a backup (`eas credentials`).

## 3. Legal, required by both stores

- [ ] **Privacy policy URL** (public web page, in Slovenian and preferably English). It must say: which data is collected (below),
      why, where it is stored (Supabase, region), that chat messages are processed by an AI provider (Groq) through the
      Runko server, retention, how to delete data, and a contact e-mail. Enter the URL in both stores and in the app's
      settings later.
- [ ] **Terms of use / EULA** (Apple also accepts its standard EULA).
- [ ] **Medical disclaimer** in the listing description: Runko does not replace a doctor (already the tone of the app).
- [ ] **Account deletion.** Apple (guideline 5.1.1(v)) and Google Play both require that an app which lets people create an
      account also lets them delete it from inside the app, and Google also wants a public web page for it.
      **This is not built yet**: the app can delete the health profile, coach memories and chat, but not the account
      itself. It needs a Supabase Edge Function that deletes the auth user and cascades their rows. Do this before submitting.
- [ ] Sign in with Apple is not required (e-mail and password only, no third-party login).

## 4. App Store privacy labels ("App Privacy" in App Store Connect)

Data is **collected and linked to the user**, **not used for tracking**, no ads, no third-party analytics.

| Data type | Why | Notes |
| --- | --- | --- |
| Contact info: e-mail address, name | App functionality, account | Name is what the runner typed |
| Health & Fitness: health (optional profile, safety answers such as injury, pain, pregnancy status) | App functionality | **Optional**, consent shown first, deletable in the app |
| Health & Fitness: fitness (runs: distance, time, effort, heart-rate notes) | App functionality | |
| Body: age, weight, sex, height | App functionality | Age and weight required in onboarding, sex and height optional |
| User content: chat messages, coach notes | App functionality | Sent to the AI provider through the Runko server |
| Identifiers: user ID | App functionality | Supabase user id |
| Purchases | (later, via RevenueCat) | Add when subscriptions go live |

Google Play "Data safety" form: same list; data is encrypted in transit; users can request deletion; declare that health
information is collected. Also fill in the "Health apps" declaration (Play Console → App content).

## 5. Store listing material

- [ ] **Screenshots**: iPhone 6.9" (1290 x 2796) at least, iPad only if you enable tablets (currently `supportsTablet: false`);
      Android phone screenshots (min 2, 16:9 or 9:16). Take them in a development or preview build with a demo account.
- [ ] **Icon**: 1024 x 1024 (a placeholder made from the Runko logo is in `assets/images/`; replace with the final artwork).
      Play also needs a 512 x 512 icon and a 1024 x 500 feature graphic.
- [ ] Name, subtitle (30 chars), description, keywords, support URL, marketing URL, promotional text, in Slovenian (add English).
- [ ] Category: Health & Fitness.
- [ ] **Age rating**: fill the questionnaires honestly. The app has a minimum age of 15 (Slovenian digital consent age), no violence,
      no gambling, no user-to-user chat; it gives health and training information, so answer the "medical / treatment information"
      question. Expect roughly 12+ (Apple) and PEGI 3 to 12 / "Everyone" to "Teen" (Google). Set the minimum age in your terms to 15.
- [ ] App Review notes: give the reviewers a demo account (e-mail and password) that has a plan, and say the AI coach is a
      premium feature that is on for the first month, so they can see it.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption` is already `false` (only standard HTTPS).

## 6. In-app purchases later (RevenueCat)

The paywall is UI only and the subscribe button says "kmalu" (coming soon). Apple and Google require their own billing for
digital subscriptions, so the plan is:

1. Create the subscription products in App Store Connect and Play Console (`premium_monthly`).
2. Create a RevenueCat project, add both apps, entitlement `premium`.
3. Add `react-native-purchases` (needs a development build, does not run in Expo Go).
4. A RevenueCat webhook (Supabase Edge Function) sets `users.subscription_status = 'active'`. The `ai-proxy` function
   already enforces premium on the server, so the app needs no other change; `startCheckout()` in `src/core/subscription.js`
   is the single place to call the purchase sheet.
5. Add "Restore purchases", the price and renewal terms on the paywall (Apple requires them), and links to the privacy policy and terms.
6. Web (Stripe) and store subscriptions must end up in the same `subscription_status`.

## 7. HealthKit / Health Connect (not added yet)

Not part of this version. When you want it (for example importing runs from Apple Watch):

**iOS, HealthKit**
- Needs a **development build** (not Expo Go) with a config plugin such as `@kingstinct/react-native-healthkit`.
- Entitlement `com.apple.developer.healthkit` (the plugin adds it) and the HealthKit capability on the App ID in the developer portal.
- `NSHealthShareUsageDescription` (and `NSHealthUpdateUsageDescription` if writing) in Slovenian, saying exactly why.
- **Apple review of health data use** (guideline 5.1.3): health data must not be used for advertising or sold, must not be stored in
  iCloud, only the types actually needed may be requested, and the privacy policy and App Privacy labels must describe it.
  Expect questions from the reviewer; explain it in the App Review notes.
- Request read access to workouts and heart rate only, at the moment the runner taps "connect", never at launch.

**Android, Health Connect**
- Development build with `react-native-health-connect` and its plugin; declare permissions and the privacy-policy activity.
- Google Play Console **Health Connect permissions declaration form** and a compliant privacy policy, reviewed before release.

## 8. Before the first store submission, quick list

- [ ] Account deletion built (section 3)
- [ ] Privacy policy and terms published, URLs entered
- [ ] Supabase Redirect URLs include `runko://reset-password`
- [ ] EAS env values set for `production`
- [ ] `eas build --profile production`, then test the build on a real iPhone and a real Android phone (notifications, reset-password link, keyboard in chat)
- [ ] Internal testing (TestFlight / Play internal track), then production
