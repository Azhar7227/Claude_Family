# Extraction Ontology & Normalization (v2)

> The first screen is the product. If the app misunderstands the user's life,
> nothing after it matters. This is how LifeFlow extracts *structured intent*
> instead of copying sentences.

## The core fix: give the model the right slots

v1 modelled only "tasks", so every utterance collapsed into a task title.
v2 routes each statement to the slot that matches its meaning:

| Slot | For | Example |
|---|---|---|
| `profile` | durable facts about the person (never tasks) | "I'm a Business Analyst" → `{kind:'role', value:'Business Analyst'}` |
| `goals` | aspirations that need a plan, not one task | "lose 15 kg", "become a Salesforce Architect" |
| `items` | schedulable tasks / routines / habits | "Gym four times a week", "Jumu'ah" |

Each `item` carries planner-grade fields: normalized `title`, `type`
(fixed/flexible), `category`, `protected`, `timeOfDay` band, `frequency` count,
`rrule`, explicit times, `confidence`, and the verbatim `sourceSpan`.

## Two-layer design (why quality doesn't depend on one model)

1. **Prompt** (`src/ai/extraction.ts`) teaches the model the ontology: extract
   intent, normalize titles, separate profile/goals, use bands and frequency
   counts, recognize prayers/Jumu'ah, never invent times.
2. **Deterministic normalization** (`src/ai/normalize.ts`) runs on **every**
   provider's output (stub or frontier model) and canonicalizes it. The model
   proposes; the engine canonicalizes — so even a weak model (or our offline
   stub) produces planner-grade results.

## Normalization rules

- **Title canonicalization** — strip leading directives ("I need to…"),
  schedule noise ("four times", "every evening", "at 6pm", "30 minutes"), and
  fluff ("is important") → a short noun phrase. Raw phrasing stays in `sourceSpan`.
- **Profile / goal rescue** — utterances matching profile patterns ("I'm a…",
  "I have two kids") or goal patterns ("lose 15 kg", "become a…") are moved out
  of `items` so they never become tasks — even if the model got it wrong.
- **Domain lexicon** — Jumu'ah (weekly Friday, protected, faith), the five daily
  prayers (protected, faith, daily), Quran reading, sleep, family dinner/time,
  gym, walk, meditation. Sets canonical title + type + category + protected.
- **Type correction** — quality-time / gym / study / reading → flexible;
  prayers / appointments / meetings / school → fixed (fixes "spend time with
  kids" being wrongly marked fixed).
- **Time-of-day bands → approximate clock time** — "every evening" → 19:00 with
  a note it's approximate. Explicit clock times always win over bands.
- **Frequency counts → recurrence** — "four times a week" → `{unit:'week',
  count:4}` → `FREQ=WEEKLY;BYDAY=MO,TU,TH,SA` with "suggested days — adjust".
- **Protected** — prayers, sleep, family dinner, or "is important" → never
  scheduled over.
- **Location-dependent times** — prayer exact times aren't invented; an
  ambiguity asks the user instead (RRULE/day are still set).

## Worked examples (verified end-to-end through the stub)

| Input | Result |
|---|---|
| "I'm a Business Analyst" | profile: role = Business Analyst |
| "Need gym four times" | item "Gym", flexible, health, `BYDAY=MO,TU,TH,SA` |
| "Need Quran reading" | item "Quran reading", faith |
| "Spend time with my kids every evening" | item "Time with kids", flexible, family, 19:00 |
| "Friday prayer is important" | item "Jumu'ah", fixed, protected, weekly Friday, asks local time |

Covered by `src/ai/normalize.test.ts` (one test per bug) and exercised by the
full capture→proposal flow.
