# LifeFlow — 30-Day Beta Readiness

> Objective changed: not "build features" but **"could I personally rely on
> LifeFlow every day for a month?"** This doc lists every blocker and the launch
> checklist. We fix only blockers.

## Can it replace each tool today? (honest)

| Tool you'd replace | Status | Gap |
|---|---|---|
| **Reminders** | ⚠️ partial | Reminders were only *computed*, never *fired*. Foreground notifications now added; background-when-closed needs push (Week 1). |
| **Calendar** | ✅ mostly | Reliable recurrence, Today/timeline, `.ics` import. Two-way Google sync is Month 1. |
| **Habit tracker** | ⚠️ partial | Daily recurring tasks + completion work; a dedicated streak surface is Month 1. |
| **Notes** | ❌ no | LifeFlow is not a notes app. **Keep your notes app for the beta** — out of scope, by design. |

## The blockers that stopped daily use (now addressed)

1. **Data could be lost.** localStorage is one browser away from gone (clear data, eviction, private mode). *Fear of loss kills trust instantly.* → durable storage with backup key + rolling snapshots + crash recovery + file export/import.
2. **A render crash white-screened the app** and risked the only copy of your data. → error boundary that never blocks, always offers "Export backup".
3. **Reminders didn't fire.** A reminder app that doesn't remind is useless. → foreground Notification scheduler.
4. **Capture quality was stub-level.** "Gym after work" mis-tagged, times missed → constant manual fixing. → production AI pipeline via a local proxy (keys stay server-side), with on-device stub fallback when offline.
5. **Developer/demo artifacts in the consumer surface.** "provider: stub" tag, a Developer-console menu row. → removed/gated.
6. **Browser `prompt()`/`confirm()` for editing.** Felt like an internal tool. → in-app modal.

## What is explicitly NOT a blocker (don't build now)

- Multi-device sync — a 30-day beta on one primary device is fine; export covers safety.
- Notes, dedicated habit streaks, analytics scores, family/couples, voice — all Month 1+.
- Background push notifications — real infra; Week 1, foreground covers the open-app case.

---

## Launch checklist

### ✅ Must have before Day 1 (done in this pass)
- [x] **Never lose data** — durable store: primary + backup keys, atomic-ish writes.
- [x] **Crash recovery** — corrupt/missing primary auto-recovers from backup → snapshot.
- [x] **Automatic backups** — rolling local snapshots (last 10, throttled).
- [x] **Export to file** — one-tap JSON download; **Import from file** to restore.
- [x] **Error boundary** — a thrown view shows a safe screen with Reload + Export, never wipes data.
- [x] **Real AI capture** — production pipeline via local proxy; stub fallback offline.
- [x] **Foreground reminders** — OS notifications fire while the app is open.
- [x] **Remove demo artifacts / placeholders** — no provider tag, no `prompt()/confirm()`, debug gated behind `#debug`.
- [x] **No fake/seed data** — app starts empty; you onboard with your real life.

### 🔧 Must fix during Week 1 (real usage will demand)
- [ ] **Background notifications** (Web Push + a tiny push server, or native wrapper) so reminders fire when the app is closed.
- [ ] **In-app time/recurrence editing** — adjust a task's time without re-describing it (currently rename only).
- [ ] **Reschedule UI** — drag or pick a new time on the timeline.
- [ ] **Reminder export to .ics** so your phone's native alarms can mirror them as a safety net.
- [ ] **"Backup reminder"** nudge if you haven't exported in N days.

### 🌱 Nice to have after Month 1
- [ ] Two-way Google/Apple Calendar sync.
- [ ] Multi-device sync (accounts + server).
- [ ] Dedicated habit streaks + health charts.
- [ ] Voice capture; image/OCR capture in-app (pipeline already supports it).
- [ ] Daily brief / night review.

---

## The daily-reliance test

Run your real life through it for 30 days. The bar: **at no point do you reach
for your old reminders/calendar because LifeFlow couldn't be trusted.** If you
do, that moment is the next blocker — log it, fix only that.
