/**
 * Proposal engine (TECH_SPEC §6) — the trust spine.
 *
 * Converts a validated ExtractionResult into a reviewable Proposal of
 * Adjustments. NOTHING here mutates live state. The AI never accepts its own
 * proposal: only acceptProposal() (an explicit user action) transitions status.
 */

import type { Category, IANATz, ISODate, TaskType, UUID } from '../domain/types.ts';
import type { Ambiguity, ExtractionResult, Goal, ProfileFact } from '../ai/types.ts';
import { CONFIDENCE_THRESHOLD } from '../ai/types.ts';
import { reconcile, type DiffableTask } from '../engine/dedup.ts';
import { detectConflicts, type Conflict, type PlacedItem } from '../engine/conflicts.ts';
import { expandOccurrences } from '../engine/recurrence.ts';
import { addDays, formatLocalDate, parseLocalDate } from '../engine/time.ts';
import type { Explanation } from '../explain/types.ts';

export type ProposalReason =
  | 'initial_capture'
  | 'reimport'
  | 'conflict'
  | 'user_request'
  | 'missed_task'
  | 'skipped_task'
  | 'rescheduled_task'
  | 'calendar_conflict'
  | 'changed_work_hours';
export type AdjustmentOp = 'add' | 'update' | 'move' | 'shorten' | 'remove' | 'skip';

/** Provider-agnostic candidate task carried inside an Adjustment (pre-commit). */
export interface CandidateTask {
  title: string;
  type: TaskType;
  category: Category;
  priority: 1 | 2 | 3 | 4 | 5;
  estDurationMin?: number;
  notes?: string;
  rrule?: string;
  dtStart: ISODate;
  startTimeLocal?: string;
  endTimeLocal?: string;
  timezone: IANATz;
  /** Never schedule over this (prayer, sleep, family dinner). */
  protected?: boolean;
}

/** Occurrence-level timing change carried by move/shorten/skip adjustments. */
export interface OccurrenceChange {
  occurrenceId: UUID;
  taskId: UUID;
  beforeStart: string; // ISO
  beforeEnd: string; // ISO
  afterStart: string; // ISO
  afterEnd: string; // ISO
}

export interface Adjustment {
  op: AdjustmentOp;
  /** tempId for 'add'; existing Task id for update/remove; occurrence id for move/shorten/skip. */
  targetRef: string;
  before?: CandidateTask;
  after?: CandidateTask;
  /** Present on move/shorten/skip (occurrence-level edits from the maintenance engine). */
  occurrenceChange?: OccurrenceChange;
  rationale: string;
  /** Per-adjustment explanation (the five questions). */
  explanation?: Explanation;
  /** Surfaced in the review UI; below-threshold items must be looked at. */
  lowConfidence?: boolean;
  changedFields?: string[];
}

export type ProposalStatus = 'proposed' | 'accepted' | 'partially_accepted' | 'rejected';

export interface Proposal {
  id: UUID;
  spaceId: UUID;
  reason: ProposalReason;
  adjustments: Adjustment[];
  conflicts: Conflict[];
  ambiguities: Ambiguity[];
  status: ProposalStatus;
  createdAt: string; // ISO
  /** When partially accepted, which adjustment targetRefs were accepted. */
  acceptedRefs?: string[];
  /** Correlates to the ExtractionTrace in the eval framework (observability only). */
  traceId?: string;
  /** Proposal-level explanation (rolls up the per-adjustment explanations). */
  explanation?: Explanation;
  /** Profile facts extracted from the same capture (acknowledged, NOT scheduled). */
  profileFacts?: ProfileFact[];
  /** Goals extracted from the same capture (planned later, NOT scheduled as tasks). */
  goals?: Goal[];
}

export interface BuildContext {
  spaceId: UUID;
  reason: ProposalReason;
  referenceDate: ISODate;
  timezone: IANATz;
  /** Existing tasks from the SAME source, for reimport reconciliation. */
  existing?: Array<DiffableTask & { candidate: CandidateTask }>;
  idGen: () => string;
  now: () => string;
  /** Days ahead to expand occurrences for proposal-time conflict detection. */
  conflictWindowDays?: number;
  /** Observability correlation id; carried onto the Proposal, no logic impact. */
  traceId?: string;
  /** Protected intervals from the EXISTING schedule, so new items over them are flagged. */
  protectedBlocks?: Array<{ label: string; start: string; end: string }>;
}

const DEFAULT_PRIORITY: CandidateTask['priority'] = 3;

/** Map a validated extraction into candidate tasks (defaults applied). */
function toCandidates(
  extraction: ExtractionResult,
  ctx: BuildContext,
): Array<{ tempId: string; candidate: CandidateTask; confidence: number }> {
  return extraction.items.map((item) => ({
    tempId: item.tempId,
    confidence: item.confidence,
    candidate: {
      title: item.title,
      type: item.type,
      category: item.category,
      priority: item.priorityHint ?? DEFAULT_PRIORITY,
      estDurationMin: item.durationMin,
      notes: item.notes,
      rrule: item.rrule,
      dtStart: item.dtStart ?? ctx.referenceDate,
      startTimeLocal: item.startTimeLocal,
      endTimeLocal: item.endTimeLocal,
      timezone: ctx.timezone,
      protected: item.protected,
    },
  }));
}

/** Expand candidates into placed occurrences for proposal-time conflict detection. */
function placeForConflicts(
  candidates: Array<{ tempId: string; candidate: CandidateTask }>,
  ctx: BuildContext,
): PlacedItem[] {
  const windowFrom = ctx.referenceDate;
  const windowTo = formatLocalDate(addDays(parseLocalDate(ctx.referenceDate), ctx.conflictWindowDays ?? 7));
  const placed: PlacedItem[] = [];
  for (const { tempId, candidate } of candidates) {
    const rrule = candidate.rrule ?? 'FREQ=DAILY;COUNT=1';
    const occ = expandOccurrences(
      {
        id: tempId,
        taskId: tempId,
        rrule,
        dtStart: candidate.dtStart,
        timezone: candidate.timezone,
        startTimeLocal: candidate.startTimeLocal,
        endTimeLocal: candidate.endTimeLocal,
      },
      windowFrom,
      windowTo,
    );
    // use the first occurrence as the representative for conflict purposes
    const first = occ[0];
    if (first) placed.push({ id: tempId, taskId: tempId, title: candidate.title, type: candidate.type, start: first.start, end: first.end });
  }
  return placed;
}

/** Build a Proposal from a validated extraction. Pure: mutates nothing live. */
export function buildProposal(extraction: ExtractionResult, ctx: BuildContext): Proposal {
  const candidates = toCandidates(extraction, ctx);
  let adjustments: Adjustment[];

  if (ctx.reason === 'reimport' && ctx.existing) {
    const incoming: DiffableTask[] = candidates.map((c) => ({
      refId: c.tempId,
      title: c.candidate.title,
      type: c.candidate.type,
      category: c.candidate.category,
      rrule: c.candidate.rrule,
      startTimeLocal: c.candidate.startTimeLocal,
    }));
    const candidateByRef = new Map(candidates.map((c) => [c.tempId, c]));
    const existingByRef = new Map(ctx.existing.map((e) => [e.refId, e]));
    const diff = reconcile(ctx.existing, incoming);
    adjustments = diff
      .filter((d) => d.op !== 'noop')
      .map((d) => {
        if (d.op === 'add') {
          const c = candidateByRef.get(d.incomingRefId!)!;
          return { op: 'add' as const, targetRef: d.incomingRefId!, after: c.candidate, rationale: d.detail, lowConfidence: c.confidence < CONFIDENCE_THRESHOLD };
        }
        if (d.op === 'update') {
          const c = candidateByRef.get(d.incomingRefId!)!;
          return { op: 'update' as const, targetRef: d.existingRefId!, before: existingByRef.get(d.existingRefId!)!.candidate, after: c.candidate, rationale: d.detail, changedFields: d.changedFields };
        }
        return { op: 'remove' as const, targetRef: d.existingRefId!, before: existingByRef.get(d.existingRefId!)!.candidate, rationale: d.detail };
      });
  } else {
    adjustments = candidates.map((c) => ({
      op: 'add' as const,
      targetRef: c.tempId,
      after: c.candidate,
      rationale: `Add "${c.candidate.title}".`,
      lowConfidence: c.confidence < CONFIDENCE_THRESHOLD,
    }));
  }

  // Conflict detection treats protected items (new or already scheduled) as
  // inviolable blocks: a non-protected item overlapping protected time is flagged.
  const placed = placeForConflicts(candidates, ctx);
  const protectedRefs = new Set(candidates.filter((c) => c.candidate.protected).map((c) => c.tempId));
  const placedItems = placed.filter((p) => !protectedRefs.has(p.id));
  const protectedFromCandidates = placed
    .filter((p) => protectedRefs.has(p.id))
    .map((p) => ({ id: p.id, label: p.title, start: p.start, end: p.end }));
  const existingProtected = (ctx.protectedBlocks ?? []).map((b, i) => ({ id: `ext${i}`, label: b.label, start: b.start, end: b.end }));
  const conflicts = detectConflicts(placedItems, { protectedBlocks: [...protectedFromCandidates, ...existingProtected] });

  return {
    id: ctx.idGen(),
    spaceId: ctx.spaceId,
    reason: ctx.reason,
    adjustments,
    conflicts,
    ambiguities: extraction.ambiguities,
    status: 'proposed',
    createdAt: ctx.now(),
    traceId: ctx.traceId,
    profileFacts: extraction.profile,
    goals: extraction.goals,
  };
}

export class ProposalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalStateError';
  }
}

/**
 * Explicit user acceptance. The ONLY path that moves a Proposal out of 'proposed'.
 * acceptRefs omitted => accept all; a subset => partially_accepted. Unknown refs throw.
 */
export function acceptProposal(proposal: Proposal, acceptRefs?: string[]): Proposal {
  if (proposal.status !== 'proposed') {
    throw new ProposalStateError(`cannot accept a proposal in status "${proposal.status}"`);
  }
  const allRefs = proposal.adjustments.map((a) => a.targetRef);
  const accepted = acceptRefs ?? allRefs;

  for (const ref of accepted) {
    if (!allRefs.includes(ref)) throw new ProposalStateError(`unknown adjustment ref: ${ref}`);
  }
  if (accepted.length === 0) throw new ProposalStateError('accept set is empty; use rejectProposal instead');

  return {
    ...proposal,
    status: accepted.length === allRefs.length ? 'accepted' : 'partially_accepted',
    acceptedRefs: accepted,
  };
}

export function rejectProposal(proposal: Proposal): Proposal {
  if (proposal.status !== 'proposed') {
    throw new ProposalStateError(`cannot reject a proposal in status "${proposal.status}"`);
  }
  return { ...proposal, status: 'rejected', acceptedRefs: [] };
}

/** The adjustments the user actually accepted (empty unless accepted/partially_accepted). */
export function acceptedAdjustments(proposal: Proposal): Adjustment[] {
  if (proposal.status !== 'accepted' && proposal.status !== 'partially_accepted') return [];
  const refs = new Set(proposal.acceptedRefs ?? []);
  return proposal.adjustments.filter((a) => refs.has(a.targetRef));
}
