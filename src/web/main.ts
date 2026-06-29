/** App bootstrap: router, tab bar, and the re-render loop. */

import { h, clear } from './dom.ts';
import { AppStore } from './store.ts';
import * as views from './views.ts';
import { utcToLocalDate } from '../engine/time.ts';

const store = new AppStore();
let route: views.Route = store.onboarded ? 'home' : 'add';
let todayDate = utcToLocalDate(new Date().toISOString(), store.settings.timezone);

const root = document.getElementById('app')!;

const TABS: Array<{ id: views.Route; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '◉' },
  { id: 'today', label: 'Today', icon: '☰' },
  { id: 'add', label: 'Add', icon: '＋' },
  { id: 'routines', label: 'Routines', icon: '⟳' },
  { id: 'notifications', label: 'Alerts', icon: '🔔' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'debug', label: 'Debug', icon: '⌗' },
];

function setRoute(r: views.Route): void {
  route = r;
  render();
}

function content(): HTMLElement {
  // A pending proposal always takes over the screen — review before anything commits.
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

function tabBar(): HTMLElement {
  return h('nav', { class: 'tabbar' },
    ...TABS.map((t) =>
      h('button', { class: `tab ${route === t.id && !store.pendingProposal ? 'active' : ''}`, onclick: () => setRoute(t.id) },
        h('span', { class: 'tab-icon' }, t.icon),
        h('span', { class: 'tab-label' }, t.label),
      ),
    ),
  );
}

function render(): void {
  clear(root);
  root.append(
    h('header', { class: 'appbar' }, h('span', { class: 'brand' }, 'LifeFlow'), h('span', { class: 'provider-tag' }, `provider: ${store.settings.provider}`)),
    h('main', { class: 'content' }, content()),
    tabBar(),
  );
}

store.subscribe(render);
render();
