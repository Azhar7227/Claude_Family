/** Screen renderers. Pure-ish: each takes the store and returns a DOM node. */

import { h } from './dom.ts';
import type { AppStore } from './store.ts';
import type { Proposal, Adjustment } from '../pipeline/proposal.ts';
import { utcToLocalHHmm } from '../engine/time.ts';

export type Route = 'home' | 'today' | 'add' | 'routines' | 'settings' | 'notifications' | 'debug';

function hhmm(store: AppStore, iso: string): string {
  return utcToLocalHHmm(iso, store.settings.timezone);
}

// ---------- Onboarding ----------
export function onboarding(store: AppStore): HTMLElement {
  const ta = h('textarea', {
    class: 'big-input',
    rows: 5,
    placeholder: 'e.g. I work Mon–Fri 9 to 6. Wake at 5. Gym after work. Study Salesforce 1 hour daily. Pray at 5:10.',
  });
  return h('div', { class: 'screen onboarding' },
    h('h1', {}, 'Welcome to LifeFlow'),
    h('p', { class: 'muted' }, 'Describe your life in plain words. I’ll build a routine — you review before anything is saved.'),
    ta,
    h('button', { class: 'primary', onclick: () => store.capture({ method: 'text', text: ta.value }) }, 'Build my routine'),
    h('p', { class: 'muted small' }, 'Nothing is committed until you accept the proposal.'),
  );
}

// ---------- Proposal review ----------
export function proposalReview(store: AppStore, p: Proposal): HTMLElement {
  const checks = new Map<string, HTMLInputElement>();
  const adjEl = (a: Adjustment) => {
    const cb = h('input', { type: 'checkbox', checked: true });
    checks.set(a.targetRef, cb);
    const head = h('div', { class: 'adj-head' },
      cb,
      h('span', { class: `op op-${a.op}` }, a.op),
      h('span', { class: 'adj-title' }, describeAdjustment(store, a)),
      a.lowConfidence ? h('span', { class: 'badge warn' }, 'low confidence') : null,
    );
    const ex = a.explanation
      ? h('details', { class: 'explain' },
          h('summary', {}, 'Why?'),
          line('Why', a.explanation.why),
          listLine('Changed', a.explanation.whatChanged),
          listLine('Preserved', a.explanation.constraintsPreserved),
          a.explanation.alternatives.length
            ? h('div', { class: 'alts' }, h('b', {}, 'Alternatives considered:'),
                ...a.explanation.alternatives.map((alt) => h('div', { class: 'alt' }, `• ${alt.summary} — ${alt.rejectedBecause}`)))
            : null,
          line('Selected because', a.explanation.selectionReason),
        )
      : null;
    return h('div', { class: 'adj' }, head, ex);
  };

  const conflictEls = p.conflicts.map((c) => h('div', { class: 'conflict' }, `⚠ ${c.detail}`));
  const ambEls = p.ambiguities.map((a) => h('div', { class: 'amb' }, `❔ ${a.question}`));

  const accept = (refs?: string[]) => store.acceptPending(refs);
  const acceptSelected = () => {
    const refs = [...checks.entries()].filter(([, cb]) => cb.checked).map(([ref]) => ref);
    if (refs.length === 0) store.rejectPending();
    else if (store.pendingProposal === p && refs.length === p.adjustments.length) accept();
    else if (store.pendingProposal === p) accept(refs);
    else store.applyProposal(p, refs); // maintenance proposal path
  };

  const isCapture = store.pendingProposal === p && (p.reason === 'initial_capture' || p.reason === 'reimport');

  return h('div', { class: 'screen review' },
    h('h2', {}, isCapture ? 'Review your plan' : 'Suggested adjustment'),
    p.explanation ? h('div', { class: 'proposal-why' }, p.explanation.why) : null,
    p.adjustments.length === 0 ? h('p', { class: 'muted' }, 'No changes needed — everything fits.') : null,
    ...p.adjustments.map(adjEl),
    conflictEls.length ? h('div', { class: 'conflicts' }, ...conflictEls) : null,
    ambEls.length ? h('div', { class: 'ambs' }, ...ambEls) : null,
    h('div', { class: 'review-actions' },
      h('button', { class: 'primary', onclick: acceptSelected }, 'Accept selected'),
      h('button', { class: 'ghost', onclick: () => (store.pendingProposal === p ? store.rejectPending() : dismiss(store)) }, 'Dismiss'),
    ),
  );
}

function dismiss(store: AppStore): void {
  store.pendingProposal = null;
  // trigger a re-render via a no-op settings update
  store.updateSettings({});
}

function describeAdjustment(store: AppStore, a: Adjustment): string {
  if (a.op === 'add' && a.after) {
    const time = a.after.startTimeLocal ? ` at ${a.after.startTimeLocal}` : '';
    const rep = a.after.rrule ? ` · ${humanRRule(a.after.rrule)}` : '';
    return `${a.after.title}${time}${rep} (${a.after.type}/${a.after.category})`;
  }
  if (a.occurrenceChange) {
    const oc = a.occurrenceChange;
    if (a.op === 'skip') return `Skip — ${a.explanation?.whatChanged[0] ?? ''}`;
    return `${a.after?.title ?? 'Task'} → ${hhmm(store, oc.afterStart)}–${hhmm(store, oc.afterEnd)} (was ${hhmm(store, oc.beforeStart)})`;
  }
  return a.rationale;
}

// ---------- Home ----------
export function home(store: AppStore): HTMLElement {
  store.refreshMissed();
  const view = store.today();
  const missed = view.timeline.filter((e) => e.status === 'missed');

  const hero = view.current
    ? h('div', { class: 'hero now' },
        h('div', { class: 'hero-label' }, 'NOW'),
        h('div', { class: 'hero-title' }, view.current.title),
        h('div', { class: 'hero-time' }, `${hhmm(store, view.current.start)}–${hhmm(store, view.current.end)} · ${view.remainingMin} min left`),
        h('button', { class: 'primary big', onclick: () => store.complete(view.current!.occurrenceId) }, '✓ Complete'),
      )
    : view.next
      ? h('div', { class: 'hero next' },
          h('div', { class: 'hero-label' }, 'NEXT UP'),
          h('div', { class: 'hero-title' }, view.next.title),
          h('div', { class: 'hero-time' }, `starts ${hhmm(store, view.next.start)}`),
        )
      : h('div', { class: 'hero empty' }, h('div', { class: 'hero-title' }, 'Nothing scheduled'), h('p', { class: 'muted' }, 'Add something to your day.'));

  return h('div', { class: 'screen home' },
    h('div', { class: 'home-head' }, h('h2', {}, greeting()), h('span', { class: 'count' }, `${view.doneCount}/${view.totalCount} done`)),
    missed.length
      ? h('div', { class: 'banner', },
          h('span', {}, `⚡ ${missed.length} task${missed.length > 1 ? 's' : ''} slipped. Rebuild the rest of your day?`),
          h('button', { class: 'small-btn', onclick: () => store.rebuildDay() }, 'Rebuild'))
      : null,
    hero,
    view.next && view.current ? peek(store, 'Next', view.next) : null,
    view.after ? peek(store, 'After that', view.after) : null,
  );
}

function peek(store: AppStore, label: string, e: { title: string; start: string }): HTMLElement {
  return h('div', { class: 'peek' }, h('span', { class: 'peek-label' }, label), h('span', {}, `${hhmm(store, e.start)} · ${e.title}`));
}

// ---------- Today / timeline ----------
export function today(store: AppStore, dateLocal: string, setDate: (d: string) => void): HTMLElement {
  const entries = store.timelineFor(dateLocal);
  const rows = entries.map((e) =>
    h('div', { class: `tl-row status-${e.status}` },
      h('span', { class: 'tl-time' }, hhmm(store, e.start)),
      h('span', { class: `dot cat-${e.category}` }),
      h('span', { class: 'tl-title' }, e.title, e.type === 'fixed' ? h('span', { class: 'lock' }, ' 🔒') : null),
      h('span', { class: 'tl-status' }, e.status),
      e.status === 'planned' ? h('button', { class: 'tiny', onclick: () => store.complete(e.occurrenceId) }, '✓') : null,
      e.status === 'planned' ? h('button', { class: 'tiny ghost', onclick: () => store.skip(e.occurrenceId) }, 'skip') : null,
    ),
  );
  return h('div', { class: 'screen today' },
    h('div', { class: 'date-nav' },
      h('button', { class: 'tiny', onclick: () => setDate(shiftDate(dateLocal, -1)) }, '‹'),
      h('b', {}, dateLocal),
      h('button', { class: 'tiny', onclick: () => setDate(shiftDate(dateLocal, 1)) }, '›'),
    ),
    entries.length ? h('div', { class: 'timeline' }, ...rows) : h('p', { class: 'muted' }, 'Nothing scheduled this day.'),
  );
}

// ---------- Add ----------
export function add(store: AppStore): HTMLElement {
  let method: 'text' | 'ics' = 'text';
  const ta = h('textarea', { class: 'big-input', rows: 5, placeholder: 'Describe what to add, or paste .ics text…' });
  const methodLabel = h('span', { class: 'muted small' }, 'mode: text');
  return h('div', { class: 'screen add' },
    h('h2', {}, 'Add to your life'),
    h('div', { class: 'seg' },
      h('button', { class: 'seg-btn active', onclick: (ev: Event) => { method = 'text'; methodLabel.textContent = 'mode: text'; toggle(ev); } }, 'Text / Chat'),
      h('button', { class: 'seg-btn', onclick: (ev: Event) => { method = 'ics'; methodLabel.textContent = 'mode: .ics'; toggle(ev); } }, 'Paste .ics'),
    ),
    methodLabel,
    ta,
    h('button', { class: 'primary', onclick: () => {
      if (method === 'ics') store.capture({ method: 'ics', uploadId: 'paste', icsText: ta.value });
      else store.capture({ method: 'text', text: ta.value });
    } }, 'Create proposal'),
  );
}

function toggle(ev: Event): void {
  const btn = ev.currentTarget as HTMLElement;
  btn.parentElement?.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
}

// ---------- Routines editor ----------
export function routines(store: AppStore): HTMLElement {
  const tasks = store.tasks();
  if (!tasks.length) return h('div', { class: 'screen' }, h('p', { class: 'muted' }, 'No routines yet. Use Add to create some.'));
  const rows = tasks.map((t) => {
    const r = store.recurrenceFor(t.id);
    return h('div', { class: 'routine-row' },
      h('span', { class: `dot cat-${t.category}` }),
      h('div', { class: 'routine-main' },
        h('div', { class: 'routine-title' }, t.title, h('span', { class: 'tag' }, t.type)),
        h('div', { class: 'muted small' }, r ? `${r.startTimeLocal ?? 'any time'} · ${humanRRule(r.rrule)}` : 'one-off'),
      ),
      h('button', { class: 'tiny ghost', onclick: () => {
        const name = prompt('Rename task', t.title);
        if (name) store.renameTask(t.id, name);
      } }, 'rename'),
      h('button', { class: 'tiny danger', onclick: () => { if (confirm(`Delete "${t.title}"?`)) store.deleteTask(t.id); } }, 'delete'),
    );
  });
  return h('div', { class: 'screen routines' }, h('h2', {}, 'Routines'), ...rows);
}

// ---------- Settings ----------
export function settings(store: AppStore): HTMLElement {
  const s = store.settings;
  const offsets = h('input', { value: s.reminderOffsetsMin.join(', '), class: 'field' });
  const maxPerDay = h('input', { type: 'number', value: String(s.maxPerDay), class: 'field' });
  const batch = h('input', { type: 'number', value: String(s.batchWindowMin), class: 'field' });
  const dayEnd = h('input', { value: s.dayEndLocal, class: 'field' });
  return h('div', { class: 'screen settings' },
    h('h2', {}, 'Settings'),
    field('Timezone', h('span', { class: 'muted' }, s.timezone)),
    field('Reminder offsets (min before)', offsets),
    field('Max notifications / day', maxPerDay),
    field('Batch window (min)', batch),
    field('Day ends at (HH:mm)', dayEnd),
    h('button', { class: 'primary', onclick: () => store.updateSettings({
      reminderOffsetsMin: offsets.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)),
      maxPerDay: Number(maxPerDay.value) || 8,
      batchWindowMin: Number(batch.value) || 30,
      dayEndLocal: /^\d{1,2}:\d{2}$/.test(dayEnd.value) ? dayEnd.value : s.dayEndLocal,
    }) }, 'Save'),
    h('hr', {}),
    h('button', { class: 'danger', onclick: () => { if (confirm('Erase all data?')) store.reset(); } }, 'Reset all data'),
  );
}

// ---------- Notifications ----------
export function notifications(store: AppStore): HTMLElement {
  const plan = store.notificationPlan();
  const rows = plan.notifications.map((n) =>
    h('div', { class: `notif p-${n.priority}` },
      h('span', { class: 'notif-time' }, hhmm(store, n.fireAt)),
      h('span', { class: 'notif-body' }, n.items.map((i) => i.title).join(', '), n.batched ? h('span', { class: 'badge' }, 'batched') : null),
      h('span', { class: `badge ${n.priority === 'high' ? 'warn' : ''}` }, n.priority),
    ),
  );
  return h('div', { class: 'screen notifications' },
    h('h2', {}, 'Upcoming notifications'),
    h('p', { class: 'muted small' }, `Budget ${store.settings.maxPerDay}/day · batch ${store.settings.batchWindowMin}m. ${plan.suppressed.length} suppressed.`),
    rows.length ? h('div', { class: 'notif-list' }, ...rows) : h('p', { class: 'muted' }, 'No upcoming reminders.'),
  );
}

// ---------- Debug console ----------
export function debug(store: AppStore): HTMLElement {
  const trace = store.lastTrace;
  const stageEls = trace
    ? trace.stages.map((st) =>
        h('details', { class: `stage st-${st.status}`, open: st.status === 'error' },
          h('summary', {},
            h('span', { class: 'stage-name' }, st.name),
            h('span', { class: `badge ${st.status === 'ok' ? '' : 'warn'}` }, st.status),
            h('span', { class: 'muted small' }, `${st.durationMs}ms`),
            st.note ? h('span', { class: 'muted small note' }, ` · ${st.note}`) : null,
          ),
          h('pre', { class: 'json' }, safeJson(st.data)),
        ),
      )
    : [h('p', { class: 'muted' }, 'Run a capture to populate the pipeline trace.')];

  const rate = store.evalSink.acceptanceRate();
  return h('div', { class: 'screen debug' },
    h('h2', {}, 'Pipeline debug console'),
    h('p', { class: 'muted small' }, 'Input → Normalize → Extract+Validate → Proposal → Accept → Commit'),
    ...stageEls,
    h('h3', {}, 'AI eval'),
    h('div', { class: 'eval-summary' },
      `extractions: ${store.evalSink.extractions.length} · outcomes: ${store.evalSink.outcomes.length} · acceptance: ${rate === null ? 'n/a' : (rate * 100).toFixed(0) + '%'}`,
    ),
    h('details', {}, h('summary', {}, 'Eval traces JSON'), h('pre', { class: 'json' }, safeJson(store.evalSink.extractions))),
    h('h3', {}, 'Change ledger (undo source)'),
    h('details', {}, h('summary', {}, `${store.ledger().length} entries`), h('pre', { class: 'json' }, safeJson(store.ledger()))),
  );
}

// ---------- helpers ----------
function field(label: string, control: Node): HTMLElement {
  return h('label', { class: 'field-row' }, h('span', { class: 'field-label' }, label), control);
}
function line(label: string, value: string): HTMLElement {
  return h('div', { class: 'ex-line' }, h('b', {}, `${label}: `), value);
}
function listLine(label: string, items: string[]): HTMLElement | null {
  if (!items.length) return null;
  return h('div', { class: 'ex-line' }, h('b', {}, `${label}: `), items.join(' · '));
}
function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function greeting(): string {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
function shiftDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function humanRRule(rrule: string): string {
  if (/FREQ=DAILY/.test(rrule)) return 'daily';
  if (/BYDAY=MO,TU,WE,TH,FR/.test(rrule)) return 'weekdays';
  if (/FREQ=WEEKLY/.test(rrule)) {
    const m = /BYDAY=([A-Z,]+)/.exec(rrule);
    return m ? `weekly (${m[1]!.toLowerCase()})` : 'weekly';
  }
  if (/FREQ=MONTHLY/.test(rrule)) return 'monthly';
  return rrule;
}
