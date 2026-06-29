# LifeFlow AI

An AI assistant that turns messy real-world inputs (chat, screenshots, PDFs, timetables, `.ics`) into a **structured, maintainable daily routine** — with a one-tap review. The AI *suggests*; it never silently changes your schedule. Built for individuals and couples first, expanding toward a full AI Life Operating System.

> **Read the thinking first.** This repo was planned before it was coded:
> 1. [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — full product/UX/architecture plan
> 2. [`docs/MVP.md`](docs/MVP.md) — first payable MVP cut
> 3. [`docs/VC_CRITIQUE.md`](docs/VC_CRITIQUE.md) — brutal founder/VC critique
> 4. [`docs/STRATEGY.md`](docs/STRATEGY.md) — **locked strategy & differentiator**
> 5. [`docs/TECH_SPEC.md`](docs/TECH_SPEC.md) — MVP technical spec (contracts)

## Status

Early build. Two layers done and fully tested: the **deterministic scheduling
engine** and the **AI capture pipeline** (text → proposal → accept → commit),
which is testable in CI with zero network via a deterministic stub provider.

**Deterministic engine** — the LLM is deliberately kept out of this layer:

| Module | Purpose | Tests |
|---|---|---|
| `src/engine/recurrence.ts` | RFC 5545 RRULE subset → concrete occurrences (tz/DST-aware) | ✅ |
| `src/engine/conflicts.ts` | Deterministic conflict detection (fixed > flexible, protected time) | ✅ |
| `src/engine/replan.ts` | Day reflow — fit flexible items around frozen blocks, with decision trace | ✅ |
| `src/engine/dedup.ts` | Re-import reconciliation (ADD/UPDATE/REMOVE/NOOP) — the "maintain" loop | ✅ |
| `src/engine/reminders.ts` | Reminder fire-time computation + priority | ✅ |
| `src/engine/notifications.ts` | Notification budget + batching (anti-fatigue) | ✅ |
| `src/engine/time.ts` | Dependency-free local↔UTC / tz helpers (Intl) | ✅ |

**Maintenance + explainability** — the retention loop; suggests, never mutates:

| Module | Purpose | Tests |
|---|---|---|
| `src/maintenance/engine.ts` | Suggest-on-conflict engine → Proposal (6 triggers) | ✅ |
| `src/explain/types.ts` | Explanation layer — the five questions, deterministic | ✅ |

See [`docs/MAINTENANCE_ENGINE.md`](docs/MAINTENANCE_ENGINE.md).

**Input sources** — all feed the one routine-creation pipeline:

| Module | Purpose | Tests |
|---|---|---|
| `src/ingest/ics.ts` + `src/ai/ics-provider.ts` | Deterministic `.ics` import as an AIProvider (no model) | ✅ |

**Daily experience (offline-first reads + actions):**

| Module | Purpose | Tests |
|---|---|---|
| `src/read/today.ts` | Today view (now/next/after/remaining) + timeline projection | ✅ |
| `src/pipeline/occurrence-actions.ts` | complete / skip / reschedule / mark-missed | ✅ |

**AI Evaluation Framework (observability, never affects logic):**

| Module | Purpose | Tests |
|---|---|---|
| `src/eval/sink.ts` | `EvalSink` port + Noop/InMemory impls; extraction traces & outcomes | ✅ |

See [`docs/EVAL_FRAMEWORK.md`](docs/EVAL_FRAMEWORK.md).

**AI layer (dependency-inverted)** — business logic depends on a port, never a vendor:

| Module | Purpose | Tests |
|---|---|---|
| `src/ai/provider.ts` | `AIProvider` PORT + capabilities (vision/ocr/audio/tools) | — |
| `src/ai/schema.ts` | Validation boundary — every AI response validated before the Proposal engine | ✅ |
| `src/ai/stub-provider.ts` | Deterministic stub (realistic structured output, no network) | ✅ |
| `src/ai/extraction.ts` | Provider-agnostic extraction service | ✅ (flow) |

**Pipeline** — capture → extract → validate → propose → accept → commit:

| Module | Purpose | Tests |
|---|---|---|
| `src/pipeline/capture.ts` | Normalize (text now; image/.ics hooks ready) | ✅ (flow) |
| `src/pipeline/proposal.ts` | Proposal engine + the no-silent-commit invariant | ✅ |
| `src/pipeline/commit.ts` | Repository port + in-memory impl + undo ledger | ✅ |
| `src/pipeline/index.ts` | Orchestration (vendor-agnostic) | ✅ |
| `src/domain/types.ts` | Canonical data model | — |

## Architecture principles (binding)

1. **The engine owns all time math.** The LLM only translates *language → structure*
   and *structure → explanation*. Keeps scheduling fast, free, offline-capable,
   unit-testable, and bounds AI cost at scale.
2. **Dependency inversion at the AI boundary.** Orchestration depends on the
   `AIProvider` port; Gemini/Claude/OpenAI are swappable adapters. Adding a
   modality (OCR/vision/voice) is a new `InputPart` + capability flag — the
   orchestrator is untouched.
3. **No silent commits.** Every AI output is a *Proposal*; only an explicit
   `acceptProposal()` can transition it, and `commit()` refuses anything not
   accepted. There are invariant tests enforcing this.

See `docs/TECH_SPEC.md` §0.

## Develop

Requires Node ≥ 22.18 (uses the built-in test runner + native TS type-stripping).

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (no extra test framework)
```

## Run the app

A real PWA (`src/web/`) that drives the **actual deterministic pipeline** in the
browser — offline-first via localStorage, stub provider by default.

```bash
npm run web         # esbuild dev server + watch (serves /public)
npm run build:web   # one-off bundle -> public/bundle.js
npm run smoke:web   # headless browser smoke test of the full flow
```

Screens: onboarding, Home ("what now?"), Today/timeline, Add (text + `.ics`),
proposal review (with explanations), Routines editor, Settings (reminder/
notification prefs), Alerts (notification budget), and a **pipeline debug
console** visualizing Input → Normalize → Extract+Validate → Proposal → Accept →
Commit with each stage's JSON, validation status, confidence, and timing.

**Milestone in progress:** run our own daily routines in the app for 30
consecutive days before adding a production AI provider.

## Build order

See `docs/TECH_SPEC.md` §9. Done: deterministic engine (recurrence, conflicts,
reflow, reminders, notification budgeting); AI provider abstraction + stub; full
text capture → proposal → accept → commit; Today read model + timeline; offline
occurrence actions; image/OCR + `.ics` capture via the same pipeline; AI
evaluation framework; **suggest-on-conflict maintenance engine with the
explainability layer**.

Next: a production Claude/Gemini/OpenAI adapter — only a new `AIProvider`
implementation, no orchestration or business-logic changes.
