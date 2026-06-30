/**
 * Suggest-on-Conflict Maintenance Engine.
 *
 * Reacts to meaningful changes (missed/skipped/rescheduled tasks, re-imports,
 * new calendar events, changed work hours) by RE-PLANNING the rest of the day
 * deterministically and emitting a PROPOSAL. It never mutates the schedule —
 * the user accepts (or not) through the same Proposal flow as capture.
 *
 * Every suggestion carries a full Explanation (the five questions), generated
 * from the deterministic reflow's decision trace — accurate by construction.
 */

import type { Category, IANATz, ISO, OccStatus, TaskType, UUID } from '../domain/types.ts';
import { detectConflicts, type PlacedItem } from '../engine/conflicts.ts';
import { reflowDay, type FlexibleToPlace, type Interval, type Placement } from '../engine/replan.ts';
import { parseHHmm, parseLocalDate, utcToLocalDate, utcToLocalHHmm, zonedLocalToUtcMs } from '../engine/time.ts';
import { summarizeExplanations, type AlternativeOption, type Explanation } from '../explain/types.ts';
import type { Adjustment, OccurrenceChange, Proposal, ProposalReason } from '../pipeline/proposal.ts';

export interface ReplanItem {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  type: TaskType;
  category: Category;
  priority: number;
  start: ISO;
  end: ISO;
  status: OccStatus;
  /** Inviolable: frozen in place and never scheduled over. */
  protected?: boolean;
}

export interface ProtectedInterval {
  label: string;
  start: ISO;
  end: ISO;
}

export type MaintenanceTrigger =
  | { kind: 'missed_task'; occurrenceId: UUID }
  | { kind: 'skipped_task'; occurrenceId: UUID }
  | { kind: 'rescheduled_task'; occurrenceId: UUID }
  | { kind: 'reimported_routine'; summary?: string }
  | { kind: 'calendar_conflict'; addedFixed: { title: string; start: ISO; end: ISO } }
  | { kind: 'changed_work_hours'; detail?: string };

export interface MaintenanceContext {
  spaceId: UUID;
  now: ISO;
  timezone: IANATz;
  /** End of the active day (local "HH:mm"); flexible tasks won't be placed past it. */
  dayEndLocal?: string;
  idGen: () => string;
  nowFn: () => string;
  minDurationMin?: number;
  /** Forbidden intervals from the user's constraints (already expanded to UTC). */
  constraintBlocks?: Array<{ label: string; start: ISO; end: ISO }>;
}

interface LabeledBlock extends Interval {
  label: string;
  kind: 'fixed' | 'protected' | 'constraint';
}

const REASON_BY_TRIGGER: Record<MaintenanceTrigger['kind'], ProposalReason> = {
  missed_task: 'missed_task',
  skipped_task: 'skipped_task',
  rescheduled_task: 'rescheduled_task',
  reimported_routine: 'reimport',
  calendar_conflict: 'calendar_conflict',
  changed_work_hours: 'changed_work_hours',
};

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Build a maintenance Proposal. Pure: reads state, mutates nothing. */
export function buildMaintenanceProposal(
  items: ReplanItem[],
  protectedBlocks: ProtectedInterval[],
  trigger: MaintenanceTrigger,
  ctx: MaintenanceContext,
): Proposal {
  const nowMs = Date.parse(ctx.now);
  const localDate = utcToLocalDate(ctx.now, ctx.timezone);
  const dayEnd = parseHHmm(ctx.dayEndLocal ?? '22:00');
  const dayEndMs = zonedLocalToUtcMs(parseLocalDate(localDate), dayEnd, ctx.timezone);

  const why = triggerWhy(trigger, items, ctx.timezone);

  // Frozen blocks relevant to the remaining day: fixed events + protected time
  // (+ any newly-added calendar event), clipped to the [now, dayEnd] window.
  const window: Interval = { start: nowMs, end: dayEndMs };
  const blocks: LabeledBlock[] = [];
  // A protected item (even a flexible one) AND any fixed event is a frozen block.
  for (const it of items) {
    if (it.status === 'skipped') continue;
    if (!it.protected && it.type !== 'fixed') continue;
    const b: LabeledBlock = { start: Date.parse(it.start), end: Date.parse(it.end), label: it.title, kind: it.protected ? 'protected' : 'fixed' };
    if (overlaps(b, window)) blocks.push(b);
  }
  // External protected windows (e.g. standalone constraints) — dedupe against item-derived blocks.
  for (const p of protectedBlocks) {
    const b: LabeledBlock = { start: Date.parse(p.start), end: Date.parse(p.end), label: p.label, kind: 'protected' };
    if (overlaps(b, window) && !blocks.some((x) => x.start === b.start && x.end === b.end)) blocks.push(b);
  }
  if (trigger.kind === 'calendar_conflict') {
    const f = trigger.addedFixed;
    const b: LabeledBlock = { start: Date.parse(f.start), end: Date.parse(f.end), label: f.title, kind: 'fixed' };
    if (overlaps(b, window)) blocks.push(b);
  }
  // declarative constraints become frozen 'constraint' blocks (never scheduled into)
  for (const cb of ctx.constraintBlocks ?? []) {
    const b: LabeledBlock = { start: Date.parse(cb.start), end: Date.parse(cb.end), label: cb.label, kind: 'constraint' };
    if (overlaps(b, window)) blocks.push(b);
  }

  // Flexible items still actionable today — protected items are frozen, never reflowed.
  const pendingFlexible = items.filter((it) => it.type === 'flexible' && !it.protected && it.status === 'planned' && Date.parse(it.end) > nowMs);

  // Which flexible items must move: those overlapping a frozen block...
  const conflicting = pendingFlexible.filter((it) =>
    blocks.some((b) => overlaps({ start: Date.parse(it.start), end: Date.parse(it.end) }, b)),
  );
  // ...plus recovery of a missed FLEXIBLE task (re-fit it later today).
  const recovered: ReplanItem[] = [];
  if (trigger.kind === 'missed_task') {
    const missed = items.find((it) => it.occurrenceId === trigger.occurrenceId);
    if (missed && missed.type === 'flexible') recovered.push(missed);
  }
  const toReflowMap = new Map<UUID, ReplanItem>();
  for (const it of [...conflicting, ...recovered]) toReflowMap.set(it.occurrenceId, it);
  const toReflow = [...toReflowMap.values()];

  // Non-conflicting pending flexible keep their slots — treat as occupied so we don't churn them.
  const stay = pendingFlexible.filter((it) => !toReflowMap.has(it.occurrenceId));
  const occupied: Interval[] = [
    ...blocks.map((b) => ({ start: b.start, end: b.end })),
    ...stay.map((it) => ({ start: Math.max(Date.parse(it.start), nowMs), end: Date.parse(it.end) })),
  ];

  const flexible: FlexibleToPlace[] = toReflow.map((it) => ({
    occurrenceId: it.occurrenceId,
    taskId: it.taskId,
    title: it.title,
    priority: it.priority,
    durationMin: Math.round((Date.parse(it.end) - Date.parse(it.start)) / 60_000),
    originalStart: Date.parse(it.start),
    originalEnd: Date.parse(it.end),
  }));

  const placements = reflowDay({ nowMs, dayEndMs, busy: occupied, flexible, minDurationMin: ctx.minDurationMin });

  const adjustments: Adjustment[] = [];
  const explanations: Explanation[] = [];
  for (const p of placements) {
    if (!p.moved && !p.shortened && !p.dropped) continue; // unchanged -> no suggestion
    const explanation = explainPlacement(p, blocks, why, ctx.timezone, dayEndMs);
    const occurrenceChange: OccurrenceChange = {
      occurrenceId: p.occurrenceId,
      taskId: p.taskId,
      beforeStart: new Date(p.originalStart).toISOString(),
      beforeEnd: new Date(p.originalEnd).toISOString(),
      afterStart: new Date(p.newStart).toISOString(),
      afterEnd: new Date(p.newEnd).toISOString(),
    };
    const op = p.dropped ? 'skip' : p.shortened ? 'shorten' : 'move';
    adjustments.push({
      op,
      targetRef: p.occurrenceId,
      occurrenceChange,
      rationale: explanation.whatChanged[0] ?? why,
      explanation,
    });
    explanations.push(explanation);
  }

  // Surface any conflicts that remain in the proposed layout (e.g. two fixed events colliding).
  const finalPlaced: PlacedItem[] = [
    ...blocks.map((b, i) => ({ id: `b${i}`, taskId: `b${i}`, title: b.label, type: 'fixed' as TaskType, start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() })),
    ...placements.filter((p) => !p.dropped).map((p) => ({ id: p.occurrenceId, taskId: p.taskId, title: p.title, type: 'flexible' as TaskType, start: new Date(p.newStart).toISOString(), end: new Date(p.newEnd).toISOString() })),
    ...stay.map((it) => ({ id: it.occurrenceId, taskId: it.taskId, title: it.title, type: 'flexible' as TaskType, start: it.start, end: it.end })),
  ];
  const conflicts = detectConflicts(finalPlaced);

  return {
    id: ctx.idGen(),
    spaceId: ctx.spaceId,
    reason: REASON_BY_TRIGGER[trigger.kind],
    adjustments,
    conflicts,
    ambiguities: [],
    status: 'proposed',
    createdAt: ctx.nowFn(),
    explanation: summarizeExplanations(why, explanations),
  };
}

function triggerWhy(trigger: MaintenanceTrigger, items: ReplanItem[], tz: IANATz): string {
  const titleOf = (occId: UUID) => items.find((i) => i.occurrenceId === occId)?.title ?? 'a task';
  switch (trigger.kind) {
    case 'missed_task':
      return `You missed "${titleOf(trigger.occurrenceId)}", so I rebuilt the rest of your day.`;
    case 'skipped_task':
      return `You skipped "${titleOf(trigger.occurrenceId)}", so I re-optimized your remaining time.`;
    case 'rescheduled_task':
      return `"${titleOf(trigger.occurrenceId)}" moved, so I adjusted the flexible tasks around it.`;
    case 'reimported_routine':
      return `Your routine was re-imported${trigger.summary ? `: ${trigger.summary}` : ''}, so I refit your flexible tasks.`;
    case 'calendar_conflict':
      return `A new event "${trigger.addedFixed.title}" at ${utcToLocalHHmm(trigger.addedFixed.start, tz)} was added, so I moved conflicting flexible tasks.`;
    case 'changed_work_hours':
      return `Your work hours changed${trigger.detail ? `: ${trigger.detail}` : ''}, so I rebuilt your day around them.`;
  }
}

function explainPlacement(
  p: Placement,
  blocks: LabeledBlock[],
  why: string,
  tz: IANATz,
  dayEndMs: number,
): Explanation {
  const fromT = utcToLocalHHmm(new Date(p.originalStart).toISOString(), tz);
  const toT = utcToLocalHHmm(new Date(p.newStart).toISOString(), tz);
  const newEndT = utcToLocalHHmm(new Date(p.newEnd).toISOString(), tz);

  const whatChanged: string[] = [];
  if (p.dropped) whatChanged.push(`Skipped "${p.title}" — no free slot before ${utcToLocalHHmm(new Date(dayEndMs).toISOString(), tz)}.`);
  else if (p.shortened) whatChanged.push(`Shortened "${p.title}" to ${toT}–${newEndT} to fit the remaining time.`);
  else whatChanged.push(`Moved "${p.title}" from ${fromT} to ${toT}.`);

  const constraintsPreserved = blocks.map(
    (b) => `${b.label} (${b.kind}) kept at ${utcToLocalHHmm(new Date(b.start).toISOString(), tz)}–${utcToLocalHHmm(new Date(b.end).toISOString(), tz)}.`,
  );

  // Which frozen block forced the move?
  const original: Interval = { start: p.originalStart, end: p.originalEnd };
  const blocker = blocks.find((b) => b.start < original.end && original.start < b.end);

  const alternatives: AlternativeOption[] = [];
  if (blocker) {
    alternatives.push({
      summary: `Keep "${p.title}" at ${fromT}.`,
      rejectedBecause: `It overlaps ${blocker.kind} "${blocker.label}", which can't move.`,
    });
  }
  if (p.shortened) {
    alternatives.push({
      summary: `Move "${p.title}" to a later full-length slot.`,
      rejectedBecause: 'No full-length gap remained before the end of the day.',
    });
  } else if (p.moved && p.fullSlotExisted) {
    alternatives.push({
      summary: `Shorten "${p.title}" in place instead of moving it.`,
      rejectedBecause: `A full-length slot was free at ${toT}, so no time is lost.`,
    });
  }

  const selectionReason = p.dropped
    ? 'Every other slot was occupied by a fixed or protected block; skipping preserves all commitments.'
    : p.shortened
      ? 'Chose the largest remaining gap so the task still happens today without touching any fixed block.'
      : 'Chose the earliest free slot that preserves all fixed/protected blocks at full duration.';

  return { why, whatChanged, constraintsPreserved, alternatives, selectionReason };
}
