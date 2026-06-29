# LifeFlow AI

An AI assistant that turns messy real-world inputs (chat, screenshots, PDFs, timetables, `.ics`) into a **structured, maintainable daily routine** — with a one-tap review. The AI *suggests*; it never silently changes your schedule. Built for individuals and couples first, expanding toward a full AI Life Operating System.

> **Read the thinking first.** This repo was planned before it was coded:
> 1. [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) — full product/UX/architecture plan
> 2. [`docs/MVP.md`](docs/MVP.md) — first payable MVP cut
> 3. [`docs/VC_CRITIQUE.md`](docs/VC_CRITIQUE.md) — brutal founder/VC critique
> 4. [`docs/STRATEGY.md`](docs/STRATEGY.md) — **locked strategy & differentiator**
> 5. [`docs/TECH_SPEC.md`](docs/TECH_SPEC.md) — MVP technical spec (contracts)

## Status

Early build. Foundation first: the **deterministic scheduling engine** — the
hardest, most-tested part of the system, and the layer the LLM is deliberately
kept out of.

| Module | Purpose | Tests |
|---|---|---|
| `src/engine/recurrence.ts` | RFC 5545 RRULE subset → concrete occurrences (tz/DST-aware) | ✅ |
| `src/engine/conflicts.ts` | Deterministic conflict detection (fixed > flexible, protected time) | ✅ |
| `src/engine/dedup.ts` | Re-import reconciliation (ADD/UPDATE/REMOVE/NOOP) — the "maintain" loop | ✅ |
| `src/engine/time.ts` | Dependency-free local↔UTC / tz helpers (Intl) | ✅ |
| `src/domain/types.ts` | Canonical data model | — |

## Architecture principle (binding)

The engine owns **all time math**. The LLM only translates *language → structure*
and *structure → explanation*. This keeps scheduling fast, free, offline-capable,
and unit-testable, and bounds AI cost at scale. See `docs/TECH_SPEC.md` §0.

## Develop

Requires Node ≥ 22.18 (uses the built-in test runner + native TS type-stripping).

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test (no extra test framework)
```

## Build order

See `docs/TECH_SPEC.md` §9. Next up: the AI extraction contract + text-capture
path end-to-end (text → proposal → accept → commit), then image/OCR and `.ics`.
