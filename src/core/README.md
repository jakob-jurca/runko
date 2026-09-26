# `src/core` — platform-agnostic logic

Everything Runko *knows how to do* lives here: talking to Supabase, talking to
the AI provider, calculating training plans, loading coaching knowledge, and
deciding who has premium.

**This folder must stay portable.** The web app in `src/pages`, `src/components`
and `src/context` is one consumer of it; a React Native app would be another,
importing these exact files unchanged.

## The rule

> No React. No DOM. No browser globals. Pure JavaScript and network calls.

Concretely, nothing in `src/core` may reference:

- `react`, `react-dom`, `react-router-dom`, JSX, or any hook
- `window`, `document`, `navigator`, `location`, `alert`, `confirm`
- `localStorage`, `sessionStorage`, `IndexedDB`
- anything from `src/components`, `src/pages`, `src/context` or `src/lib`

Dependencies point **one way**: UI imports core, never the reverse.

### Consequences in practice

A core function that would have shown something to the user returns a value
instead, and the caller renders it. `startCheckout()` is the worked example —
it used to call `alert()`, and now returns
`{ ok, reason, message }` for the page to display.

Anything that must persist goes to Supabase through `db.js`, not to
`localStorage`. Per-device UI state (the onboarding draft, the cached daily
message, stub integration flags) is the UI layer's business and lives outside
this folder.

## What is in here

| File | Responsibility |
| --- | --- |
| `env.js` | The only place that reads bundler configuration. See below. |
| `strings.js` | Every user-facing string, in Slovenian. Pure data; core produces runner-facing text too, so it cannot live in the UI layer. |
| `dates.js` | Calendar-date arithmetic in the runner's local timezone. Pure, and tested — getting it wrong files runs on the wrong day. |
| `heart-rate.js` | Training heart-rate zones from age (Tanaka). |
| `supabase.js` | The Supabase client, plus a dev-time sanity check of the anon key. |
| `db.js` | Every table read and write. Pages never query Supabase directly. |
| `ai.js` | Every call to the AI provider (Groq), and the prompt builders around them. |
| `coach-prompt.js` | Coach Runko's system prompt and the full-context builder. |
| `memory.js` | Durable facts the coach remembers about a runner. |
| `knowledge.js` | Loads `/knowledge/*.md` and injects the relevant parts into prompts. |
| `knowledge-scenarios.js` | Picks the one `## Scenario: <id>` section plan generation loads. Pure, tested. |
| `periodization.js` | The training-plan maths: VDOT, paces, phases, volume, taper, week layout. |
| `planning/` | The planning pipeline, one file per step: `collect` → `assess` → `gate` (safety: no plan, restrictions such as walking-only or no hard sessions, notices) → `classify` (seven runner scenarios) → `feasibility` (feasible / stretch / unsafe) → `clarify` (≤ 3 questions) → `build` (a builder per scenario) → `explain`. `rules.js` holds the safety limits every step shares; `limits.js` combines the research rules (runko-research) that apply to one runner into caps and gaps by the research's precedence order, recording the rule behind each value; `guard.js` keeps AI-adapted weeks inside them. Pure code, no AI; tested by `tests/personas.test.mjs`. |
| `plan.js` | The plan engine — runs the pipeline, has the AI describe the result (one call), persists it. |
| `subscription.js` | Trial and premium gating. |

## The two bundler touchpoints

Core is portable, but two files knowingly depend on Vite. A React Native port
rewrites **these two and nothing else**:

1. **`env.js`** — reads `import.meta.env.*`. Swap it for `expo-constants`,
   `react-native-config`, or whatever the app uses, keeping the same exported
   names (`IS_DEV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`). There is deliberately
   no AI key among them: the client holds no AI credential on any platform, and
   a port must not add one. `ai.js` calls the `ai-proxy` Edge Function, which is
   the only thing that sees the Groq key.

2. **`knowledge.js`** — uses `import.meta.glob('../../knowledge/*.md', { query: '?raw' })`
   to bundle the knowledge base at build time. Metro has no `import.meta.glob`;
   replace that single `RAW_FILES` constant with a static object (a generated
   `knowledge.generated.js`, or Metro's own asset handling). Everything below
   that constant is plain JavaScript and works as-is.

Both are isolated to a handful of lines precisely so the port is mechanical.

## Also needed for React Native

`supabase.js` sets `persistSession: true`. On RN, pass an `AsyncStorage`
adapter to `createClient`; on web the default (`localStorage`) is used inside
the Supabase SDK itself, which is why this folder still counts as clean.

## Adding to core

Before you add a file here, check it against the rule above. If it needs to
show something, ask something, or remember something per-device, it belongs in
the UI layer instead — have core return the data and let the platform decide
how to present it.
