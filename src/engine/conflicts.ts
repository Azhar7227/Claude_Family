/**
 * Deterministic conflict detection (TECH_SPEC §4). Pure functions over placed
 * items — no LLM. Resolution policy: fixed beats flexible; two fixed items
 * overlapping is a hard conflict the user must resolve; protected time is
 * inviolable without explicit override.
 */

import type { TaskType, UUID } from '../domain/types.ts';

export type ConflictKind =
  | 'overlap' // two flexible (or two fixed) items occupy the same time
  | 'fixed_collision' // a flexible item overlaps a fixed one (fixed wins)
  | 'over_capacity' // impossible scheduled density in a day
  | 'protected_time'; // overlaps a user-declared protected block

export interface PlacedItem {
  id: UUID; // occurrence id
  taskId: UUID;
  title: string;
  type: TaskType;
  start: string; // UTC ISO
  end: string; // UTC ISO
}

export interface ProtectedBlock {
  id: UUID;
  label: string;
  start: string; // UTC ISO
  end: string; // UTC ISO
}

/** Which item the engine recommends moving to resolve the conflict (null = user must choose). */
export interface Conflict {
  kind: ConflictKind;
  itemRefs: UUID[];
  detail: string;
  moveCandidateId: UUID | null;
}

const DAY_CAPACITY_MIN = 18 * 60; // > 18h scheduled in one local-UTC day is implausible

function ms(iso: string): number {
  return Date.parse(iso);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd; // half-open intervals; touching is not overlap
}

export interface DetectOptions {
  protectedBlocks?: ProtectedBlock[];
  dayCapacityMin?: number;
}

/**
 * Detect all conflicts among `items`. Deterministic and order-independent
 * (output is sorted for stable comparison).
 */
export function detectConflicts(items: PlacedItem[], opts: DetectOptions = {}): Conflict[] {
  const conflicts: Conflict[] = [];
  const sorted = [...items].sort((a, b) => ms(a.start) - ms(b.start) || a.id.localeCompare(b.id));

  // pairwise overlap (sweep: since sorted by start, stop when next starts after current ends)
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const aStart = ms(a.start);
    const aEnd = ms(a.end);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const bStart = ms(b.start);
      if (bStart >= aEnd) break; // no later item can overlap a
      const bEnd = ms(b.end);
      if (!overlaps(aStart, aEnd, bStart, bEnd)) continue;

      if (a.type === 'fixed' && b.type === 'fixed') {
        conflicts.push({
          kind: 'overlap',
          itemRefs: [a.id, b.id],
          detail: `"${a.title}" and "${b.title}" are both fixed and overlap — only you can decide.`,
          moveCandidateId: null,
        });
      } else if (a.type === 'fixed' || b.type === 'fixed') {
        const flexible = a.type === 'flexible' ? a : b;
        const fixed = a.type === 'fixed' ? a : b;
        conflicts.push({
          kind: 'fixed_collision',
          itemRefs: [a.id, b.id],
          detail: `"${flexible.title}" overlaps fixed "${fixed.title}". Suggest moving "${flexible.title}".`,
          moveCandidateId: flexible.id,
        });
      } else {
        // two flexible items: move the lower-priority/later one (later, since we lack priority here)
        conflicts.push({
          kind: 'overlap',
          itemRefs: [a.id, b.id],
          detail: `"${a.title}" and "${b.title}" overlap. Suggest moving "${b.title}".`,
          moveCandidateId: b.id,
        });
      }
    }
  }

  // protected time
  for (const block of opts.protectedBlocks ?? []) {
    const pStart = ms(block.start);
    const pEnd = ms(block.end);
    for (const item of sorted) {
      if (overlaps(ms(item.start), ms(item.end), pStart, pEnd)) {
        conflicts.push({
          kind: 'protected_time',
          itemRefs: [item.id],
          detail: `"${item.title}" overlaps protected time "${block.label}".`,
          moveCandidateId: item.type === 'fixed' ? null : item.id,
        });
      }
    }
  }

  // over-capacity per local day (bucket by UTC date of start; good enough for MVP)
  const cap = opts.dayCapacityMin ?? DAY_CAPACITY_MIN;
  const perDay = new Map<string, { mins: number; ids: UUID[] }>();
  for (const item of sorted) {
    const day = item.start.slice(0, 10);
    const mins = (ms(item.end) - ms(item.start)) / 60_000;
    const bucket = perDay.get(day) ?? { mins: 0, ids: [] };
    bucket.mins += mins;
    bucket.ids.push(item.id);
    perDay.set(day, bucket);
  }
  for (const [day, bucket] of perDay) {
    if (bucket.mins > cap) {
      conflicts.push({
        kind: 'over_capacity',
        itemRefs: bucket.ids,
        detail: `${Math.round(bucket.mins / 60)}h scheduled on ${day} — exceeds a realistic day.`,
        moveCandidateId: null,
      });
    }
  }

  return conflicts.sort(
    (x, y) => x.kind.localeCompare(y.kind) || x.itemRefs.join().localeCompare(y.itemRefs.join()),
  );
}
