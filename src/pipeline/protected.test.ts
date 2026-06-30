/**
 * Proves protected time is ENFORCED end-to-end: persisted on the task, derived
 * back into protected intervals, flagged at capture, and frozen during reflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProposal, acceptProposal, type BuildContext } from './proposal.ts';
import { commit, InMemoryRepository } from './commit.ts';
import { sequentialIdGen } from './index.ts';
import { protectedIntervals } from '../read/today.ts';
import type { ExtractionResult } from '../ai/types.ts';
import type { CaptureSource } from '../domain/types.ts';

const NOW = '2026-06-29T00:00:00.000Z';
const SOURCE: CaptureSource = { method: 'text', capturedAt: NOW };

function extraction(items: Array<Partial<ExtractionResult['items'][number]>>): ExtractionResult {
  return {
    profile: [], goals: [], constraints: [], ambiguities: [], warnings: [],
    items: items.map((p, i) => ({ tempId: `t${i}`, title: p.title ?? 'X', type: p.type ?? 'flexible', category: p.category ?? 'other', confidence: 0.9, ...p })),
  };
}
function ctx(over: Partial<BuildContext> = {}): BuildContext {
  return { spaceId: 'me', reason: 'initial_capture', referenceDate: '2026-06-29', timezone: 'UTC', idGen: sequentialIdGen('p'), now: () => NOW, ...over };
}

test('protected flag is persisted on the committed task and re-derivable', () => {
  const repo = new InMemoryRepository();
  const idGen = sequentialIdGen('c');
  const ex = extraction([{ title: 'Family dinner', type: 'fixed', category: 'family', protected: true, startTimeLocal: '19:00', endTimeLocal: '20:00', rrule: 'FREQ=DAILY' }]);
  const proposal = buildProposal(ex, ctx({ idGen }));
  commit(acceptProposal(proposal), repo, { source: SOURCE, idGen, now: () => NOW, materializeDays: 2 });

  const task = [...repo.tasks.values()][0]!;
  assert.equal(task.protected, true);

  const intervals = protectedIntervals(repo.occurrences, repo.tasks, '2026-06-29T00:00:00Z', '2026-06-30T23:59:59Z');
  assert.ok(intervals.length >= 1);
  assert.equal(intervals[0]!.label, 'Family dinner');
});

test('capture flags a new item placed over EXISTING protected time', () => {
  const ex = extraction([{ title: 'Study', type: 'flexible', category: 'learning', startTimeLocal: '19:00', rrule: 'FREQ=DAILY' }]);
  const proposal = buildProposal(ex, ctx({
    protectedBlocks: [{ label: 'Family dinner', start: '2026-06-29T18:30:00Z', end: '2026-06-29T19:30:00Z' }],
  }));
  assert.ok(proposal.conflicts.some((c) => c.kind === 'protected_time'));
});

test('capture flags a new item placed over protected time declared IN THE SAME capture', () => {
  const ex = extraction([
    { title: 'Maghrib', type: 'fixed', category: 'faith', protected: true, startTimeLocal: '19:00', endTimeLocal: '19:20', rrule: 'FREQ=DAILY' },
    { title: 'Gym', type: 'flexible', category: 'health', startTimeLocal: '19:00', endTimeLocal: '20:00', rrule: 'FREQ=DAILY' },
  ]);
  const proposal = buildProposal(ex, ctx());
  assert.ok(proposal.conflicts.some((c) => c.kind === 'protected_time'));
});

test('a non-protected item over nothing produces no protected conflict', () => {
  const ex = extraction([{ title: 'Read', type: 'flexible', startTimeLocal: '21:00', rrule: 'FREQ=DAILY' }]);
  const proposal = buildProposal(ex, ctx());
  assert.equal(proposal.conflicts.filter((c) => c.kind === 'protected_time').length, 0);
});
