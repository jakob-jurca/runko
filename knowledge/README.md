# Runko knowledge base

Plain-Markdown coaching knowledge that gets injected into AI prompts at
runtime. Editing a file here changes how the coach thinks -- no code change,
no redeploy of logic, just content.

Every file in this folder **except this README** is a knowledge document.

## File format

Each document starts with YAML frontmatter, then Markdown:

```markdown
---
topic: injuries
load_when:
  - injury_mention
  - chat
priority: high
---

## Runner's knee
Body text the coach will read...
```

### Frontmatter fields

| Field | Required | Meaning |
| --- | --- | --- |
| `topic` | yes | Short identifier, unique across the folder. Used in logs and as the heading of the injected block. |
| `load_when` | yes | List of situations in which this document is injected. See below. |
| `priority` | yes | `high`, `medium` or `low`. Decides who survives the token budget: high first, then medium, then low. |
| `scenarios` | no | Runner scenarios this file owns (see below). Each scenario must be owned by exactly one file. |

### Scenarios (`scenarios`) — plan generation

Plan generation does **not** use situations. The planning pipeline
(`src/core/planning`) classifies each runner into one of seven scenarios, and
the plan call loads only the `## Scenario: <id>` section of the one file that
lists that scenario — nothing else from this folder. That keeps the single
plan call cheap and specific.

| Scenario | File |
| --- | --- |
| `complete_beginner`, `beginner_with_deadline` | `beginners.md` |
| `recreational` | `recreational.md` |
| `short_race` | `short-race.md` |
| `long_race` | `long-race.md` |
| `returning` | `returning.md` |
| `maintenance` | `maintenance.md` |

A scenario section must fit the plan-generation budget (700 tokens) and must
describe the rules the engine already enforces (`src/core/planning/rules.js`)
— the AI explains the plan, it never overrides it. `tests/knowledge-scenarios.test.mjs`
checks ownership, presence and size.

### Situations (`load_when`)

| Situation | Fires when |
| --- | --- |
| `always` | Every AI call, no exceptions. Use sparingly -- `tone.md` only. |
| `chat` | Any coach chat message. |
| `plan_generation` | Fallback only, for a plan built without a scenario. Pipeline plans use `scenarios` instead. |
| `onboarding` | Onboarding copy and questions. |
| `injury_mention` | The runner's message mentions pain, an injury or a body part. |
| `nutrition_question` | The message is about food, fuelling, hydration or gels. |
| `pace_question` | The message is about pace, VDOT, race times or how fast to run. |
| `workout_question` | The message is about a specific session or workout type. |
| `motivation` | The message is about motivation, consistency or missed sessions. |

Situations are detected in `src/core/knowledge.js` (`detectSituations`),
which matches English **and** Slovenian keywords. Adding a keyword there is
how you widen a trigger.

## How loading works

`src/core/knowledge.js` reads every `.md` file in this folder at **build
time** via Vite's `import.meta.glob('../../knowledge/*.md', { query: '?raw' })`.
Nothing is fetched at runtime, so there is no network cost and no loading
state -- but it does mean **a new file needs a dev-server restart** to appear.

For each AI call the loader:

1. Detects the situations in play (explicit ones from the caller, plus any
   inferred from the runner's message).
2. Selects every document whose `load_when` intersects those situations.
3. Sorts by priority (`high` > `medium` > `low`), then by topic for stability.
4. Adds documents one at a time until the token budget is reached, skipping
   any that would overflow it. A document is never truncated mid-sentence --
   it is included whole or not at all.
5. Returns one Markdown block that gets appended to the system prompt.

### Empty files are free

Every document in this folder starts empty -- frontmatter plus an HTML
comment describing what belongs in it. The loader strips HTML comments and
whitespace, and **skips any document whose body is then empty**. So an
unwritten file costs nothing: no tokens, no confusing blank section in the
prompt. Fill one in and it starts being used on the next build.

### Token budget

Budgets are set per call site (`KNOWLEDGE_BUDGETS` in the loader) because a
plan generation prompt can afford far more knowledge than a one-line chat
reply. Tokens are estimated at ~4 characters per token, deliberately
conservative. If everything selected does not fit, low-priority documents are
dropped first.

## Adding a new document

1. Create `knowledge/<name>.md`.
2. Add the frontmatter: a unique `topic`, the `load_when` situations, a
   `priority`.
3. Write the body as Markdown, using `## ` headings.
4. Restart the dev server.

That is all -- there is no registry to update and no import to add. If you
need it to load on a situation that does not exist yet, add the situation to
`SITUATIONS` and its keywords to `detectSituations` in
`src/core/knowledge.js`, then document it in the table above.

## Writing guidance

- **Write for a model, not for a reader.** Prescriptive and concrete beats
  discursive. Short declarative sentences.
- **Keep it dense.** Every document competes for the same token budget.
- **No contradictions between files.** The coach cannot tell which one wins.
- **Safety belongs in the file.** `injuries.md` and `nutrition.md` are
  injected verbatim, so the "refer to a professional" lines must be written
  into the content itself.
