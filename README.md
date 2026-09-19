# Runko 🏃🧡

**Your AI running coach.** Dark, athletic, Nike-Run-Club-inspired MVP built with
React + Tailwind, Supabase (auth + database) and Groq (Llama / GPT-OSS).

## Features

- **Auth & onboarding** — email/password via Supabase, then a two-path
  onboarding (quick or thorough). Every step is skippable: skipping saves what
  you entered and drops you into the app with no plan.
- **Dashboard** — the current training phase and what it is building toward,
  this week's plan with per-day quick-log buttons, an animated weekly progress
  ring, and a daily coach message.
- **Plan overview** (`/plan`) — the coach's plan intro, every week with phase
  markers, the volume curve, your training paces, and an expandable
  day-by-day breakdown.
- **AI Coach Chat** — one ongoing conversation. The coach gets the full
  picture on every message: profile, what it remembers about you, your last 20
  messages, your last 10 runs with paces, today's session and how many weeks
  are left. The view opens already at the bottom, holds the most recent 50
  messages with "Load earlier messages" above them, and can be cleared without
  touching coach memory. *(Premium)*
- **Coach memory** — durable facts are extracted from conversations ("knee
  flares up on back-to-back days", "only runs mornings") and injected into
  every later prompt. Viewable and deletable in Settings.
- **Training Plan Engine** — structure from code, personality from AI. See
  below.
- **Knowledge base** — plain Markdown in [`knowledge/`](knowledge/) that gets
  injected into prompts by situation. Edit a file, change how the coach thinks.
- **Workout logging** — distance / duration / effort (1–5) / notes, plus a
  "missed workout" toggle. The coach reacts, and adapts next week if needed.
- **Integrations (skeleton)** — Strava OAuth stub, Garmin & Apple Watch
  "coming soon". See `src/lib/integrations/`.
- **Subscription (skeleton)** — 1-month free trial, paywall after expiry,
  Stripe-ready `startCheckout()`. All gating goes through `hasPremium()`.
  *(Bypassed in dev builds — see `src/core/subscription.js`.)*
- **Plan rebuilds are unlimited** right now. The once-a-month limit is still
  implemented behind `PLAN_LIMIT_ENABLED` in `src/core/plan.js` and
  `last_plan_created_at` is still written, so it can be switched back on
  without a migration.

## How the training plan is built

The plan used to be AI-invented, which is why it repeated weeks and ignored the
runner. Now the two concerns are separated:

The goal is a **distance in kilometres** — 5, 10, 15, 21.1, 30, 42.2 or any
other number. There is no race-type enum anywhere in the engine, so a 15 km
goal works exactly as well as a marathon. A date is optional, and so is a
target time.

**1. Code calculates the skeleton** (`src/core/periodization.js`)

- VDOT estimated from logged runs with Daniels' formulas, adjusted for
  perceived effort (training runs are not races), and the training paces
  derived from it — easy, marathon, threshold, interval, repetition, plus a
  goal pace for the target distance.
- If a target time is given, it is checked against that VDOT. A realistic or
  ambitious target is chased; one that is far out of reach is replaced by the
  best realistic outcome for the block, and the coach says so plainly in the
  plan intro without discouraging the runner.
- Long runs build toward the goal distance (capped at 32 km), and race day is
  scheduled on the event's actual weekday in the final week.
- Phases from the weeks remaining: base → build → sharpen → taper. General
  fitness rolls base/build cycles instead.
- Volume rises by at most 10% a week; every 4th week drops to ~70%; the final
  two weeks before a race taper to ~70% then ~50% of peak.
- Sessions distributed 80/20 polarized — roughly 80% of volume easy, 20% hard,
  where "hard" means the fast portion, not the whole session.
- Constraints are honoured structurally: no back-to-back running days,
  available weekdays, how many times a week you can run. What the runner
  states explicitly during plan creation beats anything inferred from chat.

**2. The AI writes the words** (`describePlanSkeleton` in `src/core/ai.js`)

It receives the finished skeleton and writes each session's title, description
and purpose, plus a note per week — in Slovenian, in Coach Runko's voice. It
never decides a distance, a pace or a day.

**3. The output is validated against the skeleton**

Any distance or pace the model tried to change is discarded in favour of the
calculated value, with a warning logged. If the AI fails entirely, built-in
descriptions are used: the plan is still fully personalized, only the wording
is generic.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run [`supabase/schema.sql`](supabase/schema.sql) for a new
   database. For an existing one run the migrations you have not applied yet,
   in order: [`migration_v3.sql`](supabase/migration_v3.sql) then
   [`migration_v4.sql`](supabase/migration_v4.sql). Both contain new statements
   only and will not re-issue policies.
3. (For fast local testing) **Authentication → Providers → Email**: disable
   "Confirm email" so signups get a session immediately.
4. Copy the **Project URL** and **anon key** from **Settings → API**.

### 2. Groq

Create an API key at [console.groq.com/keys](https://console.groq.com/keys).

### 3. Environment

```bash
cp .env.example .env
# fill in:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# VITE_GROQ_API_KEY=...
```

### 4. Run

```bash
npm install
npm run dev     # paywall is bypassed in dev
npm test        # training-plan maths — no API key needed
npm run build
```

## Project structure

```
knowledge/                   # Markdown coaching knowledge, injected into prompts
├── README.md                # the file format and how loading works
├── methodology.md  vdot.md  workout-types.md
└── injuries.md  nutrition.md  faq.md  tone.md

src/
├── App.jsx                  # routes + auth guards
├── context/AuthContext.jsx  # Supabase session + profile
├── pages/                   # Auth, Onboarding, Dashboard, Plan, Chat, Log, Settings
├── components/              # NavBar, ProgressRing, WorkoutCard, Paywall, Spinner
├── lib/integrations/        # Strava / Garmin / HealthKit (uses localStorage — UI layer)
└── core/                    # PLATFORM-AGNOSTIC LOGIC — no React, no DOM
    ├── README.md            # the rule, and what a React Native port must change
    ├── env.js               # the only bundler-config touchpoint
    ├── supabase.js          # client
    ├── db.js                # all table reads/writes
    ├── ai.js                # ALL Groq calls               ← AI integration point
    ├── coach-prompt.js      # Coach Runko's persona + full runner context
    ├── memory.js            # durable facts the coach remembers
    ├── knowledge.js         # loads knowledge/*.md into prompts
    ├── periodization.js     # the training-plan maths (VDOT, phases, volume)
    ├── plan.js              # plan engine: skeleton → AI description → save
    └── subscription.js      # trial/premium gating + Stripe placeholder

tests/                       # zero-dependency, no API calls: `npm test`
```

`src/core` is deliberately free of React and DOM code so a future React Native
app can import it unchanged — see [`src/core/README.md`](src/core/README.md).

## Notes & next steps

- The Groq key is used client-side — fine for an MVP, but move AI calls into a
  Supabase Edge Function before launch (`src/core/ai.js` is the single place to
  change).
- `llama-3.3-70b-versatile` currently 404s on Groq (retired slug); `MODELS` in
  `src/core/ai.js` falls through to `openai/gpt-oss-120b`.
- The knowledge base ships empty. Empty files cost nothing — the loader skips
  them — so fill them in as the coaching content firms up.
- Stripe: implement a Checkout Session endpoint and webhook that sets
  `users.subscription_status = 'active'` — the UI is already wired.
- Strava: add a server-side token exchange, store tokens in a
  `user_integrations` table, and implement `syncActivities()`.
