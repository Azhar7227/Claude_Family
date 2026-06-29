import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, buildTodayView } from './today.ts';
import type { Occurrence, Task, UUID } from '../domain/types.ts';

function task(id: string, title: string, type: Task['type'] = 'flexible'): Task {
  return { id, spaceId: 'sp', title, type, category: 'other', priority: 3, source: { method: 'text', capturedAt: 'x' } };
}
function occ(id: string, taskId: string, start: string, end: string, status: Occurrence['status'] = 'planned'): Occurrence {
  return { id, taskId, spaceId: 'sp', start, end, status };
}

const tasks = new Map<UUID, Task>([
  ['t1', task('t1', 'Morning run')],
  ['t2', task('t2', 'Standup', 'fixed')],
  ['t3', task('t3', 'Study')],
]);

test('identifies current / next / after around now', () => {
  const occs: Occurrence[] = [
    occ('o1', 't1', '2026-06-29T05:30:00Z', '2026-06-29T06:00:00Z'), // past
    occ('o2', 't2', '2026-06-29T09:00:00Z', '2026-06-29T10:00:00Z'), // current
    occ('o3', 't3', '2026-06-29T11:00:00Z', '2026-06-29T12:00:00Z'), // next
    occ('o4', 't1', '2026-06-29T14:00:00Z', '2026-06-29T15:00:00Z'), // after
  ];
  const view = buildTodayView(occs, tasks, '2026-06-29T09:30:00Z', 'UTC');
  assert.equal(view.current?.occurrenceId, 'o2');
  assert.equal(view.next?.occurrenceId, 'o3');
  assert.equal(view.after?.occurrenceId, 'o4');
  assert.equal(view.remainingMin, 30); // 09:30 -> 10:00
});

test('when nothing is active, soonest upcoming is next', () => {
  const occs = [occ('o3', 't3', '2026-06-29T11:00:00Z', '2026-06-29T12:00:00Z')];
  const view = buildTodayView(occs, tasks, '2026-06-29T09:30:00Z', 'UTC');
  assert.equal(view.current, undefined);
  assert.equal(view.next?.occurrenceId, 'o3');
  assert.equal(view.remainingMin, 0);
});

test('only includes occurrences on the local day (tz-aware)', () => {
  // 23:00 UTC on 06-28 is 04:30 on 06-29 in Asia/Kolkata
  const occs = [occ('o1', 't1', '2026-06-28T23:00:00Z', '2026-06-28T23:30:00Z')];
  const view = buildTodayView(occs, tasks, '2026-06-29T05:00:00Z', 'Asia/Kolkata');
  assert.equal(view.localDate, '2026-06-29');
  assert.equal(view.timeline.length, 1); // counted as the 29th locally
});

test('done/total counts and history exclusion', () => {
  const occs = [
    occ('o1', 't1', '2026-06-29T05:30:00Z', '2026-06-29T06:00:00Z', 'done'),
    occ('o2', 't2', '2026-06-29T09:00:00Z', '2026-06-29T10:00:00Z', 'planned'),
  ];
  const view = buildTodayView(occs, tasks, '2026-06-29T07:00:00Z', 'UTC');
  assert.equal(view.doneCount, 1);
  assert.equal(view.totalCount, 2);
  assert.equal(view.next?.occurrenceId, 'o2');
});

test('skips occurrences whose task was removed (orphans)', () => {
  const occs = [occ('o9', 'gone', '2026-06-29T09:00:00Z', '2026-06-29T10:00:00Z')];
  const view = buildTodayView(occs, tasks, '2026-06-29T08:00:00Z', 'UTC');
  assert.equal(view.timeline.length, 0);
});

test('buildTimeline returns a sorted range projection', () => {
  const occs = [
    occ('o3', 't3', '2026-07-01T11:00:00Z', '2026-07-01T12:00:00Z'),
    occ('o2', 't2', '2026-06-29T09:00:00Z', '2026-06-29T10:00:00Z'),
  ];
  const tl = buildTimeline(occs, tasks, '2026-06-29T00:00:00Z', '2026-07-02T00:00:00Z');
  assert.deepEqual(tl.map((e) => e.occurrenceId), ['o2', 'o3']);
});
