/**
 * Durable storage — so a beta user never fears losing data.
 *
 * - Primary + backup keys: each save copies the previous good state to backup.
 * - Rolling snapshots: last N saves (throttled) for point-in-time recovery.
 * - Crash recovery on load: corrupt/missing primary falls back to backup, then
 *   the newest valid snapshot.
 * - File export/import for off-device backup.
 *
 * Storage backend is injected (KVStore) so it's unit-testable in Node and uses
 * localStorage in the browser.
 */

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadResult<T> {
  data: T | null;
  recovered: boolean;
  source: 'primary' | 'backup' | 'snapshot' | 'none';
}

interface Envelope {
  app: 'lifeflow';
  v: number;
  savedAt: string;
  data: unknown;
}

export interface DurableOptions {
  primaryKey?: string;
  backupKey?: string;
  snapshotKey?: string;
  maxSnapshots?: number;
  snapshotMinIntervalMs?: number;
  now?: () => number;
  schemaVersion?: number;
}

interface Snapshot {
  ts: string;
  json: string;
}

export class DurableStore {
  private kv: KVStore;
  private pk: string;
  private bk: string;
  private sk: string;
  private maxSnap: number;
  private snapInterval: number;
  private now: () => number;
  private version: number;

  constructor(kv: KVStore, opts: DurableOptions = {}) {
    this.kv = kv;
    this.pk = opts.primaryKey ?? 'lifeflow.v1';
    this.bk = opts.backupKey ?? 'lifeflow.v1.backup';
    this.sk = opts.snapshotKey ?? 'lifeflow.v1.snapshots';
    this.maxSnap = opts.maxSnapshots ?? 10;
    this.snapInterval = opts.snapshotMinIntervalMs ?? 30 * 60_000;
    this.now = opts.now ?? (() => Date.now());
    this.version = opts.schemaVersion ?? 1;
  }

  private envelope(data: unknown): string {
    const env: Envelope = { app: 'lifeflow', v: this.version, savedAt: new Date(this.now()).toISOString(), data };
    return JSON.stringify(env);
  }

  save(data: unknown): { ok: boolean; error?: string } {
    try {
      const json = this.envelope(data);
      const prev = this.kv.getItem(this.pk);
      this.kv.setItem(this.pk, json);
      if (prev && prev !== json) this.kv.setItem(this.bk, prev); // keep last good as backup
      this.maybeSnapshot(json);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  private maybeSnapshot(json: string): void {
    const snaps = this.readSnapshots();
    const last = snaps[snaps.length - 1];
    if (last && this.now() - Date.parse(last.ts) < this.snapInterval) return;
    snaps.push({ ts: new Date(this.now()).toISOString(), json });
    while (snaps.length > this.maxSnap) snaps.shift();
    try {
      this.kv.setItem(this.sk, JSON.stringify(snaps));
    } catch {
      /* snapshots are best-effort; never block a save */
    }
  }

  private readSnapshots(): Snapshot[] {
    try {
      const raw = this.kv.getItem(this.sk);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private parseEnvelope(raw: string | null): unknown {
    if (!raw) return undefined;
    try {
      const env = JSON.parse(raw) as Envelope;
      return env && typeof env === 'object' && 'data' in env ? env.data : undefined;
    } catch {
      return undefined;
    }
  }

  load<T>(): LoadResult<T> {
    const primary = this.parseEnvelope(this.kv.getItem(this.pk));
    if (primary !== undefined) return { data: primary as T, recovered: false, source: 'primary' };

    const backup = this.parseEnvelope(this.kv.getItem(this.bk));
    if (backup !== undefined) return { data: backup as T, recovered: true, source: 'backup' };

    const snaps = this.readSnapshots();
    for (let i = snaps.length - 1; i >= 0; i--) {
      const d = this.parseEnvelope(snaps[i]!.json);
      if (d !== undefined) return { data: d as T, recovered: true, source: 'snapshot' };
    }
    return { data: null, recovered: false, source: 'none' };
  }

  snapshotInfo(): Array<{ ts: string; bytes: number }> {
    return this.readSnapshots().map((s) => ({ ts: s.ts, bytes: s.json.length }));
  }

  lastSavedAt(): string | null {
    try {
      const raw = this.kv.getItem(this.pk);
      return raw ? (JSON.parse(raw) as Envelope).savedAt : null;
    } catch {
      return null;
    }
  }

  /** Pretty JSON for a downloadable backup file. */
  exportString(): string {
    const raw = this.kv.getItem(this.pk);
    if (raw) {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        /* fall through */
      }
    }
    return this.envelope(null);
  }

  /** Accept our envelope or a bare data object; validate before overwriting. */
  importString(json: string, validate?: (data: unknown) => boolean): { ok: boolean; error?: string } {
    let data: unknown;
    try {
      const parsed = JSON.parse(json);
      data = parsed && typeof parsed === 'object' && 'data' in (parsed as object) ? (parsed as Envelope).data : parsed;
    } catch {
      return { ok: false, error: 'file is not valid JSON' };
    }
    if (validate && !validate(data)) return { ok: false, error: 'file is not a LifeFlow backup' };
    return this.save(data);
  }
}
