/**
 * Foreground reminder notifier. Fires real OS notifications via the Notification
 * API while the app is open, driven by the deterministic notification plan.
 * De-dupes via a persisted set of fired ids.
 *
 * Honest scope: this covers the "app open / recently backgrounded" case. Firing
 * when the app is fully closed needs Web Push + a server (Week-1 item).
 */

import type { NotificationPlan } from '../engine/notifications.ts';

const FIRED_KEY = 'lifeflow.fired';
const WINDOW_MS = 5 * 60_000; // fire if due within the last 5 minutes

export class ReminderNotifier {
  private planFn: () => NotificationPlan;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(planFn: () => NotificationPlan) {
    this.planFn = planFn;
  }

  supported(): boolean {
    return typeof Notification !== 'undefined';
  }
  granted(): boolean {
    return this.supported() && Notification.permission === 'granted';
  }

  async enable(): Promise<boolean> {
    if (!this.supported()) return false;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      this.start();
      return true;
    }
    return false;
  }

  start(): void {
    if (this.timer || !this.granted()) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 30_000);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    if (!this.granted()) return;
    const now = Date.now();
    const fired = this.loadFired();
    let changed = false;
    for (const n of this.planFn().notifications) {
      const t = Date.parse(n.fireAt);
      const id = `${n.fireAt}|${n.items.map((i) => i.occurrenceId).join(',')}`;
      if (t <= now && t > now - WINDOW_MS && !fired.has(id)) {
        this.show(n.items.map((i) => i.title));
        fired.add(id);
        changed = true;
      }
    }
    if (changed) this.saveFired(fired);
  }

  private show(titles: string[]): void {
    const body = titles.length === 1 ? titles[0]! : `${titles.length} reminders: ${titles.join(', ')}`;
    try {
      new Notification('LifeFlow', { body, tag: 'lifeflow-reminder' });
    } catch {
      /* some browsers require a SW registration for Notification; ignore */
    }
  }

  private loadFired(): Set<string> {
    try {
      const raw = localStorage.getItem(FIRED_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(arr.slice(-500)); // bound growth
    } catch {
      return new Set();
    }
  }
  private saveFired(set: Set<string>): void {
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-500)));
    } catch {
      /* best-effort */
    }
  }
}
