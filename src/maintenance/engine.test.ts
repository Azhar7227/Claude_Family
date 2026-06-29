import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceProposal, type MaintenanceContext, type ReplanItem } from './engine.ts';
import { InMemoryRepository } from '../pipeline/commit.ts';
import { commit } from '../pipeline/commit.ts';
import { acceptProposal, sequentialIdGen } from '../pipeline/index.ts';
import type { Occurrence, CaptureSource } from '../domain/types.ts';

const NOW = '2026-06-29T12:00:00.000Z';
const TZ = 'UTC';

function ctx(over: Partial<MaintenanceContext> = {}): MaintenanceContext {
  return { spaceId: 'sp', now: NOW, timezone: TZ, idGen: sequentialIdGen('p'), nowFn: () => NOW, dayEndLocal: '23:00', ...over };
}

function item(p: Partial<ReplanItem> & Pick<ReplanItem, 'occurrenceId' | 'title' | 'type' | 'start' | 'end'>): ReplanItem {
  return { taskId: 't_' + p.occurrenceId, category: 'other', priority: 3, status: 'planned', ...p };
}

test('calendar_conflict trigger moves a conflicting flexible task and produces an explanation', () => {
  const items: ReplanItem[] = [
    item({ occurrenceId: 'gym', title: 'Gym', type: 'flexible', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' }),
  ];
  const proposal = buildMaintenanceProposal(items, [], {
    kind: 'calendar_conflict',
    addedFixed: { title: 'Client call', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' },
  }, ctx());

  assert.equal(proposal.reason, 'calendar_conflict');
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.adjustments.length, 1);
  const adj = proposal.adjustments[0]!;
  assert.equal(adj.op, 'move');
  assert.ok(adj.occurrenceChange);

  // explainability: all five questions answered
  const ex = adj.explanation!;
  assert.ok(ex.why.includes('Client call'));
  assert.ok(ex.whatChanged[0]!.startsWith('Moved'));
  assert.ok(ex.constraintsPreserved.some((c) => c.includes('Client call')));
  assert.ok(ex.alternatives.length >= 1);
  assert.ok(ex.selectionReason.length > 0);
});

test('NEVER mutates: building a proposal does not change the input items', () => {
  const items = [item({ occurrenceId: 'gym', title: 'Gym', type: 'flexible', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' })];
  const snapshot = JSON.stringify(items);
  buildMaintenanceProposal(items, [], { kind: 'calendar_conflict', addedFixed: { title: 'X', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' } }, ctx());
  assert.equal(JSON.stringify(items), snapshot);
});

test('missed flexible task is recovered into a later slot', () => {
  const items = [
    item({ occurrenceId: 'run', title: 'Morning run', type: 'flexible', priority: 2, status: 'missed', start: '2026-06-29T06:00:00Z', end: '2026-06-29T07:00:00Z' }),
  ];
  const proposal = buildMaintenanceProposal(items, [], { kind: 'missed_task', occurrenceId: 'run' }, ctx());
  assert.equal(proposal.reason, 'missed_task');
  assert.equal(proposal.adjustments.length, 1);
  assert.ok(proposal.adjustments[0]!.explanation!.why.includes('Morning run'));
});

test('protected time is preserved (flexible never scheduled over it)', () => {
  const items = [
    item({ occurrenceId: 'study', title: 'Study', type: 'flexible', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' }),
  ];
  // a fixed event at 18-19 forces a move; protected dinner blocks 19-20
  const proposal = buildMaintenanceProposal(
    items,
    [{ label: 'Family dinner', start: '2026-06-29T19:00:00Z', end: '2026-06-29T20:00:00Z' }],
    { kind: 'calendar_conflict', addedFixed: { title: 'Call', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' } },
    ctx(),
  );
  const adj = proposal.adjustments[0]!;
  // study should land at/after 20:00, never inside the protected 19-20 block
  const newStart = Date.parse(adj.occurrenceChange!.afterStart);
  assert.ok(newStart >= Date.parse('2026-06-29T20:00:00Z'));
  assert.ok(adj.explanation!.constraintsPreserved.some((c) => c.includes('Family dinner') && c.includes('protected')));
});

test('proposal-level explanation rolls up the changes', () => {
  const items = [
    item({ occurrenceId: 'a', title: 'A', type: 'flexible', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z' }),
    item({ occurrenceId: 'b', title: 'B', type: 'flexible', start: '2026-06-29T18:30:00Z', end: '2026-06-29T19:30:00Z' }),
  ];
  const proposal = buildMaintenanceProposal(items, [], { kind: 'changed_work_hours', detail: 'now 9-7' }, ctx());
  assert.ok(proposal.explanation);
  assert.ok(proposal.explanation!.why.includes('work hours'));
});

test('an accepted maintenance proposal commits occurrence moves through the same pipeline', () => {
  const repo = new InMemoryRepository();
  const occ: Occurrence = { id: 'gym', taskId: 'tg', spaceId: 'sp', start: '2026-06-29T18:00:00Z', end: '2026-06-29T19:00:00Z', status: 'planned' };
  repo.addOccurrences([occ]);

  const items = [item({ occurrenceId: 'gym', taskId: 'tg', title: 'Gym', type: 'flexible', start: occ.start, end: occ.end })];
  const proposal = buildMaintenanceProposal(items, [], { kind: 'calendar_conflict', addedFixed: { title: 'Call', start: occ.start, end: occ.end } }, ctx());

  const source: CaptureSource = { method: 'text', capturedAt: NOW };
  const result = commit(acceptProposal(proposal), repo, { source, idGen: sequentialIdGen('l'), now: () => NOW });
  assert.equal(result.updatedTaskIds.length, 1);
  const moved = repo.getOccurrence('gym')!;
  assert.equal(moved.status, 'moved');
  assert.equal(moved.start, '2026-06-29T19:00:00.000Z');
  assert.equal(moved.originalStart, '2026-06-29T18:00:00Z');
  // ledger records the occurrence-level change for undo
  assert.ok(repo.ledger.some((l) => l.occurrenceId === 'gym' && l.op === 'move'));
});
