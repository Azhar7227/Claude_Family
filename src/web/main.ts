/** App bootstrap: shell, router, bottom nav with center FAB, re-render loop. */

import { h, clear } from './dom.ts';
import { icon } from './icons.ts';
import { AppStore } from './store.ts';
import * as views from './views.ts';

const store = new AppStore();
let route: views.Route = store.onboarded ? 'home' : 'add';
let todayDate = store.todayLocalDate();
const root = document.getElementById('app')!;

function setRoute(r: views.Route): void {
  if (r === 'today') todayDate = store.todayLocalDate();
  route = r;
  render();
}

function content(): HTMLElement {
  if (store.pendingProposal) return views.proposalReview(store, store.pendingProposal);
  if (!store.onboarded && store.tasks().length === 0) return views.onboarding(store);
  switch (route) {
    case 'home': return views.home(store);
    case 'today': return views.today(store, todayDate, (d) => { todayDate = d; render(); });
    case 'add': return views.add(store);
    case 'routines': return views.routines(store);
    case 'notifications': return views.notifications(store);
    case 'settings': return views.settings(store, () => setRoute('debug'));
    case 'debug': return views.debug(store);
  }
}

function appbar(): HTMLElement {
  const missed = store.onboarded
    ? store.today().timeline.filter((e) => e.status === 'missed').length
    : 0;
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
  clear(root);
  root.append(appbar(), h('main', { class: 'content' }, content()), tabbar());
}

store.subscribe(render);
render();
