/**
 * Today read model + timeline (TECH_SPEC §6 GET /today, /timeline).
 *
 * Pure projection over occurrences + tasks. Answers the ONE home-screen
 * question — "what should I do right now?" — plus next / after / remaining.
 * No I/O, no LLM: this runs offline on-device in <1ms.
 */

import type { Category, OccStatus, Occurrence, Task, TaskType, UUID } from '../domain/types.ts';
import { utcToLocalDate } from '../engine/time.ts';

export interface TimelineEntry {
  occurrenceId: UUID;
  taskId: UUID;
  title: string;
  category: Category;
  type: TaskType;
  start: string; // UTC ISO
  end: string; // UTC ISO
  status: OccStatus;
}

export interface TodayView {
  /** The reference instant. */
  now: string;
  localDate: string;
  current?: TimelineEntry;
  next?: TimelineEntry;
  after?: TimelineEntry;
  /** Minutes left in the current item (0 if none active). */
  remainingMin: number;
  /** All of today's occurrences, chronological. */
  timeline: TimelineEntry[];
  /** Quick counts for the header ("4/7 done"). */
  doneCount: number;
  totalCount: number;
}

function join(occ: Occurrence, tasks: Map<UUID, Task>): TimelineEntry | undefined {
  const task = tasks.get(occ.taskId);
  if (!task) return undefined; // orphaned occurrence (e.g. task removed) — skip
  return {
    occurrenceId: occ.id,
    taskId: occ.taskId,
    title: task.title,
    category: task.category,
    type: task.type,
    start: occ.start,
    end: occ.end,
    status: occ.status,
  };
}

/** Build the home-screen view for the local day containing `nowIso` in `tz`. */
export function buildTodayView(
  occurrences: Occurrence[],
  tasks: Map<UUID, Task>,
  nowIso: string,
  tz: string,
): TodayView {
  const today = utcToLocalDate(nowIso, tz);
  const now = Date.parse(nowIso);

  const timeline = occurrences
    .filter((o) => utcToLocalDate(o.start, tz) === today)
    .map((o) => join(o, tasks))
    .filter((e): e is TimelineEntry => e !== undefined)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.occurrenceId.localeCompare(b.occurrenceId));

  // "Active" items are those not yet resolved (planned/missed); done/skipped are history.
  const active = timeline.filter((e) => e.status === 'planned' || e.status === 'missed');

  let current: TimelineEntry | undefined;
  let next: TimelineEntry | undefined;
  let after: TimelineEntry | undefined;

  for (const e of active) {
    const start = Date.parse(e.start);
    const end = Date.parse(e.end);
    if (start <= now && now < end) {
      current = e;
    } else if (start > now) {
      if (!next) next = e;
      else if (!after) after = e;
    }
  }
  // If nothing is active *right now*, the soonest upcoming becomes "next".
  if (!current && !next) {
    const upcoming = active.filter((e) => Date.parse(e.start) > now);
    next = upcoming[0];
    after = upcoming[1];
  } else if (current && !next) {
    const upcoming = active.filter((e) => Date.parse(e.start) > now);
    next = upcoming[0];
    after = upcoming[1];
  }

  const remainingMin = current ? Math.max(0, Math.round((Date.parse(current.end) - now) / 60_000)) : 0;
  const doneCount = timeline.filter((e) => e.status === 'done').length;

  return {
    now: nowIso,
    localDate: today,
    current,
    next,
    after,
    remainingMin,
    timeline,
    doneCount,
    totalCount: timeline.length,
  };
}

/** Timeline projection over an arbitrary local date range [fromIso, toIso]. */
export function buildTimeline(
  occurrences: Occurrence[],
  tasks: Map<UUID, Task>,
  fromIso: string,
  toIso: string,
): TimelineEntry[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  return occurrences
    .filter((o) => {
      const s = Date.parse(o.start);
      return s >= from && s <= to;
    })
    .map((o) => join(o, tasks))
    .filter((e): e is TimelineEntry => e !== undefined)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.occurrenceId.localeCompare(b.occurrenceId));
}
