/**
 * Duty Shooter's identity (ticket 07): system fonts only, a dark ink
 * palette with one signal colour (mint), and team colours that always come
 * with their mark. Shared by the menu and the HUD.
 */
const CSS = `
:root {
  --ds-ink: #0b0e13; --ds-panel: #12161d; --ds-raised: #1c222c;
  --ds-text: #f3f1ea; --ds-text-2: #b4bac5; --ds-text-3: #8e96a3;
  --ds-signal: #8fe3c8; --ds-alert: #ff6159; --ds-blue: #3d8bff; --ds-orange: #ff9a3c;
  --ds-line: rgb(243 241 234 / 0.12);
  --ds-font: Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}
.ds-ui { font-family: var(--ds-font); font-variant-numeric: tabular-nums; color: var(--ds-text); }
.ds-ui *, .ds-ui *::before, .ds-ui *::after { box-sizing: border-box; }
.ds-label { font-size: 12px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-title { font-weight: 700; font-stretch: condensed; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-t1 { color: var(--ds-blue); } .ds-t2 { color: var(--ds-orange); }
@keyframes ds-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ds-slide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  @keyframes ds-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-slide { from { opacity: 0; } to { opacity: 1; } }
}
`;

export function installTheme(): void {
  if (document.getElementById('ds-theme-css')) return;
  const style = document.createElement('style');
  style.id = 'ds-theme-css';
  style.textContent = CSS;
  document.head.append(style);
}

/** 24 px line icons, 1.6 px stroke, drawn inline. */
const PATHS: Readonly<Record<string, string>> = {
  online: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5M12 3.5C9.4 6.1 8.4 8.9 8.4 12s1 5.9 3.6 8.5"/>',
  range: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  town: '<path d="M3 20h18M5 20v-8l5-4 5 4v8M15 20v-6h4v6M9 20v-4h2v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  bots: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3"/><circle cx="12" cy="4" r="1"/>',
};

export function icon(name: keyof typeof PATHS | string): string {
  return `<svg class="ds-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
