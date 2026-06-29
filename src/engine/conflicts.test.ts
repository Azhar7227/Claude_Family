import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts, type PlacedItem } from './conflicts.ts';

function item(p: Partial<PlacedItem> & Pick<PlacedItem, 'id' | 'start' | 'end' | 'type'>): PlacedItem {
  return { taskId: 't_' + p.id, title: p.id, ...p };
}

test('no conflicts for non-overlapping items', () => {
  const c = detectConflicts([
    item({ id: 'a', type: 'flexible', start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' }),
    item({ id: 'b', type: 'flexible', start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z' }),
  ]);
  assert.equal(c.length, 0); // touching boundaries do not overlap
});

test('flexible overlapping fixed -> fixed_collision, moves the flexible one', () => {
  const c = detectConflicts([
    item({ id: 'gym', type: 'flexible', start: '2026-06-01T18:00:00Z', end: '2026-06-01T19:00:00Z' }),
    item({ id: 'mtg', type: 'fixed', start: '2026-06-01T18:30:00Z', end: '2026-06-01T19:30:00Z' }),
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.kind, 'fixed_collision');
  assert.equal(c[0]!.moveCandidateId, 'gym');
});

test('two fixed overlapping -> hard conflict, no auto move candidate', () => {
  const c = detectConflicts([
    item({ id: 'doc', type: 'fixed', start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' }),
    item({ id: 'call', type: 'fixed', start: '2026-06-01T09:30:00Z', end: '2026-06-01T10:30:00Z' }),
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.kind, 'overlap');
  assert.equal(c[0]!.moveCandidateId, null);
});

test('protected time overlap is detected', () => {
  const c = detectConflicts(
    [item({ id: 'study', type: 'flexible', start: '2026-06-01T22:30:00Z', end: '2026-06-01T23:30:00Z' })],
    {
      protectedBlocks: [
        { id: 'sleep', label: 'Sleep', start: '2026-06-01T23:00:00Z', end: '2026-06-02T06:00:00Z' },
      ],
    },
  );
  assert.equal(c.length, 1);
  assert.equal(c[0]!.kind, 'protected_time');
  assert.equal(c[0]!.moveCandidateId, 'study');
});

test('over-capacity flagged when a day exceeds the cap', () => {
  const items: PlacedItem[] = [];
  for (let h = 0; h < 20; h++) {
    const hh = String(h).padStart(2, '0');
    items.push(
      item({
        id: 'x' + h,
        type: 'fixed',
        start: `2026-06-01T${hh}:00:00Z`,
        end: `2026-06-01T${hh}:55:00Z`,
      }),
    );
  }
  const c = detectConflicts(items, { dayCapacityMin: 18 * 60 });
  assert.ok(c.some((x) => x.kind === 'over_capacity'));
});

test('detection is order-independent', () => {
  const a = item({ id: 'a', type: 'flexible', start: '2026-06-01T09:00:00Z', end: '2026-06-01T10:00:00Z' });
  const b = item({ id: 'b', type: 'fixed', start: '2026-06-01T09:30:00Z', end: '2026-06-01T10:30:00Z' });
  assert.deepEqual(detectConflicts([a, b]), detectConflicts([b, a]));
});
