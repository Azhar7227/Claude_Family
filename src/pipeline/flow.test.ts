import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicStubProvider } from '../ai/stub-provider.ts';
import {
  InMemoryRepository,
  acceptProposal,
  commit,
  rejectProposal,
  runCapture,
  sequentialIdGen,
  type CaptureContext,
} from './index.ts';
import { ProposalStateError } from './proposal.ts';
import type { CaptureSource } from '../domain/types.ts';

const FIXED_NOW = '2026-06-29T00:00:00.000Z';
const SOURCE: CaptureSource = { method: 'text', capturedAt: FIXED_NOW };

function ctx(overrides: Partial<CaptureContext> = {}): CaptureContext {
  return {
    provider: new DeterministicStubProvider(),
    spaceId: 'space1',
    referenceDate: '2026-06-29',
    timezone: 'Asia/Kolkata',
    idGen: sequentialIdGen('t'),
    now: () => FIXED_NOW,
    ...overrides,
  };
}

test('end-to-end: text capture -> proposal -> accept all -> commit materializes routine', async () => {
  const repo = new InMemoryRepository();
  const idGen = sequentialIdGen('t');
  const { proposal } = await runCapture('Study Salesforce for one hour every day at 8', ctx({ idGen }));

  assert.equal(proposal.status, 'proposed');
  assert.ok(proposal.adjustments.length >= 1);
  assert.ok(proposal.adjustments.every((a) => a.op === 'add'));

  const accepted = acceptProposal(proposal);
  assert.equal(accepted.status, 'accepted');

  const result = commit(accepted, repo, { source: SOURCE, idGen, now: () => FIXED_NOW, materializeDays: 7 });
  assert.equal(result.createdTaskIds.length, proposal.adjustments.length);
  assert.ok(repo.tasks.size >= 1);
  assert.ok(repo.occurrences.length >= 7); // daily over a 7-day window
  assert.equal(repo.ledger.length, result.createdTaskIds.length); // one ledger entry per add
});

test('INVARIANT: commit refuses a proposal that was never accepted (no silent commit)', async () => {
  const repo = new InMemoryRepository();
  const { proposal } = await runCapture('Gym after work', ctx());
  assert.throws(
    () => commit(proposal, repo, { source: SOURCE, idGen: sequentialIdGen(), now: () => FIXED_NOW }),
    ProposalStateError,
  );
  assert.equal(repo.tasks.size, 0); // nothing written
});

test('INVARIANT: a rejected proposal cannot be committed', async () => {
  const repo = new InMemoryRepository();
  const { proposal } = await runCapture('Read for 30 minutes daily', ctx());
  const rejected = rejectProposal(proposal);
  assert.throws(() => commit(rejected, repo, { source: SOURCE, idGen: sequentialIdGen(), now: () => FIXED_NOW }), ProposalStateError);
});

test('partial accept commits only the chosen adjustments', async () => {
  const repo = new InMemoryRepository();
  const idGen = sequentialIdGen('t');
  const { proposal } = await runCapture('Work 9 to 6 weekdays. Gym after work. Read daily.', ctx({ idGen }));
  assert.ok(proposal.adjustments.length >= 2);

  const keep = proposal.adjustments[0]!.targetRef;
  const accepted = acceptProposal(proposal, [keep]);
  assert.equal(accepted.status, 'partially_accepted');

  const result = commit(accepted, repo, { source: SOURCE, idGen, now: () => FIXED_NOW });
  assert.equal(result.createdTaskIds.length, 1);
  assert.equal(repo.tasks.size, 1);
});

test('accepting an unknown adjustment ref throws', async () => {
  const { proposal } = await runCapture('Gym after work', ctx());
  assert.throws(() => acceptProposal(proposal, ['does-not-exist']), ProposalStateError);
});

test('detects a conflict between a fixed event and a flexible one at the same time', async () => {
  // both at 18:00 -> fixed meeting vs flexible gym
  const { proposal } = await runCapture('Meeting every day at 6pm. Gym every day at 6pm.', ctx());
  assert.ok(proposal.conflicts.length >= 1);
});

test('reimport reconciliation produces update/remove instead of duplicates', async () => {
  // First import
  const idGen = sequentialIdGen('t');
  const first = await runCapture('Math at 9. Science at 10. Art at 11. (every day)', ctx({ idGen }));
  // Build "existing" view from the first proposal's adds (simulating committed state)
  const existing = first.proposal.adjustments.map((a, i) => ({
    refId: `e${i}`,
    title: a.after!.title,
    type: a.after!.type,
    category: a.after!.category,
    rrule: a.after!.rrule,
    startTimeLocal: a.after!.startTimeLocal,
    candidate: a.after!,
  }));

  // Re-import: Art dropped, Science time changed, History added
  const second = await runCapture('Math at 9. Science at 10:30. History at 11. (every day)', ctx({
    idGen,
    reason: 'reimport',
    existing,
  }));
  const ops = second.proposal.adjustments.map((a) => a.op).sort();
  assert.ok(ops.includes('add')); // History
  assert.ok(ops.includes('remove')); // Art
  assert.ok(!ops.includes('noop' as never)); // noops are filtered out of proposals
});
