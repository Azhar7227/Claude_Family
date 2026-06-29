/**
 * Reminder engine (deterministic). Computes WHEN reminders should fire from
 * occurrences + a per-task offset policy. The notification engine
 * (notifications.ts) then decides what actually gets sent (budget/batching).
 *
 * Separation matters: firing times are pure scheduling; send decisions are a
 * policy layer. Keeping them apart makes both independently testable.
 */

import type { Category, TaskType, UUID } from '../domain/types.ts';

export type ReminderPriority = 'high' | 'normal';

export interface RemindableOccurrence {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  category: Category;
  type: TaskType;
  start: string; // UTC ISO
}

export interface ReminderFire {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  fireAt: string; // UTC ISO
  offsetMin: number;
  channel: 'push' | 'local';
  priority: ReminderPriority;
}

export interface ReminderPolicy {
  /** Offsets (minutes before start) per task; falls back to defaultOffsetsMin. */
  offsetsByTask?: Map<UUID, number[]>;
  defaultOffsetsMin: number[];
  channel?: 'push' | 'local';
}

/**
 * High-priority categories must never be silently dropped by the budget layer:
 * faith (prayer), and fixed commitments. Health (medicine) is high too.
 */
export function reminderPriority(category: Category, type: TaskType): ReminderPriority {
  if (category === 'faith' || category === 'health') return 'high';
  if (type === 'fixed') return 'high';
  return 'normal';
}

/** Compute reminder fire times within [fromIso, toIso] (inclusive). */
export function computeReminderFires(
  occurrences: RemindableOccurrence[],
  policy: ReminderPolicy,
  fromIso: string,
  toIso: string,
): ReminderFire[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const channel = policy.channel ?? 'push';
  const fires: ReminderFire[] = [];

  for (const occ of occurrences) {
    const offsets = policy.offsetsByTask?.get(occ.taskId) ?? policy.defaultOffsetsMin;
    const startMs = Date.parse(occ.start);
    for (const offsetMin of offsets) {
      const fireMs = startMs - offsetMin * 60_000;
      if (fireMs < from || fireMs > to) continue;
      fires.push({
        occurrenceId: occ.occurrenceId,
        taskId: occ.taskId,
        title: occ.title,
        fireAt: new Date(fireMs).toISOString(),
        offsetMin,
        channel,
        priority: reminderPriority(occ.category, occ.type),
      });
    }
  }

  return fires.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || a.occurrenceId.localeCompare(b.occurrenceId));
}
