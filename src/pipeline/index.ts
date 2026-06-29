/**
 * Capture orchestration (TECH_SPEC §2). Wires the stages:
 *
 *   normalize -> extract (provider port) -> buildProposal
 *
 * The orchestrator depends on the AIProvider PORT only — it never references a
 * concrete provider. Swap the provider, the orchestration is unchanged. Commit
 * is a separate, explicit step (see commit.ts) gated on user acceptance.
 */

import type { AIProvider } from '../ai/provider.ts';
import type { IANATz, ISODate, UUID } from '../domain/types.ts';
import { extract } from '../ai/extraction.ts';
import type { ExtractionResult } from '../ai/types.ts';
import { normalize, type CaptureInput } from './capture.ts';
import { acceptedAdjustments, buildProposal, type BuildContext, type CandidateTask, type Proposal, type ProposalReason } from './proposal.ts';
import type { DiffableTask } from '../engine/dedup.ts';
import type { EvalSink } from '../eval/sink.ts';

export interface CaptureContext {
  provider: AIProvider;
  spaceId: UUID;
  referenceDate: ISODate;
  timezone: IANATz;
  reason?: ProposalReason;
  existing?: Array<DiffableTask & { candidate: CandidateTask }>;
  idGen: () => string;
  now: () => string;
  conflictWindowDays?: number;
  /** Optional observability sink (AI eval framework). Has no effect on logic. */
  sink?: EvalSink;
}

export interface CaptureRunResult {
  proposal: Proposal;
  extraction: ExtractionResult;
  meta: { provider: string; model: string; promptVersion: string };
}

/** Run a capture end-to-end up to (but not including) commit. A bare string is shorthand for a text capture. */
export async function runCapture(input: CaptureInput | string, ctx: CaptureContext): Promise<CaptureRunResult> {
  const captureInput: CaptureInput = typeof input === 'string' ? { method: 'text', text: input } : input;
  const doc = normalize(captureInput, { referenceDate: ctx.referenceDate, timezone: ctx.timezone });

  const traceId = ctx.idGen();
  const { result: extraction, meta } = await extract(
    ctx.provider,
    { parts: doc.parts },
    { sink: ctx.sink, traceId, inputMethod: doc.method, now: ctx.now },
  );

  const buildCtx: BuildContext = {
    spaceId: ctx.spaceId,
    reason: ctx.reason ?? 'initial_capture',
    referenceDate: doc.referenceDate,
    timezone: doc.timezone,
    existing: ctx.existing,
    idGen: ctx.idGen,
    now: ctx.now,
    conflictWindowDays: ctx.conflictWindowDays,
    traceId,
  };
  const proposal = buildProposal(extraction, buildCtx);

  return { proposal, extraction, meta };
}

export * from './capture.ts';
export * from './proposal.ts';
export * from './commit.ts';

/** Convenience: a deterministic incrementing id generator for tests/CI. */
export function sequentialIdGen(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

/**
 * Record the user's resolution of a proposal to the eval framework. Call AFTER
 * acceptProposal/rejectProposal. Pure observability — never gates anything.
 * `edited` should be true if the user modified any adjustment before accepting.
 */
export function recordProposalOutcome(
  sink: EvalSink,
  proposal: Proposal,
  opts: { edited?: boolean; now: () => string },
): void {
  if (proposal.status === 'proposed') return; // not yet resolved
  const totalCount = proposal.adjustments.length;
  const acceptedCount =
    proposal.status === 'rejected' ? 0 : proposal.status === 'accepted' ? totalCount : acceptedAdjustments(proposal).length;
  try {
    sink.recordOutcome({
      traceId: proposal.traceId,
      proposalId: proposal.id,
      at: opts.now(),
      outcome: proposal.status, // narrowed to accepted | partially_accepted | rejected
      acceptedCount,
      totalCount,
      edited: opts.edited ?? false,
    });
  } catch {
    /* observability is best-effort */
  }
}
