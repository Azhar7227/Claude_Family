/** Inline stroke icons (24×24, currentColor). Lucide/SF-Symbols feel, no deps. */

const P: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  today: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  routines: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.7.7v.1a2 2 0 1 1-4 0v-.2a1 1 0 0 0-1.7-.6l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0-.6-1.7H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .6-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.7-.6V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 1.7.6l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0 .2 1.1Z"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sparkles: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4Z"/><path d="M18.5 14l.7 2 .8.7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  skip: '<path d="M5 5v14M19 5v14M9 12l8-6v12Z"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13h10l1-13"/>',
  flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  leaf: '<path d="M4 20c0-9 7-14 16-14 0 9-7 14-16 14Z"/><path d="M4 20c4-6 8-8 12-9"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  category: '<circle cx="12" cy="12" r="9"/>',
};

const CATEGORY_ICON: Record<string, string> = {
  work: 'flag', health: 'leaf', family: 'home', faith: 'moon',
  learning: 'sparkles', chore: 'check', social: 'bell', other: 'category',
};

export function icon(name: keyof typeof P | string, size = 22): HTMLElement {
  const span = document.createElement('span');
  span.className = 'icn';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? P.category}</svg>`;
  return span;
}

export function categoryIcon(category: string, size = 18): HTMLElement {
  return icon(CATEGORY_ICON[category] ?? 'category', size);
}
