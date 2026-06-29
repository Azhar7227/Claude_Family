import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNotifications } from './notifications.ts';
import type { ReminderFire } from './reminders.ts';

function fire(p: Partial<ReminderFire> & Pick<ReminderFire, 'occurrenceId' | 'fireAt' | 'priority'>): ReminderFire {
  return { taskId: 't', title: p.occurrenceId, offsetMin: 0, channel: 'push', ...p };
}

test('batches normal-priority fires within the batch window', () => {
  const fires = [
    fire({ occurrenceId: 'a', fireAt: '2026-06-29T08:00:00Z', priority: 'normal' }),
    fire({ occurrenceId: 'b', fireAt: '2026-06-29T08:10:00Z', priority: 'normal' }),
    fire({ occurrenceId: 'c', fireAt: '2026-06-29T08:20:00Z', priority: 'normal' }),
  ];
  const plan = planNotifications(fires, { batchWindowMin: 30, maxPerDay: 10 });
  assert.equal(plan.notifications.length, 1);
  assert.equal(plan.notifications[0]!.batched, true);
  assert.equal(plan.notifications[0]!.items.length, 3);
});

test('high-priority reminders are never batched', () => {
  const fires = [
    fire({ occurrenceId: 'pray1', fireAt: '2026-06-29T08:00:00Z', priority: 'high' }),
    fire({ occurrenceId: 'pray2', fireAt: '2026-06-29T08:05:00Z', priority: 'high' }),
  ];
  const plan = planNotifications(fires, { batchWindowMin: 30, maxPerDay: 10 });
  assert.equal(plan.notifications.length, 2);
  assert.ok(plan.notifications.every((n) => !n.batched));
});

test('budget suppresses normal overflow but never high-priority', () => {
  const fires: ReminderFire[] = [];
  // 3 high + 4 normal spaced an hour apart so they do not batch
  for (let h = 0; h < 3; h++) fires.push(fire({ occurrenceId: 'h' + h, fireAt: `2026-06-29T0${h}:00:00Z`, priority: 'high' }));
  for (let h = 0; h < 4; h++) fires.push(fire({ occurrenceId: 'n' + h, fireAt: `2026-06-29T1${h}:00:00Z`, priority: 'normal' }));

  const plan = planNotifications(fires, { batchWindowMin: 5, maxPerDay: 4 });
  const keptHigh = plan.notifications.filter((n) => n.priority === 'high').length;
  const keptNormal = plan.notifications.filter((n) => n.priority === 'normal').length;
  assert.equal(keptHigh, 3); // all high kept
  assert.equal(keptNormal, 1); // budget 4 - 3 high = 1 normal
  assert.equal(plan.suppressed.length, 3); // 3 normal suppressed
  assert.ok(plan.suppressed.every((s) => s.reason === 'budget'));
});

test('plan is deterministic regardless of input order', () => {
  const a = fire({ occurrenceId: 'a', fireAt: '2026-06-29T08:00:00Z', priority: 'normal' });
  const b = fire({ occurrenceId: 'b', fireAt: '2026-06-29T09:00:00Z', priority: 'high' });
  assert.deepEqual(planNotifications([a, b]), planNotifications([b, a]));
});
