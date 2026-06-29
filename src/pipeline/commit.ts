/**
 * Commit stage (TECH_SPEC §6) — the ONLY path that mutates live state.
 *
 * Applies the accepted adjustments of a Proposal through a Repository PORT
 * (so commit is DB-agnostic and testable with an in-memory impl), materializes
 * occurrences via the deterministic engine, and writes a ledger entry per
 * change for undo + the "why did this change?" UI.
 */

import type {
  CaptureSource,
  IANATz,
  ISODate,
  Occurrence,
  RecurrenceRule,
  Task,
  UUID,
} from '../domain/types.ts';
import { expandOccurrences } from '../engine/recurrence.ts';
import { addDays, formatLocalDate, parseLocalDate } from '../engine/time.ts';
import {
  acceptedAdjustments,
  ProposalStateError,
  type Adjustment,
  type CandidateTask,
  type Proposal,
} from './proposal.ts';

export interface LedgerEntry {
  id: UUID;
  proposalId: UUID;
  op: Adjustment['op'];
  taskId: UUID;
  before?: CandidateTask;
  after?: CandidateTask;
  at: string; // ISO
}

/** Persistence PORT. A real adapter wraps Postgres; tests use InMemoryRepository. */
export interface Repository {
  addTask(task: Task): void;
  addRecurrence(rule: RecurrenceRule): void;
  addOccurrences(occ: Occurrence[]): void;
  getTask(id: UUID): Task | undefined;
  updateTask(id: UUID, patch: Partial<Task>): void;
  updateRecurrenceByTask(taskId: UUID, patch: Partial<RecurrenceRule>): void;
  removeTask(id: UUID): void;
  appendLedger(entry: LedgerEntry): void;
}

export interface CommitContext {
  source: CaptureSource;
  idGen: () => string;
  now: () => string;
  /** How far ahead to materialize occurrences at commit time. */
  materializeDays?: number;
}

export interface CommitResult {
  proposalId: UUID;
  createdTaskIds: UUID[];
  updatedTaskIds: UUID[];
  removedTaskIds: UUID[];
  ledgerEntryIds: UUID[];
}

function materialize(
  taskId: UUID,
  spaceId: UUID,
  candidate: CandidateTask,
  referenceDate: ISODate,
  timezone: IANATz,
  days: number,
  idGen: () => string,
): { rule?: RecurrenceRule; occurrences: Occurrence[] } {
  const rrule = candidate.rrule ?? 'FREQ=DAILY;COUNT=1';
  const rule: RecurrenceRule = {
    id: idGen(),
    taskId,
    rrule,
    dtStart: candidate.dtStart,
    timezone,
    startTimeLocal: candidate.startTimeLocal,
    endTimeLocal: candidate.endTimeLocal,
  };
  const windowTo = formatLocalDate(addDays(parseLocalDate(referenceDate), days));
  const expanded = expandOccurrences(rule, referenceDate, windowTo);
  const occurrences: Occurrence[] = expanded.map((o) => ({
    id: idGen(),
    taskId,
    spaceId,
    start: o.start,
    end: o.end,
    status: 'planned',
  }));
  return { rule, occurrences };
}

/**
 * Commit an accepted Proposal. Throws if the proposal was not explicitly
 * accepted — enforcing "no silent commit" at the only mutation boundary.
 */
export function commit(proposal: Proposal, repo: Repository, ctx: CommitContext): CommitResult {
  if (proposal.status !== 'accepted' && proposal.status !== 'partially_accepted') {
    throw new ProposalStateError(`cannot commit a proposal in status "${proposal.status}"`);
  }

  const result: CommitResult = {
    proposalId: proposal.id,
    createdTaskIds: [],
    updatedTaskIds: [],
    removedTaskIds: [],
    ledgerEntryIds: [],
  };

  const materializeDays = ctx.materializeDays ?? 28;

  for (const adj of acceptedAdjustments(proposal)) {
    if (adj.op === 'add') {
      const candidate = adj.after!;
      const taskId = ctx.idGen();
      const task: Task = {
        id: taskId,
        spaceId: proposal.spaceId,
        title: candidate.title,
        type: candidate.type,
        category: candidate.category,
        priority: candidate.priority,
        estDurationMin: candidate.estDurationMin,
        notes: candidate.notes,
        source: ctx.source,
      };
      repo.addTask(task);
      const { rule, occurrences } = materialize(
        taskId,
        proposal.spaceId,
        candidate,
        candidate.dtStart,
        candidate.timezone,
        materializeDays,
        ctx.idGen,
      );
      if (rule) repo.addRecurrence(rule);
      if (occurrences.length) repo.addOccurrences(occurrences);
      result.createdTaskIds.push(taskId);
      result.ledgerEntryIds.push(appendLedger(repo, ctx, proposal.id, 'add', taskId, undefined, candidate));
    } else if (adj.op === 'update') {
      const taskId = adj.targetRef;
      const after = adj.after!;
      repo.updateTask(taskId, {
        title: after.title,
        type: after.type,
        category: after.category,
        priority: after.priority,
      });
      repo.updateRecurrenceByTask(taskId, {
        rrule: after.rrule,
        startTimeLocal: after.startTimeLocal,
        endTimeLocal: after.endTimeLocal,
      });
      result.updatedTaskIds.push(taskId);
      result.ledgerEntryIds.push(appendLedger(repo, ctx, proposal.id, 'update', taskId, adj.before, after));
    } else if (adj.op === 'remove') {
      const taskId = adj.targetRef;
      repo.removeTask(taskId);
      result.removedTaskIds.push(taskId);
      result.ledgerEntryIds.push(appendLedger(repo, ctx, proposal.id, 'remove', taskId, adj.before, undefined));
    }
    // 'move' / 'shorten' are occurrence-level edits handled by the maintenance loop (later slice).
  }

  return result;
}

function appendLedger(
  repo: Repository,
  ctx: CommitContext,
  proposalId: UUID,
  op: Adjustment['op'],
  taskId: UUID,
  before: CandidateTask | undefined,
  after: CandidateTask | undefined,
): UUID {
  const id = ctx.idGen();
  repo.appendLedger({ id, proposalId, op, taskId, before, after, at: ctx.now() });
  return id;
}

/** Minimal in-memory Repository for tests, CI, and local demos. */
export class InMemoryRepository implements Repository {
  readonly tasks = new Map<UUID, Task>();
  readonly recurrences = new Map<UUID, RecurrenceRule>(); // keyed by taskId
  readonly occurrences: Occurrence[] = [];
  readonly ledger: LedgerEntry[] = [];

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }
  addRecurrence(rule: RecurrenceRule): void {
    this.recurrences.set(rule.taskId, rule);
  }
  addOccurrences(occ: Occurrence[]): void {
    this.occurrences.push(...occ);
  }
  getTask(id: UUID): Task | undefined {
    return this.tasks.get(id);
  }
  updateTask(id: UUID, patch: Partial<Task>): void {
    const t = this.tasks.get(id);
    if (t) this.tasks.set(id, { ...t, ...patch });
  }
  updateRecurrenceByTask(taskId: UUID, patch: Partial<RecurrenceRule>): void {
    const r = this.recurrences.get(taskId);
    if (r) this.recurrences.set(taskId, { ...r, ...patch });
  }
  removeTask(id: UUID): void {
    this.tasks.delete(id);
    this.recurrences.delete(id);
    for (let i = this.occurrences.length - 1; i >= 0; i--) {
      if (this.occurrences[i]!.taskId === id) this.occurrences.splice(i, 1);
    }
  }
  appendLedger(entry: LedgerEntry): void {
    this.ledger.push(entry);
  }
}
