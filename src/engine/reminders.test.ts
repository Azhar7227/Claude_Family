import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReminderFires, reminderPriority, type RemindableOccurrence } from './reminders.ts';

const occs: RemindableOccurrence[] = [
  { occurrenceId: 'o1', taskId: 't1', title: 'Standup', category: 'work', type: 'fixed', start: '2026-06-29T09:00:00Z' },
  { occurrenceId: 'o2', taskId: 't2', title: 'Read', category: 'learning', type: 'flexible', start: '2026-06-29T20:00:00Z' },
];

test('priority: faith/health/fixed are high; flexible is normal', () => {
  assert.equal(reminderPriority('faith', 'flexible'), 'high');
  assert.equal(reminderPriority('health', 'flexible'), 'high');
  assert.equal(reminderPriority('work', 'fixed'), 'high');
  assert.equal(reminderPriority('learning', 'flexible'), 'normal');
});

test('computes fire times from default offsets', () => {
  const fires = computeReminderFires(occs, { defaultOffsetsMin: [10, 0] }, '2026-06-29T00:00:00Z', '2026-06-30T00:00:00Z');
  const o1Fires = fires.filter((f) => f.occurrenceId === 'o1').map((f) => f.fireAt);
  assert.deepEqual(o1Fires, ['2026-06-29T08:50:00.000Z', '2026-06-29T09:00:00.000Z']);
});

test('per-task offsets override defaults', () => {
  const fires = computeReminderFires(
    occs,
    { defaultOffsetsMin: [0], offsetsByTask: new Map([['t2', [30]]]) },
    '2026-06-29T00:00:00Z',
    '2026-06-30T00:00:00Z',
  );
  const o2 = fires.find((f) => f.occurrenceId === 'o2');
  assert.equal(o2?.fireAt, '2026-06-29T19:30:00.000Z');
});

test('fires outside the window are excluded', () => {
  const fires = computeReminderFires(occs, { defaultOffsetsMin: [0] }, '2026-06-29T10:00:00Z', '2026-06-29T12:00:00Z');
  assert.equal(fires.length, 0); // o1 at 09:00 before window, o2 at 20:00 after
});

test('output is sorted by fire time', () => {
  const fires = computeReminderFires(occs, { defaultOffsetsMin: [0] }, '2026-06-29T00:00:00Z', '2026-06-30T00:00:00Z');
  const times = fires.map((f) => Date.parse(f.fireAt));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});
