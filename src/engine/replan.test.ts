import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflowDay, type FlexibleToPlace, type Interval } from './replan.ts';

const H = (h: number, m = 0) => Date.parse(`2026-06-29T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);

function flex(p: Partial<FlexibleToPlace> & Pick<FlexibleToPlace, 'occurrenceId' | 'durationMin' | 'originalStart'>): FlexibleToPlace {
  return {
    taskId: 't_' + p.occurrenceId,
    title: p.occurrenceId,
    priority: 3,
    originalEnd: p.originalStart + p.durationMin * 60_000,
    ...p,
  };
}

test('places a conflicting flexible item into the next free gap', () => {
  const busy: Interval[] = [{ start: H(18), end: H(19) }]; // fixed meeting 18-19
  const flexible = [flex({ occurrenceId: 'gym', durationMin: 60, originalStart: H(18) })]; // wants 18-19, conflicts
  const out = reflowDay({ nowMs: H(17), dayEndMs: H(23), busy, flexible });
  assert.equal(out[0]!.moved, true);
  assert.equal(out[0]!.newStart, H(19)); // pushed to right after the meeting
  assert.equal(out[0]!.shortened, false);
});

test('shortens when no full-length slot remains', () => {
  const busy: Interval[] = [{ start: H(18), end: H(22, 30) }];
  const flexible = [flex({ occurrenceId: 'study', durationMin: 60, originalStart: H(18) })];
  const out = reflowDay({ nowMs: H(17), dayEndMs: H(23), busy, flexible });
  assert.equal(out[0]!.shortened, true);
  assert.equal(out[0]!.newStart, H(22, 30));
  assert.equal(out[0]!.newEnd, H(23)); // clipped to day end (30 min)
});

test('drops (suggests skip) when no acceptable slot exists', () => {
  const busy: Interval[] = [{ start: H(17), end: H(23) }]; // whole evening blocked
  const flexible = [flex({ occurrenceId: 'walk', durationMin: 30, originalStart: H(18) })];
  const out = reflowDay({ nowMs: H(17), dayEndMs: H(23), busy, flexible, minDurationMin: 15 });
  assert.equal(out[0]!.dropped, true);
});

test('higher priority items get first pick of the gaps', () => {
  const busy: Interval[] = [{ start: H(19), end: H(20) }];
  // two items both want the 18:00 area; only 18-19 fits one before the block
  const flexible = [
    flex({ occurrenceId: 'low', durationMin: 60, originalStart: H(18), priority: 5 }),
    flex({ occurrenceId: 'high', durationMin: 60, originalStart: H(18), priority: 1 }),
  ];
  const out = reflowDay({ nowMs: H(18), dayEndMs: H(23), busy, flexible });
  const high = out.find((o) => o.occurrenceId === 'high')!;
  const low = out.find((o) => o.occurrenceId === 'low')!;
  assert.equal(high.newStart, H(18)); // high priority takes the early slot
  assert.equal(low.newStart, H(20)); // low flows after the block
});

test('unchanged item reports no move', () => {
  const flexible = [flex({ occurrenceId: 'read', durationMin: 60, originalStart: H(20) })];
  const out = reflowDay({ nowMs: H(18), dayEndMs: H(23), busy: [], flexible });
  assert.equal(out[0]!.moved, false);
  assert.equal(out[0]!.newStart, H(20));
});
