/** Tiny dependency-free DOM helper. Enough to build the app without a framework. */

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && k !== 'list') (el as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

export interface SheetOptions {
  title: string;
  message?: string;
  input?: { value?: string; placeholder?: string };
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** In-app modal sheet replacing browser prompt()/confirm(). Resolves the input
 *  value (or '' when no input) on confirm, or null on cancel/backdrop. */
export function showSheet(opts: SheetOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val: string | null) => {
      if (done) return;
      done = true;
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 180);
      resolve(val);
    };
    const field = opts.input
      ? h('input', { class: 'field-input', value: opts.input.value ?? '', placeholder: opts.input.placeholder ?? '' })
      : null;
    const sheet = h('div', { class: 'sheet', onclick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'sheet-title' }, opts.title),
      opts.message ? h('p', { class: 'sheet-msg' }, opts.message) : null,
      field,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(null) }, opts.cancelText ?? 'Cancel'),
        h('button', { class: `btn ${opts.danger ? 'danger-solid' : 'primary'}`, onclick: () => finish(field ? field.value.trim() : '') }, opts.confirmText ?? 'Confirm'),
      ),
    );
    const overlay = h('div', { class: 'overlay', onclick: () => finish(null) }, sheet);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    if (field) { field.focus(); field.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') finish(field.value.trim()); }); }
  });
}
