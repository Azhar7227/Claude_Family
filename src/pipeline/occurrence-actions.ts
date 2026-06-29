/**
 * Occurrence actions — the offline-first daily loop (TECH_SPEC §6).
 *
 * complete / skip / reschedule are deterministic, single-occurrence mutations
 * the client can perform offline and replay on sync. Each is idempotent on
 * status and records nothing the LLM needs. Reschedule preserves the original
 * start for the ledger / "why did this move?" UI.
 */

import type { ISO, Occurrence, UUID } from '../domain/types.ts';
import type { Repository } from './commit.ts';

export class OccurrenceNotFoundError extends Error {
  readonly occurrenceId: UUID;
  constructor(occurrenceId: UUID) {
    super(`occurrence not found: ${occurrenceId}`);
    this.name = 'OccurrenceNotFoundError';
    this.occurrenceId = occurrenceId;
  }
}

function require(repo: Repository, id: UUID): Occurrence {
  const occ = repo.getOccurrence(id);
  if (!occ) throw new OccurrenceNotFoundError(id);
  return occ;
}

export function completeOccurrence(repo: Repository, id: UUID, nowIso: ISO): Occurrence {
  const occ = require(repo, id);
  if (occ.status === 'done') return occ; // idempotent
  repo.updateOccurrence(id, { status: 'done', completedAt: nowIso });
  return repo.getOccurrence(id)!;
}

export function skipOccurrence(repo: Repository, id: UUID): Occurrence {
  const occ = require(repo, id);
  if (occ.status === 'skipped') return occ;
  repo.updateOccurrence(id, { status: 'skipped' });
  return repo.getOccurrence(id)!;
}

/** Move an occurrence to a new time, preserving the original start for the ledger. */
export function rescheduleOccurrence(repo: Repository, id: UUID, newStart: ISO, newEnd: ISO): Occurrence {
  const occ = require(repo, id);
  if (Date.parse(newEnd) <= Date.parse(newStart)) throw new Error('reschedule: end must be after start');
  repo.updateOccurrence(id, {
    start: newStart,
    end: newEnd,
    status: 'moved',
    originalStart: occ.originalStart ?? occ.start,
  });
  return repo.getOccurrence(id)!;
}

/** Mark still-planned occurrences whose end is before `nowIso` as missed (for re-plan triggers). */
export function markMissed(repo: Repository, occurrences: Occurrence[], nowIso: ISO): UUID[] {
  const now = Date.parse(nowIso);
  const missed: UUID[] = [];
  for (const occ of occurrences) {
    if (occ.status === 'planned' && Date.parse(occ.end) < now) {
      repo.updateOccurrence(occ.id, { status: 'missed' });
      missed.push(occ.id);
    }
  }
  return missed;
}
