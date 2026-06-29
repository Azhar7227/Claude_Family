# Suggest-on-Conflict Maintenance Engine + Explainability

> The retention heart of the product (STRATEGY.md): capture gets users in;
> **maintenance keeps them**. When life changes, the engine re-plans the day and
> *suggests* — it never silently edits the schedule.

## What it does

`buildMaintenanceProposal(items, protectedBlocks, trigger, ctx) -> Proposal`

Reacts to a **trigger** and produces a `Proposal` (the same type capture
produces), so the user reviews and accepts through the identical flow. It
mutates nothing — there's a test asserting the input is byte-identical after a
build.

### Triggers
| Trigger | Reason code | Behavior |
|---|---|---|
| `missed_task` | `missed_task` | recover a missed *flexible* task into the next free slot |
| `skipped_task` | `skipped_task` | re-optimize the remaining day |
| `rescheduled_task` | `rescheduled_task` | reflow flexible items around the moved item |
| `reimported_routine` | `reimport` | refit flexible items after a re-import |
| `calendar_conflict` | `calendar_conflict` | move flexible items off a newly-added fixed event |
| `changed_work_hours` | `changed_work_hours` | rebuild the day around new fixed hours |

### The re-planning rule (deterministic, `engine/replan.ts`)
- **Fixed events and protected time are frozen.** Flexible items flow around them.
- **Never move a task earlier than planned** (or before `now`) — avoids churn and
  surprising pull-forwards. A *missed* task floors at `now` and is recovered next.
- Prefer the **earliest free slot at/after** the original start, at **full
  duration**; **shorten** only if no full slot remains; **suggest skip** only if
  nothing fits before the day ends.
- Higher-priority items get first pick of the gaps.

Output is committed through the same `commit()` path as everything else
(occurrence-level `move`/`shorten`/`skip`), with a ledger entry per change for
undo and the "why did this move?" UI.

## Explainability layer (`explain/types.ts`)

Every suggestion — per adjustment and rolled up per proposal — answers the five
questions, generated **deterministically from the reflow's decision trace** (not
the LLM, so it's always accurate, free, and offline):

1. **Why was this suggested?** — the trigger / root cause.
2. **What changed?** — concrete diffs ("Moved 'Gym' from 18:00 to 19:00").
3. **What constraints were preserved?** — every fixed/protected block kept.
4. **What alternatives were considered?** — e.g. "Keep at 18:00 — rejected: it
   overlaps fixed 'Client call'"; "Shorten in place — rejected: a full slot was
   free at 19:00".
5. **Why was this option selected?** — "Earliest free slot that preserves all
   fixed/protected blocks at full duration."

A future LLM pass may *rephrase* these for warmth, but can never alter the causal
facts — consistent with the binding principle: **engine owns logic, LLM owns
language.**
