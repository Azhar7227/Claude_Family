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
import { buildProposal, type BuildContext, type CandidateTask, type Proposal, type ProposalReason } from './proposal.ts';
import type { DiffableTask } from '../engine/dedup.ts';

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

  const { result: extraction, meta } = await extract(ctx.provider, { parts: doc.parts });

  const buildCtx: BuildContext = {
    spaceId: ctx.spaceId,
    reason: ctx.reason ?? 'initial_capture',
    referenceDate: doc.referenceDate,
    timezone: doc.timezone,
    existing: ctx.existing,
    idGen: ctx.idGen,
    now: ctx.now,
    conflictWindowDays: ctx.conflictWindowDays,
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
