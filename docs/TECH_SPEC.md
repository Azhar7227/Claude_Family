# LifeFlow AI — MVP Technical Specification

> Scope: the locked wedge in `STRATEGY.md` — multi-input capture → structured, maintainable routine, with a suggest-on-conflict maintenance loop. Individuals & couples.
> This spec defines **data model, capture pipeline, AI extraction contract, conflict detection, the suggest loop, and APIs** — enough to build against. Stack is proposed but interfaces are the contract.

**Status:** v1 spec, pre-code. Interfaces in TypeScript notation for precision; not a stack mandate.

---

## 0. Design principles (binding)

1. **Nothing the AI produces is committed without explicit user confirmation.** Every AI output is a *proposal*. (Trust posture from STRATEGY.md.)
2. **The LLM handles language → structure and structure → explanation. It does NOT do time math.** Conflict detection, recurrence expansion, and scheduling are deterministic code. (Cost, latency, correctness.)
3. **Capture and maintenance share one pipeline.** A first import and a later "your shift changed" both flow through: `ingest → extract → reconcile → propose → confirm`. One pipeline, two entry reasons.
4. **Idempotent and offline-tolerant.** Mutations carry idempotency keys; the client can read/complete offline.

---

## 1. Canonical data model

The single target schema every input method converges on. (Conceptual; omits audit/index columns.)

```ts
// ---- Identity & tenancy ----
interface User      { id: UUID; email: string; locale: string; timezone: IANATz; createdAt: ISO }
interface Space     { id: UUID; kind: 'solo' | 'couple'; name: string }      // tenancy boundary
interface Member    { id: UUID; spaceId: UUID; userId: UUID; role: 'owner'|'partner' }
interface Person    { id: UUID; spaceId: UUID; userId?: UUID; name: string }  // userId null = non-account person

// ---- The routine model ----
type TaskType = 'fixed' | 'flexible';
type Category = 'work'|'health'|'family'|'faith'|'learning'|'chore'|'social'|'other';

interface Routine {                          // a named bundle, e.g. "Work week", "Kids school"
  id: UUID; spaceId: UUID; title: string;
  source: CaptureSource; createdBy: UUID;
}

interface Task {
  id: UUID; spaceId: UUID; routineId?: UUID;
  title: string;
  type: TaskType;                            // drives conflict & suggest logic
  category: Category;
  assigneePersonId?: UUID;
  priority: 1|2|3|4|5;                       // 1 = highest
  estDurationMin?: number;
  notes?: string;
  source: CaptureSource;                     // provenance, for trust & dedup
}

interface RecurrenceRule {
  id: UUID; taskId: UUID;
  rrule: string;                             // RFC 5545 RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  startTimeLocal?: 'HH:mm';
  endTimeLocal?: 'HH:mm';
  timezone: IANATz;
  exDates?: ISODate[];                       // exceptions
}

type OccStatus = 'planned'|'done'|'missed'|'skipped'|'moved';
interface Occurrence {                       // materialized timeline entry — what "Today" reads
  id: UUID; taskId: UUID; spaceId: UUID;
  start: ISO; end: ISO;
  status: OccStatus;
  originalStart?: ISO;                       // set when moved, for the ledger
  completedAt?: ISO;
}

interface Reminder { id: UUID; occurrenceId?: UUID; taskId?: UUID; offsetMin: number; channel: 'push'|'local'; }
```

**Why these shapes:**
- `Space` (not `User`) is the tenancy boundary so a **couple** shares one routine set from day one without a later migration.
- `Occurrence` is **materialized** over a rolling window (next ~45 days) — `Today` is an indexed point-query, not an RRULE expansion at request time. Re-planning mutates occurrences; recurrence rules stay stable.
- `source: CaptureSource` on Task/Routine is the provenance trail — needed for dedup on re-import (§5) and for the "where did this come from?" trust UI.

```ts
interface CaptureSource {
  method: 'text'|'image'|'ics'|'voice'|'pdf'|'csv';   // MVP: text, image, ics. others fast-follow.
  uploadId?: UUID; capturedAt: ISO;
}
```

---

## 2. Capture pipeline

One pipeline, five stages. Stages are independent services/functions communicating via typed DTOs.

```
 ┌────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────┐
 │ INGEST │ → │ NORMALIZE  │ → │  EXTRACT   │ → │ RECONCILE  │ → │ PROPOSE  │
 │ accept │   │ to plain   │   │ LLM → JSON │   │ vs current │   │ editable │
 │ input  │   │ text/struct│   │ (schema'd) │   │ + conflicts│   │ preview  │
 └────────┘   └────────────┘   └────────────┘   └────────────┘   └────┬─────┘
                                                                       │
                                                              user CONFIRM (one tap)
                                                                       │
                                                                  COMMIT → routine
```

### 2.1 INGEST — `POST /v1/captures`
Accepts one raw input; returns a `captureId` and kicks off async processing.
```ts
type CaptureInput =
  | { method:'text';  text: string }
  | { method:'image'; uploadId: UUID }       // pre-uploaded to object store
  | { method:'ics';   uploadId: UUID }
  | { method:'voice'; uploadId: UUID };       // fast-follow
```

### 2.2 NORMALIZE — produce plain, model-ready content
- **text** → passthrough (trim, strip noise).
- **image** → OCR (cloud OCR or vision model) → text + layout hints (tables matter for timetables).
- **ics** → deterministic parse (no LLM) → `VEVENT[]` → pre-mapped candidate tasks; LLM only fills gaps (category, type).
- **voice** → transcription → text.
Output: `NormalizedDoc { captureId, text, blocks?: LayoutBlock[], prelimEvents?: IcsEvent[] }`.

> `.ics` and `.csv` are **mostly deterministic** — don't waste LLM tokens parsing structured formats. Use the model only to classify type/category and resolve ambiguity.

### 2.3 EXTRACT — the AI contract (see §3).

### 2.4 RECONCILE — deterministic conflict & dedup pass (see §4, §5).

### 2.5 PROPOSE — assemble an editable `Proposal` (see §6) and return for confirmation.

---

## 3. AI extraction contract

The model is forced to emit **only** this schema via structured output / tool-calling. The application validates before anything proceeds; malformed output is repaired or rejected, never trusted.

```ts
interface ExtractionResult {
  items: ExtractedItem[];
  ambiguities: Ambiguity[];        // things the model is unsure about → surfaced to user, not guessed
  warnings: string[];              // e.g. "no times found; assumed all-day"
}

interface ExtractedItem {
  tempId: string;                  // local id for referencing within this result
  title: string;
  type: 'fixed' | 'flexible';
  category: Category;
  confidence: number;              // 0..1; < THRESHOLD routes to review-highlighted
  start?: 'HH:mm'; end?: 'HH:mm';
  durationMin?: number;
  rrule?: string;                  // model proposes RFC5545; code VALIDATES & may rewrite
  assigneeName?: string;           // raw name; mapped to Person in reconcile
  priorityHint?: 1|2|3|4|5;
  notes?: string;
  sourceSpan?: string;             // the exact input text this came from — for the trust UI & debugging
}

interface Ambiguity {
  tempId: string; field: string;   // e.g. "start"
  question: string;                // "Is 'morning prayer' at 5:00 or 5:30?"
  options?: string[];
}
```

**Contract rules (enforced in code, not trusted from the model):**
- `rrule` is **re-parsed and validated** against RFC 5545; if invalid, downgrade to a single occurrence + warning. The model proposes; code is the authority.
- All times are **local**; timezone is attached from the user/space at reconcile, never inferred by the LLM.
- `confidence < CONFIDENCE_THRESHOLD` (default 0.6) → item is flagged in the preview, never silently committed.
- The model **must not invent** times/dates not supported by input; missing → `ambiguities` or `warnings`, not a guess. (Prompt + eval enforce this.)
- `sourceSpan` is mandatory when derivable — it powers "tap an item to see the source line" and makes hallucinations visible.

**Model routing:** small/cheap model for clean text & ics-gap-filling; frontier model only for messy OCR/handwriting and ambiguous parses. Route by `normalize` confidence + input method.

**Prompt is versioned** (`prompt_version` stored on the capture) so eval regressions are traceable.

---

## 4. Conflict detection (deterministic)

Runs in RECONCILE and again in the maintenance loop. Pure function over occurrences — no LLM.

```ts
type ConflictKind =
  | 'overlap'           // two items occupy the same time
  | 'fixed_collision'   // a flexible item overlaps a fixed one (fixed wins)
  | 'over_capacity'     // > N hours scheduled in a day / impossible density
  | 'protected_time'    // overlaps user-declared protected block (sleep, family dinner)
  | 'duplicate';        // near-identical to an existing task (see §5)

interface Conflict {
  kind: ConflictKind;
  itemRefs: string[];               // tempIds and/or existing Occurrence ids
  detail: string;                   // human text for the preview
  suggestions: Adjustment[];        // deterministic options; LLM may add a phrased rationale
}
```

Resolution policy (MVP, deterministic):
- **Fixed always beats flexible.** A flexible item colliding with a fixed one is proposed to move, not the reverse.
- **Two fixed items overlapping** → cannot auto-resolve → surface as a hard conflict for the user to choose (`AskUser`-style in UI).
- **Protected time** is a hard constraint; nothing schedules over it without explicit override.

---

## 5. Re-import & dedup (the maintenance reality)

Because the same source gets captured repeatedly (a new weekly timetable, an updated shift), RECONCILE must **diff against existing tasks**, not blindly create duplicates.

Match key: `(spaceId, normalized title, rrule signature, source.method)` + fuzzy title match. For each extracted item:
- **No match** → `ADD`.
- **Match, identical** → `NOOP` (don't re-create; don't re-notify).
- **Match, changed time/recurrence** → `UPDATE` proposal (this is the suggest-on-conflict moment).
- **Existing not in new import** (and same source) → `REMOVE?` proposal (never auto-delete).

This diff is what makes the product "maintain," not just "import."

---

## 6. The Proposal & the suggest-on-conflict loop

Everything the user confirms is a `Proposal`. This is the trust spine and the maintenance engine.

```ts
type ProposalReason = 'initial_capture' | 'reimport' | 'conflict' | 'user_request';
type AdjustmentOp   = 'add' | 'update' | 'move' | 'shorten' | 'remove';

interface Adjustment {
  op: AdjustmentOp;
  targetRef: string;                // tempId (new) or Task/Occurrence id (existing)
  before?: Partial<Task & Occurrence>;
  after:   Partial<Task & Occurrence>;
  rationale: string;                // human "why" — templated or LLM-phrased
}

interface Proposal {
  id: UUID; spaceId: UUID;
  reason: ProposalReason;
  adjustments: Adjustment[];        // the diff the user reviews
  conflicts: Conflict[];
  ambiguities: Ambiguity[];
  status: 'proposed'|'accepted'|'partially_accepted'|'rejected';
  createdAt: ISO;
}
```

**Loop semantics:**
- A proposal is generated on initial capture **and** whenever a trigger fires (re-import, a new fixed event collides with flexible ones, user edits create a conflict).
- The user can **accept all, accept a subset, or reject**. Subset acceptance → `partially_accepted`; un-accepted adjustments are dropped (not silently applied).
- **Commit is the only mutation path** that touches live tasks/occurrences. It is transactional and writes an entry to the ledger (`ai_actions`) with `before`/`after` for **undo**.
- The AI **never** transitions a proposal to `accepted` itself. (Binding principle #1.)

```
POST /v1/captures                      → { captureId }                 (ingest, async)
GET  /v1/captures/{id}                 → { status, proposal? }         (poll/stream result)
POST /v1/proposals/{id}/accept         → { committed: Adjustment[] }   body: { acceptRefs?: string[] }
POST /v1/proposals/{id}/reject
POST /v1/proposals/{id}/resolve        → resolve an Ambiguity/Conflict choice
GET  /v1/today                         → { now, next, after, remainingMin }   (offline-cacheable)
GET  /v1/timeline?from&to              → Occurrence[]
POST /v1/occurrences/{id}/complete|skip|reschedule
GET  /v1/proposals?status=proposed     → pending suggestions (the maintenance inbox)
POST /v1/spaces/{id}/invite            → couple invite
POST /v1/export   DELETE /v1/account   → portability + erasure
```

**Conventions:** idempotency key on every POST; `captureId`/`proposalId` are stable so offline retries don't double-commit; couple changes emit events to the partner respecting their notification budget.

---

## 7. Proposed stack (for discussion, not locked)

| Layer | Choice | Why |
|---|---|---|
| Clients | React Native (iOS+Android) + PWA | one codebase, offline store (SQLite/WatermelonDB) |
| API | TypeScript (NestJS/Fastify) | shares types with client; fast to build |
| DB | Postgres + Redis | relational integrity for scheduling; Redis for hot `today` + locks |
| Object store | S3-compatible | uploads (images/pdf/ics) |
| OCR | cloud vision / OCR API | avoid building OCR; swap-able behind NORMALIZE |
| LLM | provider-abstracted, tiered | cheap model default, frontier for messy/ambiguous; structured output |
| Async | queue (SQS/BullMQ) | capture processing, reminders, reconcile |

**Single most important architectural rule (restated):** the **conflict/recurrence/scheduling engine is deterministic, pure, and the most-tested code in the repo.** The LLM lives only at NORMALIZE-assist and EXTRACT and "rationale phrasing." This bounds cost and makes correctness testable.

---

## 8. Testing & evals

- **Golden extraction set:** messy inputs (handwritten photo, school timetable, shift PDF, pasted text, `.ics`) → expected `ExtractionResult`. Run in CI; track accuracy per input type. This *is* the moat metric (long-tail accuracy).
- **Conflict engine:** exhaustive unit tests; it's pure code — treat as a spec.
- **Dedup/reimport:** fixture pairs (v1 timetable, v2 timetable) → expected ADD/UPDATE/REMOVE diff.
- **Contract tests:** every LLM response validates against `ExtractionResult` schema; malformed → repair-or-reject path covered.
- **No-silent-commit invariant:** test that no code path transitions a Proposal to `accepted` without an explicit user action.

---

## 9. Build order (feature-by-feature)

1. Schema + migrations (Space/Person/Task/RecurrenceRule/Occurrence/Reminder/Proposal/ai_actions).
2. Deterministic core: RRULE expansion → occurrence materialization; conflict detection; dedup diff. **Unit-tested as spec.**
3. EXTRACT contract + validation + one input method (**text**) end-to-end → Proposal → accept → commit → ledger/undo.
4. Today screen read path (offline-cacheable).
5. Add **image/OCR** then **`.ics`** to the same pipeline.
6. Reminders + notification budget skeleton.
7. Suggest-on-conflict maintenance loop (reimport + conflict triggers → Proposal inbox).
8. Couple space + invite + partner notifications.
9. Wire the W4-retention metric instrumentation; beta.

---

**Open decisions for you:** (a) confirm the proposed stack or name constraints; (b) confirm CONFIDENCE_THRESHOLD default (0.6) and the protected-time defaults (sleep window?) for first build; (c) MVP input set = {text, image, ics} — confirm or adjust.
