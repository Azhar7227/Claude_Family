/**
 * Notification engine (deterministic) — the anti-fatigue policy layer.
 *
 * Product docs flag notification overload as a top churn risk. This engine:
 *   1. BATCHES low-priority reminders that fire close together into one push.
 *   2. ENFORCES a per-day budget, suppressing the lowest-priority overflow.
 *   3. NEVER suppresses or batches high-priority reminders (prayer, meds,
 *      fixed commitments) — those always fire standalone and on time.
 *
 * Pure and order-independent; the worker just executes the plan.
 */

import type { UUID } from '../domain/types.ts';
import type { ReminderFire, ReminderPriority } from './reminders.ts';

export interface NotificationConfig {
  /** Max notifications delivered per local day (per UTC date here; MVP). */
  maxPerDay: number;
  /** Normal-priority fires within this window are batched into one. */
  batchWindowMin: number;
}

export interface NotificationItem {
  occurrenceId: UUID;
  title: string;
}

export interface PlannedNotification {
  fireAt: string; // UTC ISO
  channel: 'push' | 'local';
  priority: ReminderPriority;
  batched: boolean;
  items: NotificationItem[];
}

export interface SuppressedReminder {
  occurrenceId: UUID;
  reason: 'budget';
}

export interface NotificationPlan {
  notifications: PlannedNotification[];
  suppressed: SuppressedReminder[];
}

const DEFAULTS: NotificationConfig = { maxPerDay: 8, batchWindowMin: 30 };

export function planNotifications(fires: ReminderFire[], config: Partial<NotificationConfig> = {}): NotificationPlan {
  const cfg = { ...DEFAULTS, ...config };
  const sorted = [...fires].sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt) || a.occurrenceId.localeCompare(b.occurrenceId));

  const high = sorted.filter((f) => f.priority === 'high');
  const normal = sorted.filter((f) => f.priority === 'normal');

  // 1. high-priority -> standalone notifications
  const notifications: PlannedNotification[] = high.map((f) => ({
    fireAt: f.fireAt,
    channel: f.channel,
    priority: 'high',
    batched: false,
    items: [{ occurrenceId: f.occurrenceId, title: f.title }],
  }));

  // 2. normal-priority -> greedy batching within batchWindowMin, same channel
  let i = 0;
  const windowMs = cfg.batchWindowMin * 60_000;
  while (i < normal.length) {
    const head = normal[i]!;
    const group: ReminderFire[] = [head];
    let j = i + 1;
    while (j < normal.length && normal[j]!.channel === head.channel && Date.parse(normal[j]!.fireAt) - Date.parse(head.fireAt) <= windowMs) {
      group.push(normal[j]!);
      j++;
    }
    notifications.push({
      fireAt: head.fireAt,
      channel: head.channel,
      priority: 'normal',
      batched: group.length > 1,
      items: group.map((g) => ({ occurrenceId: g.occurrenceId, title: g.title })),
    });
    i = j;
  }

  notifications.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));

  // 3. per-day budget: keep all high; trim normal overflow (latest dropped first)
  const suppressed: SuppressedReminder[] = [];
  const byDay = new Map<string, PlannedNotification[]>();
  for (const n of notifications) {
    const day = n.fireAt.slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(n);
  }

  const kept: PlannedNotification[] = [];
  for (const [, dayNotifs] of byDay) {
    const dayHigh = dayNotifs.filter((n) => n.priority === 'high');
    const dayNormal = dayNotifs.filter((n) => n.priority === 'normal');
    const normalBudget = Math.max(0, cfg.maxPerDay - dayHigh.length);
    const keptNormal = dayNormal.slice(0, normalBudget);
    const droppedNormal = dayNormal.slice(normalBudget);
    for (const n of droppedNormal) {
      for (const item of n.items) suppressed.push({ occurrenceId: item.occurrenceId, reason: 'budget' });
    }
    kept.push(...dayHigh, ...keptNormal);
  }

  kept.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
  return { notifications: kept, suppressed };
}
