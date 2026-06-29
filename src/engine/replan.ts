/**
 * Deterministic day re-planning (reflow). Pure: no LLM, no I/O.
 *
 * Given the day's frozen blocks (fixed events + protected time) and a set of
 * flexible items to (re)place, it fits each flexible item into the earliest
 * free gap after `now`, preserving full duration when possible and shortening
 * only when it must. It returns not just the placements but the DECISION TRACE
 * (what slot each item originally wanted, whether a full slot existed) so the
 * explainability layer can describe alternatives accurately.
 */

import type { UUID } from '../domain/types.ts';

export interface Interval {
  start: number; // ms
  end: number; // ms
}

export interface FlexibleToPlace {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  priority: number; // 1 = highest
  durationMin: number;
  originalStart: number; // ms
  originalEnd: number; // ms
}

export interface Placement {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  originalStart: number;
  originalEnd: number;
  newStart: number;
  newEnd: number;
  moved: boolean;
  shortened: boolean;
  dropped: boolean; // no slot of acceptable length -> suggest skip
  /** Decision trace for explainability. */
  fullSlotExisted: boolean;
}

export interface ReflowParams {
  nowMs: number;
  dayEndMs: number;
  /** Frozen blocks: fixed events + protected time. */
  busy: Interval[];
  /** Flexible items needing placement (already filtered by the caller). */
  flexible: FlexibleToPlace[];
  minDurationMin?: number;
}

const DEFAULT_MIN_DURATION = 15;

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }
  return merged;
}

/** Free gaps within [fromMs, dayEndMs] given occupied intervals. */
function freeGaps(occupied: Interval[], fromMs: number, dayEndMs: number): Interval[] {
  const merged = mergeIntervals(occupied);
  const gaps: Interval[] = [];
  let cursor = fromMs;
  for (const occ of merged) {
    if (occ.end <= cursor) continue;
    if (occ.start > cursor) gaps.push({ start: cursor, end: Math.min(occ.start, dayEndMs) });
    cursor = Math.max(cursor, occ.end);
    if (cursor >= dayEndMs) break;
  }
  if (cursor < dayEndMs) gaps.push({ start: cursor, end: dayEndMs });
  return gaps.filter((g) => g.end > g.start);
}

/**
 * Reflow flexible items around frozen blocks. Items are placed in priority
 * order (then earliest original start); each placed item becomes occupied so
 * subsequent items flow around it.
 */
export function reflowDay(params: ReflowParams): Placement[] {
  const minDurMs = (params.minDurationMin ?? DEFAULT_MIN_DURATION) * 60_000;
  const occupied: Interval[] = [...params.busy];

  const order = [...params.flexible].sort((a, b) => a.priority - b.priority || a.originalStart - b.originalStart);
  const placements: Placement[] = [];

  for (const item of order) {
    const durMs = Math.max(minDurMs, (item.durationMin || 60) * 60_000);
    // Floor: never schedule earlier than `now`, and never earlier than the task
    // was originally planned (avoids churn / surprising pull-forwards). A missed
    // task (originalStart in the past) therefore floors at `now` and is recovered
    // into the next free slot.
    const floor = Math.max(params.nowMs, item.originalStart);
    const gaps = freeGaps(occupied, floor, params.dayEndMs);

    const fullGap = gaps.find((g) => g.end - g.start >= durMs);
    let newStart: number;
    let newEnd: number;
    let shortened = false;
    let dropped = false;

    if (fullGap) {
      newStart = fullGap.start;
      newEnd = newStart + durMs;
    } else {
      // no full slot: take the largest gap and shorten, unless even that is too small
      const largest = gaps.reduce<Interval | null>((best, g) => (!best || g.end - g.start > best.end - best.start ? g : best), null);
      if (largest && largest.end - largest.start >= minDurMs) {
        newStart = largest.start;
        newEnd = largest.end;
        shortened = true;
      } else {
        // cannot place today
        newStart = item.originalStart;
        newEnd = item.originalEnd;
        dropped = true;
      }
    }

    if (!dropped) occupied.push({ start: newStart, end: newEnd });

    const moved = !dropped && newStart !== item.originalStart;
    placements.push({
      occurrenceId: item.occurrenceId,
      taskId: item.taskId,
      title: item.title,
      originalStart: item.originalStart,
      originalEnd: item.originalEnd,
      newStart,
      newEnd,
      moved,
      shortened,
      dropped,
      fullSlotExisted: Boolean(fullGap),
    });
  }

  return placements;
}
