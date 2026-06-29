/** App bootstrap: shell, router, bottom nav, error boundary, re-render loop. */

import { h, clear } from './dom.ts';
import { icon } from './icons.ts';
import { AppStore } from './store.ts';
import { ReminderNotifier } from './notify.ts';
import * as views from './views.ts';

const store = new AppStore();
store.notifier = new ReminderNotifier(() => store.notificationPlan());
if (store.notifier.granted()) store.notifier.start();
void store.checkAi(); // probe the AI proxy; re-renders when known

let route: views.Route = store.onboarded ? 'home' : 'add';
let todayDate = store.todayLocalDate();
let recoveryDismissed = false;
const root = document.getElementById('app')!;

function setRoute(r: views.Route): void {
  if (r === 'today') todayDate = store.todayLocalDate();
  route = r;
  render();
}

// Hidden developer console (kept out of the consumer surface): open with #debug.
window.addEventListener('hashchange', () => {
  if (location.hash === '#debug') setRoute('debug');
});
if (location.hash === '#debug') route = 'debug';

function content(): HTMLElement {
  if (store.pendingProposal) return views.proposalReview(store, store.pendingProposal);
  if (!store.onboarded && store.tasks().length === 0) return views.onboarding(store);
  switch (route) {
    case 'home': return views.home(store);
    case 'today': return views.today(store, todayDate, (d) => { todayDate = d; render(); });
    case 'add': return views.add(store);
    case 'routines': return views.routines(store);
    case 'notifications': return views.notifications(store);
    case 'settings': return views.settings(store);
    case 'debug': return views.debug(store);
  }
}

/** Error boundary: a thrown view never white-screens or risks data; always offers export. */
function safeContent(): HTMLElement {
  try {
    return content();
  } catch (err) {
    return h('div', { class: 'screen' },
      h('div', { class: 'card' },
        h('h2', {}, 'Something went wrong'),
        h('p', { class: 't2' }, 'Your data is safe. You can export a backup and reload.'),
        h('pre', { class: 'json' }, String(err instanceof Error ? err.stack ?? err.message : err)),
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn primary', onclick: () => exportBackup() }, 'Export backup'),
          h('button', { class: 'btn ghost', onclick: () => location.reload() }, 'Reload'),
        ),
      ),
    );
  }
}

function exportBackup(): void {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: store.downloadFilename() });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recoveryBanner(): HTMLElement | null {
  if (!store.recovery.recovered || recoveryDismissed) return null;
  return h('div', { class: 'recovery-banner' },
    icon('check', 18),
    h('span', {}, `Recovered your data from a ${store.recovery.source}.`),
    h('button', { class: 'x', onclick: () => { recoveryDismissed = true; render(); } }, '✕'),
  );
}

function appbar(): HTMLElement {
  const missed = store.onboarded ? store.today().timeline.filter((e) => e.status === 'missed').length : 0;
  return h('header', { class: 'appbar' },
    h('span', { class: 'brand' }, h('span', { class: 'spark' }, icon('sparkles', 20)), 'LifeFlow'),
    h('div', { class: 'appbar-actions' },
      h('button', { class: `icon-btn ${missed ? 'dot-badge' : ''}`, onclick: () => setRoute('notifications'), 'aria-label': 'Reminders' }, icon('bell', 22)),
      h('button', { class: 'icon-btn', onclick: () => setRoute('settings'), 'aria-label': 'Settings' }, icon('settings', 22)),
    ),
  );
}

function tabbar(): HTMLElement {
  const active = (r: views.Route) => (route === r && !store.pendingProposal ? 'active' : '');
  const tab = (r: views.Route, label: string, ic: string) =>
    h('button', { class: `tab ${active(r)}`, onclick: () => setRoute(r) }, icon(ic, 23), h('span', { class: 'tlabel' }, label));
  return h('nav', { class: 'tabbar' },
    tab('home', 'Home', 'home'),
    tab('today', 'Today', 'today'),
    h('button', { class: 'fab', onclick: () => setRoute('add'), 'aria-label': 'Add' }, icon('plus', 26)),
    tab('routines', 'Routines', 'routines'),
    tab('settings', 'You', 'settings'),
  );
}

function render(): void {
  try {
    clear(root);
    const banner = recoveryBanner();
    root.append(appbar(), h('main', { class: 'content' }, banner ?? '', safeContent()), tabbar());
  } catch (err) {
    // last-resort guard so the app never goes fully blank
    clear(root);
    root.append(h('div', { class: 'screen' }, h('div', { class: 'card' }, h('h2', {}, 'LifeFlow'), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload')), h('pre', { class: 'json' }, String(err))));
  }
}

store.subscribe(render);
render();
