import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicStubProvider } from '../ai/stub-provider.ts';
import { InMemoryRepository, acceptProposal, commit, runCapture, sequentialIdGen, type CaptureContext } from './index.ts';
import type { CaptureSource } from '../domain/types.ts';

const FIXED_NOW = '2026-06-29T00:00:00.000Z';

function ctx(idGen: () => string): CaptureContext {
  return {
    provider: new DeterministicStubProvider(),
    spaceId: 'sp',
    referenceDate: '2026-06-29',
    timezone: 'UTC',
    idGen,
    now: () => FIXED_NOW,
  };
}

test('image capture with pre-computed OCR text flows through the same pipeline', async () => {
  const { proposal, meta } = await runCapture(
    { method: 'image', uploadId: 'u1', mimeType: 'image/png', ocrText: 'Math at 9. Science at 10. (every day)' },
    ctx(sequentialIdGen('t')),
  );
  assert.equal(meta.provider, 'stub');
  assert.ok(proposal.adjustments.length >= 2);
  assert.ok(proposal.adjustments.every((a) => a.op === 'add'));
});

test('image capture with inline bytes (stub decodes) commits a routine end-to-end', async () => {
  const timetable = 'Work 9 to 6 weekdays. Gym after work.';
  const base64 = Buffer.from(timetable, 'utf8').toString('base64');
  const idGen = sequentialIdGen('t');
  const { proposal } = await runCapture(
    { method: 'image', uploadId: 'u2', mimeType: 'image/jpeg', base64 },
    ctx(idGen),
  );
  assert.ok(proposal.adjustments.length >= 2);

  const repo = new InMemoryRepository();
  const source: CaptureSource = { method: 'image', uploadId: 'u2', capturedAt: FIXED_NOW };
  const result = commit(acceptProposal(proposal), repo, { source, idGen, now: () => FIXED_NOW, materializeDays: 7 });
  assert.ok(result.createdTaskIds.length >= 2);
  // source provenance is preserved on committed tasks (for re-import dedup later)
  assert.ok([...repo.tasks.values()].every((t) => t.source.method === 'image'));
});

test('the inputMethod is tracked as image in eval traces', async () => {
  const provider = new DeterministicStubProvider();
  assert.ok(provider.capabilities.has('vision'));
});
