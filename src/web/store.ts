/**
 * AppStore — the web app's single source of truth. It drives the REAL
 * deterministic pipeline (no UI mock), persists to localStorage (offline-first),
 * and records a per-stage PipelineTrace for the debug console.
 *
 * Provider is the deterministic stub by default; .ics uses the ics provider.
 * Swapping in a production AIProvider later changes only `providerFor()`.
 */

import type { CaptureSource, Occurrence, RecurrenceRule, Task, UUID } from '../domain/types.ts';
import { normalize, type CaptureInput } from '../pipeline/capture.ts';
import { extract } from '../ai/extraction.ts';
import {
  acceptProposal,
  buildProposal,
  rejectProposal,
  type Proposal,
} from '../pipeline/proposal.ts';
import { commit, InMemoryRepository, type LedgerEntry } from '../pipeline/commit.ts';
import { recordProposalOutcome } from '../pipeline/index.ts';
import { completeOccurrence, markMissed, skipOccurrence } from '../pipeline/occurrence-actions.ts';
import { DeterministicStubProvider } from '../ai/stub-provider.ts';
import { IcsExtractionProvider } from '../ai/ics-provider.ts';
import { InMemoryEvalSink, type ExtractionTrace } from '../eval/sink.ts';
import type { AIProvider } from '../ai/provider.ts';
import type { ExtractionResult } from '../ai/types.ts';
import { buildTodayView, buildTimeline, type TodayView, type TimelineEntry } from '../read/today.ts';
import { computeReminderFires, type RemindableOccurrence } from '../engine/reminders.ts';
import { planNotifications, type NotificationPlan } from '../engine/notifications.ts';
import { buildMaintenanceProposal, type MaintenanceTrigger, type ReplanItem } from '../maintenance/engine.ts';
import { utcToLocalDate } from '../engine/time.ts';

export interface Settings {
  timezone: string;
  reminderOffsetsMin: number[];
  maxPerDay: number;
  batchWindowMin: number;
  dayEndLocal: string;
  provider: 'stub';
}

export interface StageRecord {
  name: string;
  status: 'ok' | 'error' | 'skipped';
  durationMs: number;
  data: unknown;
  note?: string;
}

export interface PipelineTrace {
  startedAtIso: string;
  inputMethod: string;
  stages: StageRecord[];
}

const LS_KEY = 'lifeflow.v1';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.abs(hashString(String(performance.now()))).toString(36);
}
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const DEFAULT_SETTINGS: Settings = {
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  reminderOffsetsMin: [10, 0],
  maxPerDay: 8,
  batchWindowMin: 30,
  dayEndLocal: '22:00',
  provider: 'stub',
};

export class AppStore {
  repo = new InMemoryRepository();
  settings: Settings = { ...DEFAULT_SETTINGS };
  pendingProposal: Proposal | null = null;
  lastTrace: PipelineTrace | null = null;
  evalSink = new InMemoryEvalSink();
  onboarded = false;
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  providerFor(method: CaptureInput['method']): AIProvider {
    return method === 'ics' ? new IcsExtractionProvider() : new DeterministicStubProvider();
  }

  // ---- Capture pipeline (instrumented for the debug console) ----
  async capture(input: CaptureInput): Promise<void> {
    const trace: PipelineTrace = { startedAtIso: this.nowIso(), inputMethod: input.method, stages: [] };
    const tz = this.settings.timezone;
    const referenceDate = utcToLocalDate(this.nowIso(), tz);
    const idGen = uuid;

    const timed = async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
      const t0 = performance.now();
      try {
        const data = await fn();
        trace.stages.push({ name, status: 'ok', durationMs: round(performance.now() - t0), data });
        return data;
      } catch (err) {
        trace.stages.push({ name, status: 'error', durationMs: round(performance.now() - t0), data: String(err), note: 'threw' });
        throw err;
      }
    };

    try {
      trace.stages.push({ name: 'Input', status: 'ok', durationMs: 0, data: input });
      const doc = await timed('Normalize', () => normalize(input, { referenceDate, timezone: tz }));
      const provider = this.providerFor(input.method);
      const traceId = idGen();
      const extractOut = await timed('Extract + Validate', () =>
        extract(provider, { parts: doc.parts }, { sink: this.evalSink, traceId, inputMethod: doc.method, now: () => this.nowIso() }),
      );
      const extraction: ExtractionResult = extractOut.result;
      const proposal = await timed('Proposal', () =>
        buildProposal(extraction, {
          spaceId: 'me',
          reason: 'initial_capture',
          referenceDate: doc.referenceDate,
          timezone: tz,
          idGen,
          now: () => this.nowIso(),
          traceId,
        }),
      );
      // attach the validation/eval summary for the console
      const evalTrace = this.evalSink.extractions.find((e) => e.traceId === traceId);
      attachEvalSummary(trace, evalTrace);
      this.pendingProposal = proposal;
      this.lastTrace = trace;
    } catch {
      this.lastTrace = trace;
      this.pendingProposal = null;
    }
    this.emit();
  }

  acceptPending(refs?: string[], edited = false): void {
    if (!this.pendingProposal) return;
    const accepted = acceptProposal(this.pendingProposal, refs);
    const source: CaptureSource = { method: methodOf(this.lastTrace), capturedAt: this.nowIso() };
    const result = commit(accepted, this.repo, { source, idGen: uuid, now: () => this.nowIso(), materializeDays: 35 });
    recordProposalOutcome(this.evalSink, accepted, { now: () => this.nowIso(), edited });
    if (this.lastTrace) {
      this.lastTrace.stages.push({ name: 'Accept', status: 'ok', durationMs: 0, data: { acceptedRefs: accepted.acceptedRefs } });
      this.lastTrace.stages.push({ name: 'Commit', status: 'ok', durationMs: 0, data: result });
    }
    this.pendingProposal = null;
    this.onboarded = true;
    this.emit();
  }

  rejectPending(): void {
    if (!this.pendingProposal) return;
    recordProposalOutcome(this.evalSink, rejectProposal(this.pendingProposal), { now: () => this.nowIso() });
    this.pendingProposal = null;
    this.emit();
  }

  // ---- Daily experience ----
  today(): TodayView {
    return buildTodayView(this.repo.occurrences, this.repo.tasks, this.nowIso(), this.settings.timezone);
  }
  timelineFor(localDate: string): TimelineEntry[] {
    const from = `${localDate}T00:00:00.000Z`;
    const to = `${localDate}T23:59:59.999Z`;
    // widen by a day each side so tz offset never clips; today view filters precisely
    return buildTimeline(this.repo.occurrences, this.repo.tasks, shiftIso(from, -1), shiftIso(to, 1)).filter(
      (e) => utcToLocalDate(e.start, this.settings.timezone) === localDate,
    );
  }

  complete(occId: UUID): void {
    completeOccurrence(this.repo, occId, this.nowIso());
    this.emit();
  }
  skip(occId: UUID): Proposal | null {
    const occ = this.repo.getOccurrence(occId);
    skipOccurrence(this.repo, occId);
    const suggestion = occ ? this.suggest({ kind: 'skipped_task', occurrenceId: occId }) : null;
    if (suggestion) this.pendingProposal = suggestion; // surface for review
    this.emit();
    return suggestion;
  }

  /** Manual "rebuild my day" — recovers the first missed task and reflows. */
  rebuildDay(): Proposal | null {
    this.refreshMissed();
    const missed = this.repo.occurrences.find((o) => o.status === 'missed');
    const trigger: MaintenanceTrigger = missed
      ? { kind: 'missed_task', occurrenceId: missed.id }
      : { kind: 'changed_work_hours', detail: 'manual rebuild' };
    const suggestion = this.suggest(trigger);
    if (suggestion) this.pendingProposal = suggestion;
    this.emit();
    return suggestion;
  }
  refreshMissed(): UUID[] {
    return markMissed(this.repo, this.repo.occurrences, this.nowIso());
  }

  /** Run the maintenance engine for today's items; returns a Proposal (does not commit). */
  suggest(trigger: MaintenanceTrigger): Proposal | null {
    const tz = this.settings.timezone;
    const todayLocal = utcToLocalDate(this.nowIso(), tz);
    const items: ReplanItem[] = this.timelineFor(todayLocal).map((e) => ({
      occurrenceId: e.occurrenceId,
      taskId: e.taskId,
      title: e.title,
      type: e.type,
      category: e.category,
      priority: this.repo.getTask(e.taskId)?.priority ?? 3,
      start: e.start,
      end: e.end,
      status: e.status,
    }));
    const proposal = buildMaintenanceProposal(items, [], trigger, {
      spaceId: 'me',
      now: this.nowIso(),
      timezone: tz,
      dayEndLocal: this.settings.dayEndLocal,
      idGen: uuid,
      nowFn: () => this.nowIso(),
    });
    return proposal.adjustments.length ? proposal : null;
  }

  /** Accept a maintenance proposal (commits occurrence-level changes). */
  applyProposal(p: Proposal, refs?: string[]): void {
    const accepted = acceptProposal(p, refs);
    const source: CaptureSource = { method: 'text', capturedAt: this.nowIso() };
    commit(accepted, this.repo, { source, idGen: uuid, now: () => this.nowIso() });
    recordProposalOutcome(this.evalSink, accepted, { now: () => this.nowIso() });
    this.emit();
  }

  // ---- Routine editor ----
  tasks(): Task[] {
    return [...this.repo.tasks.values()];
  }
  recurrenceFor(taskId: UUID): RecurrenceRule | undefined {
    return this.repo.recurrences.get(taskId);
  }
  deleteTask(id: UUID): void {
    this.repo.removeTask(id);
    this.emit();
  }
  renameTask(id: UUID, title: string): void {
    this.repo.updateTask(id, { title });
    this.emit();
  }

  // ---- Notifications ----
  notificationPlan(): NotificationPlan {
    const now = Date.parse(this.nowIso());
    const horizon = new Date(now + 36 * 3600 * 1000).toISOString();
    const remindable: RemindableOccurrence[] = this.repo.occurrences
      .filter((o) => o.status === 'planned' && Date.parse(o.start) >= now)
      .map((o) => {
        const t = this.repo.getTask(o.taskId);
        return t ? { occurrenceId: o.id, taskId: o.taskId, title: t.title, category: t.category, type: t.type, start: o.start } : null;
      })
      .filter((x): x is RemindableOccurrence => x !== null);
    const fires = computeReminderFires(remindable, { defaultOffsetsMin: this.settings.reminderOffsetsMin }, this.nowIso(), horizon);
    return planNotifications(fires, { maxPerDay: this.settings.maxPerDay, batchWindowMin: this.settings.batchWindowMin });
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emit();
  }

  ledger(): LedgerEntry[] {
    return this.repo.ledger;
  }

  reset(): void {
    this.repo = new InMemoryRepository();
    this.pendingProposal = null;
    this.onboarded = false;
    this.emit();
  }

  // ---- Persistence ----
  private save(): void {
    if (typeof localStorage === 'undefined') return;
    const data = {
      onboarded: this.onboarded,
      settings: this.settings,
      tasks: [...this.repo.tasks.values()],
      recurrences: [...this.repo.recurrences.values()],
      occurrences: this.repo.occurrences,
      ledger: this.repo.ledger,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }
  private load(): void {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
      this.onboarded = Boolean(data.onboarded);
      const repo = new InMemoryRepository();
      for (const t of data.tasks ?? []) repo.addTask(t);
      for (const r of data.recurrences ?? []) repo.addRecurrence(r);
      repo.addOccurrences(data.occurrences ?? []);
      for (const l of data.ledger ?? []) repo.appendLedger(l);
      this.repo = repo;
    } catch {
      /* corrupt store -> start fresh */
    }
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function methodOf(trace: PipelineTrace | null): CaptureSource['method'] {
  return (trace?.inputMethod as CaptureSource['method']) ?? 'text';
}
function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}
function attachEvalSummary(trace: PipelineTrace, evalTrace: ExtractionTrace | undefined): void {
  if (!evalTrace) return;
  const stage = trace.stages.find((s) => s.name === 'Extract + Validate');
  if (stage) {
    stage.note = `validation ${evalTrace.validation.ok ? 'OK' : 'FAILED'} · avg conf ${fmt(evalTrace.avgConfidence)} · ${evalTrace.latencyMs}ms · ${evalTrace.provider}/${evalTrace.model}`;
  }
}
function fmt(n: number | null): string {
  return n === null ? 'n/a' : n.toFixed(2);
}

export type { TodayView, TimelineEntry, NotificationPlan, Proposal };
