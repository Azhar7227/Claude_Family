/**
 * Re-import reconciliation (TECH_SPEC §5). Diffs freshly extracted items
 * against existing tasks so a re-uploaded timetable becomes a set of
 * ADD/UPDATE/REMOVE *proposals* — never silent duplicates, never auto-delete.
 * This diff is what turns "import" into "maintain".
 */

import type { Category, TaskType } from '../domain/types.ts';

/** Minimal shape needed to match & diff; both existing tasks and extracted items map to this. */
export interface DiffableTask {
  refId: string; // existing Task id, or extracted tempId
  title: string;
  type: TaskType;
  category: Category;
  rrule?: string;
  startTimeLocal?: string;
}

export type DiffOp = 'add' | 'update' | 'remove' | 'noop';

export interface DiffEntry {
  op: DiffOp;
  existingRefId?: string;
  incomingRefId?: string;
  changedFields?: string[];
  detail: string;
}

/** Normalize a title for fuzzy matching: lowercase, strip punctuation, collapse spaces. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Signature used to decide whether two tasks are "the same task". */
function matchKey(t: DiffableTask): string {
  return `${normalizeTitle(t.title)}|${t.type}`;
}

function fieldsChanged(a: DiffableTask, b: DiffableTask): string[] {
  const changed: string[] = [];
  if ((a.rrule ?? '') !== (b.rrule ?? '')) changed.push('rrule');
  if ((a.startTimeLocal ?? '') !== (b.startTimeLocal ?? '')) changed.push('startTimeLocal');
  if (a.category !== b.category) changed.push('category');
  return changed;
}

/**
 * Reconcile incoming extracted items against the existing tasks that came from
 * the SAME source. `existing` should be pre-filtered to the relevant source so
 * we never propose removing tasks the user added by other means.
 */
export function reconcile(existing: DiffableTask[], incoming: DiffableTask[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const existingByKey = new Map<string, DiffableTask>();
  for (const e of existing) existingByKey.set(matchKey(e), e);

  const matchedExisting = new Set<string>();

  for (const inc of incoming) {
    const key = matchKey(inc);
    const match = existingByKey.get(key);
    if (!match) {
      entries.push({ op: 'add', incomingRefId: inc.refId, detail: `Add "${inc.title}".` });
      continue;
    }
    matchedExisting.add(key);
    const changed = fieldsChanged(match, inc);
    if (changed.length === 0) {
      entries.push({
        op: 'noop',
        existingRefId: match.refId,
        incomingRefId: inc.refId,
        detail: `"${inc.title}" unchanged.`,
      });
    } else {
      entries.push({
        op: 'update',
        existingRefId: match.refId,
        incomingRefId: inc.refId,
        changedFields: changed,
        detail: `Update "${inc.title}" (${changed.join(', ')}).`,
      });
    }
  }

  // existing-from-same-source items not present in the new import -> propose removal
  for (const e of existing) {
    if (!matchedExisting.has(matchKey(e))) {
      entries.push({
        op: 'remove',
        existingRefId: e.refId,
        detail: `"${e.title}" is no longer in the source — remove?`,
      });
    }
  }

  return entries;
}
