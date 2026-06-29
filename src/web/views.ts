/** Premium screen renderers — calm, card-based, one-tap, progressive disclosure. */

import { h, showSheet } from './dom.ts';
import { icon, categoryIcon } from './icons.ts';
import type { AppStore } from './store.ts';
import type { Proposal, Adjustment } from '../pipeline/proposal.ts';
import { utcToLocalHHmm } from '../engine/time.ts';

export type Route = 'home' | 'today' | 'add' | 'routines' | 'settings' | 'notifications' | 'debug';

const hhmm = (store: AppStore, iso: string) => utcToLocalHHmm(iso, store.settings.timezone);
/** Human time for the timeline: midnight means "no time set" -> shown as a dash. */
const timeLabel = (store: AppStore, iso: string) => { const t = hhmm(store, iso); return t === '00:00' ? '—' : t; };

const EXAMPLES = ['Wake at 5', 'Gym after work', 'Study 1 hour daily', 'Pray at 5:10', 'Read 30 min', 'Sleep at 11'];

// ============================ Onboarding ============================
export function onboarding(store: AppStore): HTMLElement {
  const ta = h('textarea', { class: 'big-input', rows: 4, placeholder: 'I work Mon–Fri 9 to 6. Wake at 5. Gym after work. Study 1 hour daily.' });
  const addEx = (t: string) => { ta.value = (ta.value ? ta.value.trim() + '. ' : '') + t; ta.focus(); };
  return h('div', { class: 'screen' },
    h('div', { class: 'onb-hero' },
      h('div', { class: 'onb-mark' }, icon('sparkles', 30)),
      h('h1', {}, 'Tell me about your life'),
      h('p', { class: 't2' }, 'A sentence or two. I’ll build your routine — you approve before anything is saved.'),
    ),
    ta,
    h('div', { class: 'example-chips' }, ...EXAMPLES.map((e) => h('button', { class: 'chip', onclick: () => addEx(e) }, e))),
    h('button', { class: 'btn primary block lg', onclick: () => store.capture({ method: 'text', text: ta.value }) }, icon('sparkles', 20), 'Build my routine'),
  );
}

// ============================ Home ============================
export function home(store: AppStore): HTMLElement {
  store.refreshMissed();
  const v = store.today();
  const missed = v.timeline.filter((e) => e.status === 'missed').length;
  const pct = v.totalCount ? Math.round((v.doneCount / v.totalCount) * 100) : 0;

  const focus = v.current
    ? h('div', { class: 'focus-card now' },
        h('div', { class: 'eyebrow' }, h('span', { class: 'live-dot' }), 'Right now'),
        h('div', { class: 'focus-title' }, v.current.title),
        h('div', { class: 'focus-meta' }, icon('clock', 16), `${hhmm(store, v.current.start)} – ${hhmm(store, v.current.end)}`, h('span', { class: 'muted' }, `· ${v.remainingMin} min left`)),
        h('div', { class: 'focus-actions' },
          h('button', { class: 'btn primary', onclick: () => store.complete(v.current!.occurrenceId) }, h('span', { class: 'check-circle' }, icon('check', 15)), 'Complete'),
          h('button', { class: 'btn ghost', onclick: () => store.skip(v.current!.occurrenceId) }, 'Skip'),
        ),
      )
    : v.next
      ? h('div', { class: 'focus-card' },
          h('div', { class: 'eyebrow' }, 'Next up'),
          h('div', { class: 'focus-title' }, v.next.title),
          h('div', { class: 'focus-meta' }, icon('clock', 16), `Starts ${hhmm(store, v.next.start)}`),
        )
      : h('div', { class: 'focus-card' }, h('div', { class: 'empty-state' }, h('span', { class: 'glyph' }, icon('leaf', 34)), h('div', {}, 'Your day is clear'), h('p', { class: 'small muted' }, 'Tap ＋ to add something.')));

  const peeks: HTMLElement[] = [];
  if (v.current && v.next) peeks.push(peekRow(store, v.next));
  if (v.after) peeks.push(peekRow(store, v.after));

  return h('div', { class: 'screen' },
    h('div', { class: 'home-head' },
      h('div', {}, h('div', { class: 'home-date' }, friendlyToday()), h('h1', {}, greeting())),
      v.totalCount ? h('div', { class: 'ring', style: `--p:${pct}` }, h('span', {}, `${v.doneCount}/${v.totalCount}`)) : null,
    ),
    missed ? suggestionCard(store) : null,
    focus,
    peeks.length ? h('div', { class: 'peeks' }, ...peeks) : null,
  );
}

function peekRow(store: AppStore, e: { title: string; start: string; category: string }): HTMLElement {
  return h('div', { class: 'peek' },
    h('span', { class: 'time' }, timeLabel(store, e.start)),
    h('span', { class: 'cdot', style: `background:var(--cat-${e.category})` }),
    h('span', { class: 'ttl' }, e.title),
  );
}

/** Actionable suggestion — replaces the old warning banner. */
function suggestionCard(store: AppStore): HTMLElement {
  return h('div', { class: 'suggestion' },
    h('span', { class: 'si' }, icon('sparkles', 22)),
    h('div', { class: 'sbody' },
      h('div', { class: 'sttl' }, 'Running a little behind'),
      h('div', { class: 'ssub' }, 'I can reflow the rest of your day around what’s fixed.'),
    ),
    h('button', { class: 'btn primary', onclick: () => store.rebuildDay() }, 'Rebuild'),
  );
}

// ============================ Today / timeline ============================
export function today(store: AppStore, dateLocal: string, setDate: (d: string) => void): HTMLElement {
  const entries = store.timelineFor(dateLocal);
  const isToday = dateLocal === store.todayLocalDate();
  const now = Date.parse(store.nowIso());
  let dividerPlaced = false;

  const rows: HTMLElement[] = [];
  for (const e of entries) {
    if (isToday && !dividerPlaced && e.status === 'planned' && Date.parse(e.start) > now) {
      rows.push(h('div', { class: 'now-divider' }, 'NOW'));
      dividerPlaced = true;
    }
    const tick = h('button', { class: 'tl-tick', onclick: (ev: Event) => { ev.stopPropagation(); store.complete(e.occurrenceId); } }, e.status === 'done' ? icon('check', 16) : '');
    const actions = h('div', { class: 'row-actions' },
      h('button', { class: 'chip', onclick: (ev: Event) => { ev.stopPropagation(); store.complete(e.occurrenceId); } }, icon('check', 15), 'Done'),
      h('button', { class: 'chip', onclick: (ev: Event) => { ev.stopPropagation(); store.skip(e.occurrenceId); } }, icon('skip', 15), 'Skip'),
    );
    const row = h('div', { class: `tl-row ${e.status}` },
      h('span', { class: 'tl-time' }, timeLabel(store, e.start)),
      h('span', { class: 'tl-main' },
        h('span', { class: 'cdot', style: `background:var(--cat-${e.category})` }),
        h('span', { class: 'tl-title' }, e.title),
        e.type === 'fixed' ? h('span', { class: 'lock' }, icon('flag', 13)) : null,
      ),
      e.status === 'planned' || e.status === 'done' ? tick : h('span', {}),
      actions,
    );
    if (e.status === 'planned') row.addEventListener('click', () => row.classList.toggle('open'));
    rows.push(row);
  }

  return h('div', { class: 'screen' },
    h('div', { class: 'day-switch' },
      h('button', { class: 'icon-btn', onclick: () => setDate(shiftDate(dateLocal, -1)), style: 'transform:rotate(180deg)' }, icon('chevron', 22)),
      h('span', { class: 'label' }, isToday ? 'Today' : friendlyDate(dateLocal)),
      h('button', { class: 'icon-btn', onclick: () => setDate(shiftDate(dateLocal, 1)) }, icon('chevron', 22)),
    ),
    entries.length ? h('div', { class: 'timeline' }, ...rows) : emptyState('Nothing scheduled', 'Enjoy the open space — or add something.'),
  );
}

// ============================ Add ============================
export function add(store: AppStore): HTMLElement {
  let method: 'text' | 'ics' = 'text';
  const ta = h('textarea', { class: 'big-input', rows: 4, placeholder: 'Add anything: “Dentist Tuesday 3pm”, “Walk 20 min daily”…' });
  const chips = h('div', { class: 'example-chips' }, ...EXAMPLES.map((e) => h('button', { class: 'chip', onclick: () => { ta.value = (ta.value ? ta.value.trim() + '. ' : '') + e; } }, e)));
  const submit = () => method === 'ics' ? store.capture({ method: 'ics', uploadId: 'paste', icsText: ta.value }) : store.capture({ method: 'text', text: ta.value });
  return h('div', { class: 'screen' },
    h('h2', {}, 'Add to your life'),
    h('div', { class: 'seg' },
      h('button', { class: 'seg-btn active', onclick: (ev: Event) => { method = 'text'; ta.placeholder = 'Add anything in plain words…'; chips.style.display = 'flex'; segToggle(ev); } }, 'Describe'),
      h('button', { class: 'seg-btn', onclick: (ev: Event) => { method = 'ics'; ta.placeholder = 'Paste calendar (.ics) text…'; chips.style.display = 'none'; segToggle(ev); } }, 'Paste .ics'),
    ),
    ta,
    chips,
    h('button', { class: 'btn primary block lg', onclick: submit }, icon('sparkles', 20), 'Create proposal'),
  );
}

// ============================ Proposal review ============================
export function proposalReview(store: AppStore, p: Proposal): HTMLElement {
  const selected = new Set(p.adjustments.map((a) => a.targetRef));
  const isCapture = store.pendingProposal === p && (p.reason === 'initial_capture' || p.reason === 'reimport');

  const cardFor = (a: Adjustment) => {
    const tick = h('span', { class: 'tick-box' }, icon('check', 14));
    const card = h('div', { class: 'sugg-card selected' },
      h('div', { class: 'sugg-head' },
        h('span', { class: `op-pill op-${a.op}` }, icon(opIcon(a.op), 17)),
        h('div', { class: 'sugg-body' }, h('div', { class: 'sugg-title' }, adjTitle(store, a)), h('div', { class: 'sugg-sub' }, adjSub(store, a))),
        a.lowConfidence ? h('span', { class: 'pill-note' }, 'check this') : null,
        tick,
      ),
    );
    if (a.explanation) {
      const panel = h('div', { class: 'why-panel' },
        whyLine('Why', a.explanation.why),
        whyList('Kept', a.explanation.constraintsPreserved),
        ...a.explanation.alternatives.map((alt) => h('div', { class: 'alt' }, `• ${alt.summary} — ${alt.rejectedBecause}`)),
        a.explanation.selectionReason ? whyLine('Chosen', a.explanation.selectionReason) : null,
      );
      const toggle = h('button', { class: 'why-toggle', onclick: (ev: Event) => { ev.stopPropagation(); toggle.classList.toggle('open'); panel.classList.toggle('open'); } }, icon('chevron', 14), 'Why this?');
      card.append(toggle, panel);
    }
    card.addEventListener('click', () => {
      const on = card.classList.toggle('selected');
      if (on) selected.add(a.targetRef); else selected.delete(a.targetRef);
    });
    return card;
  };

  const apply = () => {
    const refs = [...selected];
    if (store.pendingProposal === p) { if (refs.length) store.acceptPending(refs.length === p.adjustments.length ? undefined : refs); else store.rejectPending(); }
    else if (refs.length) store.applyProposal(p, refs.length === p.adjustments.length ? undefined : refs);
    else dismiss(store);
  };

  return h('div', { class: 'screen' },
    h('h2', {}, isCapture ? 'Review your plan' : 'A suggestion'),
    !isCapture && p.explanation ? h('div', { class: 'proposal-why' }, h('span', { class: 'si' }, icon('sparkles', 20)), h('div', {}, p.explanation.why)) : null,
    p.adjustments.length === 0 ? emptyState('All good', 'Everything already fits.') : null,
    ...p.adjustments.map(cardFor),
    ...p.conflicts.map((c) => h('div', { class: 'proposal-why' }, h('span', { class: 'si' }, icon('clock', 18)), h('div', { class: 'small' }, c.detail))),
    p.adjustments.length
      ? h('div', { class: 'sticky-actions' },
          h('button', { class: 'btn primary', onclick: apply }, isCapture ? 'Add to my routine' : 'Accept'),
          h('button', { class: 'btn ghost', onclick: () => (store.pendingProposal === p ? store.rejectPending() : dismiss(store)) }, 'Not now'),
        )
      : h('button', { class: 'btn ghost block', onclick: () => dismiss(store) }, 'Close'),
  );
}

// ============================ Routines ============================
export function routines(store: AppStore): HTMLElement {
  const tasks = store.tasks();
  if (!tasks.length) return h('div', { class: 'screen' }, h('h2', {}, 'Routines'), emptyState('No routines yet', 'Use ＋ to create some.'));
  const byCat = new Map<string, typeof tasks>();
  for (const t of tasks) { const a = byCat.get(t.category) ?? []; a.push(t); byCat.set(t.category, a); }

  const groups: HTMLElement[] = [h('h2', {}, 'Routines')];
  for (const [cat, list] of byCat) {
    groups.push(h('h3', {}, cat));
    groups.push(h('div', { class: 'group' }, ...list.map((t) => {
      const r = store.recurrenceFor(t.id);
      return h('div', { class: 'list-row' },
        h('span', { class: 'lead', style: `color:var(--cat-${t.category})` }, categoryIcon(t.category, 18)),
        h('div', { class: 'lmain' },
          h('div', { class: 'ltitle' }, t.title, h('span', { class: 'tag' }, t.type)),
          h('div', { class: 'lsub' }, r ? `${r.startTimeLocal ?? 'anytime'} · ${humanRRule(r.rrule)}` : 'one-off'),
        ),
        h('button', { class: 'row-act', onclick: async () => { const n = await showSheet({ title: 'Rename task', input: { value: t.title }, confirmText: 'Save' }); if (n) store.renameTask(t.id, n); } }, icon('edit', 18)),
        h('button', { class: 'row-act danger', onclick: async () => { const r = await showSheet({ title: `Delete “${t.title}”?`, message: 'Removes the task and its upcoming occurrences.', confirmText: 'Delete', danger: true }); if (r !== null) store.deleteTask(t.id); } }, icon('trash', 18)),
      );
    })));
  }
  return h('div', { class: 'screen' }, ...groups);
}

// ============================ Settings ============================
export function settings(store: AppStore): HTMLElement {
  const s = store.settings;
  const OFFSETS = [0, 5, 10, 15, 30, 60];
  const offsetChips = h('div', { class: 'example-chips' }, ...OFFSETS.map((o) =>
    h('button', { class: `chip ${s.reminderOffsetsMin.includes(o) ? 'accent' : ''}`, onclick: () => {
      const set = new Set(s.reminderOffsetsMin);
      set.has(o) ? set.delete(o) : set.add(o);
      store.updateSettings({ reminderOffsetsMin: [...set].sort((a, b) => b - a) });
    } }, o === 0 ? 'on time' : `${o}m`)));

  const ai = store.aiStatus;
  const backup = store.backupInfo();
  const lastSaved = backup.lastSavedAt ? new Date(backup.lastSavedAt).toLocaleString() : 'never';
  const notifier = store.notifier;
  const notifGranted = notifier?.granted() ?? false;

  return h('div', { class: 'screen' },
    h('h2', {}, 'You'),

    h('h3', {}, 'Intelligence'),
    h('div', { class: 'group' },
      h('div', { class: 'list-row' },
        h('span', { class: 'lead', style: `color:${ai.online ? 'var(--ok)' : 'var(--muted)'}` }, icon('sparkles', 18)),
        h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, ai.online ? `AI connected · ${ai.provider}` : 'On-device parsing'), h('div', { class: 'lsub' }, ai.online ? 'Capture uses the production model' : 'Run the local server for full AI')),
        h('span', { class: `badge ${ai.online ? 'ok' : ''}` }, ai.online ? 'live' : 'offline'),
      ),
    ),

    h('h3', {}, 'Your day'),
    h('div', { class: 'group' },
      listRow('today', 'Time zone', s.timezone),
      listRowControl('moon', 'Day ends at', stepperTime(store, s.dayEndLocal)),
    ),

    h('h3', {}, 'Reminders'),
    h('div', { class: 'group' },
      notifier?.supported()
        ? rowButton(notifGranted ? 'check' : 'bell', notifGranted ? 'Notifications on' : 'Turn on notifications', async () => { await notifier!.enable(); store.updateSettings({}); }, false)
        : h('div', { class: 'list-row' }, h('span', { class: 'lead' }, icon('bell', 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, 'Notifications unsupported'))),
      h('div', { class: 'list-row' }, h('span', { class: 'lead' }, icon('clock', 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, 'Remind me before'), h('div', { class: 'lsub' }, 'minutes ahead of each task'))),
      h('div', { style: 'padding:0 16px 16px' }, offsetChips),
      listRowControl('bell', 'Max per day', stepper(store, 'maxPerDay', s.maxPerDay, 1, 30)),
      listRowControl('clock', 'Batch window', stepper(store, 'batchWindowMin', s.batchWindowMin, 0, 120, 5, 'm')),
    ),

    h('h3', {}, 'Backup & data'),
    h('div', { class: 'group' },
      h('div', { class: 'list-row' }, h('span', { class: 'lead' }, icon('check', 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, 'Auto-saved'), h('div', { class: 'lsub' }, `last save ${lastSaved} · ${backup.snapshots} restore points`))),
      rowButton('doc', 'Export backup file', () => downloadBackup(store)),
      rowButton('arrowRight', 'Import / restore', () => importBackup(store)),
      rowButton('trash', 'Reset all data', async () => { const r = await showSheet({ title: 'Erase everything?', message: 'Export a backup first if unsure. This cannot be undone.', confirmText: 'Erase', danger: true }); if (r !== null) store.reset(); }, true),
    ),
    h('p', { class: 'small muted', style: 'text-align:center' }, 'Tip: export a backup weekly so you never fear losing your routine.'),
  );
}

function downloadBackup(store: AppStore): void {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: store.downloadFilename() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackup(store: AppStore): void {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = store.importData(text);
    await showSheet({ title: res.ok ? 'Restored' : 'Could not import', message: res.ok ? 'Your routine has been restored from the backup.' : res.error ?? 'Unknown error', confirmText: 'OK' });
    input.remove();
  });
  document.body.append(input);
  input.click();
}

// ============================ Notifications ============================
export function notifications(store: AppStore): HTMLElement {
  const plan = store.notificationPlan();
  return h('div', { class: 'screen' },
    h('h2', {}, 'Reminders'),
    h('p', { class: 'small muted' }, `${store.settings.maxPerDay}/day budget · ${plan.suppressed.length} quieted to reduce noise`),
    plan.notifications.length
      ? h('div', { class: 'group' }, ...plan.notifications.map((n) =>
          h('div', { class: `list-row notif ${n.priority}` },
            h('span', { class: 'ntime' }, hhmm(store, n.fireAt)),
            h('span', { class: 'lead' }, icon('bell', 16)),
            h('div', { class: 'nbody' }, n.items.map((i) => i.title).join(', '), n.batched ? h('div', { class: 'nbatch' }, `+ ${n.items.length} together`) : null),
          )))
      : emptyState('All quiet', 'No reminders coming up.'),
  );
}

// ============================ Debug ============================
export function debug(store: AppStore): HTMLElement {
  const trace = store.lastTrace;
  const rate = store.evalSink.acceptanceRate();
  const lastLatency = store.evalSink.extractions.at(-1)?.latencyMs ?? 0;
  const stages = trace
    ? trace.stages.map((st) => h('details', { class: 'stage', open: st.status === 'error' },
        h('summary', {}, h('span', { class: 'sname' }, st.name), st.note ? h('span', { class: 'small muted' }, st.note) : null, h('span', { class: `badge ${st.status === 'ok' ? 'ok' : 'warn'}` }, `${st.status} · ${st.durationMs}ms`)),
        h('pre', { class: 'json' }, safeJson(st.data))))
    : [emptyState('No run yet', 'Capture something to populate the trace.')];

  return h('div', { class: 'screen' },
    h('h2', {}, 'Pipeline'),
    h('p', { class: 'small muted' }, 'Input → Normalize → Extract → Validate → Proposal → Accept → Commit'),
    h('div', { class: 'kpi' },
      kpi(String(store.evalSink.extractions.length), 'extractions'),
      kpi(rate === null ? '—' : `${Math.round(rate * 100)}%`, 'accepted'),
      kpi(`${lastLatency}ms`, 'last latency'),
    ),
    h('div', { class: 'group' }, ...stages),
    h('h3', {}, 'Eval traces'),
    h('div', { class: 'group' }, h('details', {}, h('summary', { style: 'padding:14px 16px' }, h('span', { class: 'sname' }, `${store.evalSink.extractions.length} records`)), h('pre', { class: 'json' }, safeJson(store.evalSink.extractions)))),
    h('h3', {}, 'Change ledger'),
    h('div', { class: 'group' }, h('details', {}, h('summary', { style: 'padding:14px 16px' }, h('span', { class: 'sname' }, `${store.ledger().length} entries`)), h('pre', { class: 'json' }, safeJson(store.ledger())))),
  );
}

// ============================ helpers ============================
function dismiss(store: AppStore): void { store.pendingProposal = null; store.updateSettings({}); }
function segToggle(ev: Event): void { const b = ev.currentTarget as HTMLElement; b.parentElement?.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active'); }
function opIcon(op: string): string { return op === 'add' ? 'plus' : op === 'remove' ? 'trash' : op === 'skip' ? 'skip' : 'routines'; }

function adjTitle(store: AppStore, a: Adjustment): string {
  if (a.op === 'add' && a.after) return a.after.title;
  if (a.occurrenceChange) return a.after?.title ?? a.explanation?.whatChanged[0] ?? a.rationale;
  return a.rationale;
}
function adjSub(store: AppStore, a: Adjustment): string {
  if (a.op === 'add' && a.after) {
    const time = a.after.startTimeLocal ? a.after.startTimeLocal : 'anytime';
    return `${time} · ${humanRRule(a.after.rrule ?? '')} · ${a.after.type}`;
  }
  if (a.occurrenceChange) {
    const oc = a.occurrenceChange;
    if (a.op === 'skip') return 'No free slot today — skip?';
    return `${hhmm(store, oc.beforeStart)} → ${hhmm(store, oc.afterStart)}`;
  }
  return '';
}
function whyLine(label: string, value: string): HTMLElement { return h('div', { class: 'why-line' }, h('b', {}, `${label}: `), value); }
function whyList(label: string, items: string[]): HTMLElement | null { return items.length ? whyLine(label, items.join(' · ')) : null; }

function listRow(ic: string, label: string, value: string): HTMLElement {
  return h('div', { class: 'list-row' }, h('span', { class: 'lead' }, icon(ic, 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, label)), h('span', { class: 'muted small' }, value));
}
function listRowControl(ic: string, label: string, control: Node): HTMLElement {
  return h('div', { class: 'list-row' }, h('span', { class: 'lead' }, icon(ic, 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle' }, label)), control);
}
function rowButton(ic: string, label: string, onclick: () => void, danger = false): HTMLElement {
  return h('div', { class: 'list-row', onclick, style: 'cursor:pointer' }, h('span', { class: `lead ${danger ? '' : ''}` }, icon(ic, 18)), h('div', { class: 'lmain' }, h('div', { class: 'ltitle', style: danger ? 'color:var(--danger)' : '' }, label)), icon('chevron', 18));
}
function stepper(store: AppStore, key: 'maxPerDay' | 'batchWindowMin', val: number, min: number, max: number, step = 1, suffix = ''): HTMLElement {
  const out = h('span', { class: 'val' }, `${val}${suffix}`);
  const set = (n: number) => { const c = Math.max(min, Math.min(max, n)); store.updateSettings({ [key]: c } as never); };
  return h('div', { class: 'stepper' }, h('button', { onclick: () => set(val - step) }, '−'), out, h('button', { onclick: () => set(val + step) }, '+'));
}
function stepperTime(store: AppStore, val: string): HTMLElement {
  const [hh] = val.split(':').map(Number);
  const out = h('span', { class: 'val' }, val);
  const set = (h2: number) => { const c = ((h2 % 24) + 24) % 24; store.updateSettings({ dayEndLocal: `${String(c).padStart(2, '0')}:00` }); };
  return h('div', { class: 'stepper' }, h('button', { onclick: () => set(hh! - 1) }, '−'), out, h('button', { onclick: () => set(hh! + 1) }, '+'));
}
function kpi(value: string, label: string): HTMLElement { return h('div', { class: 'k' }, h('div', { class: 'kv' }, value), h('div', { class: 'kl' }, label)); }
function emptyState(title: string, sub: string): HTMLElement { return h('div', { class: 'empty-state' }, h('span', { class: 'glyph' }, icon('leaf', 32)), h('div', { style: 'font-weight:600;color:var(--text-2)' }, title), h('p', { class: 'small' }, sub)); }
function safeJson(v: unknown): string { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

function greeting(): string { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }
function friendlyToday(): string { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
function friendlyDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function humanRRule(rrule: string): string {
  if (!rrule) return 'once';
  if (/FREQ=DAILY/.test(rrule)) return 'daily';
  if (/BYDAY=MO,TU,WE,TH,FR/.test(rrule)) return 'weekdays';
  if (/FREQ=WEEKLY/.test(rrule)) { const m = /BYDAY=([A-Z,]+)/.exec(rrule); return m ? `weekly · ${m[1]!.toLowerCase()}` : 'weekly'; }
  if (/FREQ=MONTHLY/.test(rrule)) return 'monthly';
  return 'repeats';
}
