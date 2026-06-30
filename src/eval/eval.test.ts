import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEvalSink, NoopEvalSink, confidenceStats } from './sink.ts';
import { DeterministicStubProvider } from '../ai/stub-provider.ts';
import { extract } from '../ai/extraction.ts';
import type { AIProvider, StructuredResult } from '../ai/provider.ts';
import {
  acceptProposal,
  recordProposalOutcome,
  rejectProposal,
  runCapture,
  sequentialIdGen,
  type CaptureContext,
} from '../pipeline/index.ts';

const FIXED_NOW = '2026-06-29T00:00:00.000Z';

function ctx(sink?: InMemoryEvalSink): CaptureContext {
  return {
    provider: new DeterministicStubProvider(),
    spaceId: 'sp',
    referenceDate: '2026-06-29',
    timezone: 'UTC',
    idGen: sequentialIdGen('t'),
    now: () => FIXED_NOW,
    sink,
  };
}

test('confidenceStats handles empty and populated inputs', () => {
  assert.deepEqual(confidenceStats([]), { avgConfidence: null, minConfidence: null, lowConfidenceCount: 0 });
  const s = confidenceStats([0.9, 0.5, 0.3]);
  assert.equal(s.minConfidence, 0.3);
  assert.equal(s.lowConfidenceCount, 2); // < 0.6
});

test('records an extraction trace with provider/model/prompt/latency/confidence', async () => {
  const sink = new InMemoryEvalSink();
  await extract(
    new DeterministicStubProvider(),
    { parts: [{ kind: 'text', text: 'Study daily at 8' }] },
    { sink, traceId: 'tr1', now: () => FIXED_NOW, monotonicMs: (() => { let t = 0; return () => (t += 5); })() },
  );
  assert.equal(sink.extractions.length, 1);
  const trace = sink.extractions[0]!;
  assert.equal(trace.traceId, 'tr1');
  assert.equal(trace.provider, 'stub');
  assert.equal(trace.model, 'deterministic-stub-v1');
  assert.equal(trace.promptVersion, 'extract-v2');
  assert.equal(trace.latencyMs, 5);
  assert.equal(trace.validation.ok, true);
  assert.equal(trace.inputMethod, 'text');
  assert.ok(trace.avgConfidence !== null);
});

test('records a FAILED validation as signal, then rethrows', async () => {
  const sink = new InMemoryEvalSink();
  const badProvider: AIProvider = {
    name: 'bad',
    capabilities: new Set(['structured_output']),
    async generateStructured(): Promise<StructuredResult> {
      return { raw: { items: [{ tempId: 'x' }], ambiguities: [], warnings: [] }, meta: { provider: 'bad', model: 'm', promptVersion: 'extract-v1' } };
    },
  };
  await assert.rejects(() => extract(badProvider, { parts: [{ kind: 'text', text: 'x' }] }, { sink, now: () => FIXED_NOW }));
  assert.equal(sink.extractions.length, 1);
  assert.equal(sink.extractions[0]!.validation.ok, false);
  assert.ok(sink.extractions[0]!.validation.issueCount >= 1);
});

test('records proposal outcome: accepted', async () => {
  const sink = new InMemoryEvalSink();
  const { proposal } = await runCapture('Gym after work', ctx(sink));
  const accepted = acceptProposal(proposal);
  recordProposalOutcome(sink, accepted, { now: () => FIXED_NOW, edited: false });
  assert.equal(sink.outcomes.length, 1);
  assert.equal(sink.outcomes[0]!.outcome, 'accepted');
  assert.equal(sink.outcomes[0]!.traceId, proposal.traceId);
  assert.equal(sink.acceptanceRate(), 1);
});

test('records proposal outcome: rejected counts toward acceptance rate', async () => {
  const sink = new InMemoryEvalSink();
  const { proposal } = await runCapture('Read daily', ctx(sink));
  recordProposalOutcome(sink, rejectProposal(proposal), { now: () => FIXED_NOW });
  assert.equal(sink.outcomes[0]!.outcome, 'rejected');
  assert.equal(sink.acceptanceRate(), 0);
});

test('GUARANTEE: pipeline output is identical with and without a sink', async () => {
  const withSink = await runCapture('Work 9 to 6 weekdays. Gym after work.', ctx(new InMemoryEvalSink()));
  const noSink = await runCapture('Work 9 to 6 weekdays. Gym after work.', ctx(undefined));
  // strip the eval-only correlation id, which is identical anyway given same idGen
  assert.deepEqual(withSink.proposal.adjustments, noSink.proposal.adjustments);
  assert.deepEqual(withSink.proposal.conflicts, noSink.proposal.conflicts);
  assert.deepEqual(withSink.extraction, noSink.extraction);
});
