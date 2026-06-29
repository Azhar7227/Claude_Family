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
| `src/engine/dedup.ts` | Re-import reconciliation (ADD/UPDATE/REMOVE/NOOP) — the "maintain" loop | ✅ |
| `src/engine/time.ts` | Dependency-free local↔UTC / tz helpers (Intl) | ✅ |

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

## Build order

See `docs/TECH_SPEC.md` §9. Done: deterministic engine; AI provider abstraction
+ stub; full text capture → proposal → accept → commit. Next up: wire a real
model provider behind the same port, then add image/OCR and `.ics` capture
(same pipeline, new `InputPart`s), then reminders + the Today read path.
