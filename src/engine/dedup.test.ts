import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, reconcile, type DiffableTask } from './dedup.ts';

function t(p: Partial<DiffableTask> & Pick<DiffableTask, 'refId' | 'title'>): DiffableTask {
  return { type: 'fixed', category: 'work', ...p };
}

test('normalizeTitle is robust to case and punctuation', () => {
  assert.equal(normalizeTitle('  Stand-Up!! '), normalizeTitle('standup'));
  assert.equal(normalizeTitle('Team   Sync'), 'team sync');
});

test('new item with no match -> add', () => {
  const d = reconcile([], [t({ refId: 'i1', title: 'Standup' })]);
  assert.equal(d.length, 1);
  assert.equal(d[0]!.op, 'add');
});

test('identical item -> noop (no duplicate)', () => {
  const existing = [t({ refId: 'e1', title: 'Standup', rrule: 'FREQ=DAILY', startTimeLocal: '09:00' })];
  const incoming = [t({ refId: 'i1', title: 'Stand-up', rrule: 'FREQ=DAILY', startTimeLocal: '09:00' })];
  const d = reconcile(existing, incoming);
  assert.equal(d.length, 1);
  assert.equal(d[0]!.op, 'noop');
});

test('changed time -> update with changed fields', () => {
  const existing = [t({ refId: 'e1', title: 'Shift', startTimeLocal: '09:00' })];
  const incoming = [t({ refId: 'i1', title: 'Shift', startTimeLocal: '10:00' })];
  const d = reconcile(existing, incoming);
  assert.equal(d[0]!.op, 'update');
  assert.deepEqual(d[0]!.changedFields, ['startTimeLocal']);
});

test('existing item absent from new import -> remove proposal', () => {
  const existing = [t({ refId: 'e1', title: 'Old Class' })];
  const incoming = [t({ refId: 'i1', title: 'New Class' })];
  const d = reconcile(existing, incoming);
  const ops = d.map((x) => x.op).sort();
  assert.deepEqual(ops, ['add', 'remove']);
});

test('full reimport scenario: add + update + remove + noop', () => {
  const existing = [
    t({ refId: 'e1', title: 'Math', startTimeLocal: '09:00' }),
    t({ refId: 'e2', title: 'Science', startTimeLocal: '10:00' }),
    t({ refId: 'e3', title: 'Art', startTimeLocal: '11:00' }),
  ];
  const incoming = [
    t({ refId: 'i1', title: 'Math', startTimeLocal: '09:00' }), // noop
    t({ refId: 'i2', title: 'Science', startTimeLocal: '10:30' }), // update
    t({ refId: 'i4', title: 'History', startTimeLocal: '11:00' }), // add
    // Art dropped -> remove
  ];
  const d = reconcile(existing, incoming);
  const byOp = (op: string) => d.filter((x) => x.op === op).length;
  assert.equal(byOp('noop'), 1);
  assert.equal(byOp('update'), 1);
  assert.equal(byOp('add'), 1);
  assert.equal(byOp('remove'), 1);
});
