/**
 * Duty Shooter's identity (ticket 07): system fonts only, a dark ink
 * palette with one signal colour (mint), and team colours that always come
 * with their mark. Shared by the menu, the lobby and the HUD.
 *
 * The page shell, buttons, segmented pickers and key hints live here so the
 * menu screens and the lobby are one design. Everything is cheap to draw over
 * the live map: no backdrop blur, and transitions on transform, opacity and
 * colour only.
 */
const CSS = `
:root {
  --ds-ink: #0b0e13; --ds-panel: #12161d; --ds-raised: #1c222c; --ds-raised-2: #252c38;
  --ds-text: #f3f1ea; --ds-text-2: #b4bac5; --ds-text-3: #8e96a3;
  --ds-signal: #8fe3c8; --ds-signal-hi: #b4f0dc; --ds-signal-ink: #062118; --ds-signal-dim: rgb(143 227 200 / 0.14);
  --ds-alert: #ff6159; --ds-blue: #3d8bff; --ds-orange: #ff9a3c; --ds-gold: #f2c230;
  --ds-good: #7fdc6a; --ds-fair: #f2c230; --ds-poor: #ff5d52;
  --ds-line: rgb(243 241 234 / 0.12); --ds-line-2: rgb(243 241 234 / 0.22);
  --ds-glass: rgb(14 18 24 / 0.84); --ds-scrim: rgb(7 9 13 / 0.9);
  --ds-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --ds-font: Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}
.ds-ui { font-family: var(--ds-font); font-variant-numeric: tabular-nums; color: var(--ds-text); -webkit-font-smoothing: antialiased; }
.ds-ui *, .ds-ui *::before, .ds-ui *::after { box-sizing: border-box; }
.ds-ui button { font: inherit; color: inherit; cursor: pointer; }
.ds-ui button:disabled { cursor: default; }
.ds-label { font-size: 12px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-title { font-weight: 700; font-stretch: condensed; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-t1 { color: var(--ds-blue); } .ds-t2 { color: var(--ds-orange); }

/* The page shell: a header with the breadcrumb and title, a body that scrolls on its own, and a footer that always shows the actions. */
.ds-page { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto;
  background: linear-gradient(90deg, rgb(7 9 13 / 0.94) 0%, rgb(7 9 13 / 0.8) 55%, rgb(7 9 13 / 0.9) 100%); }
.ds-page > header { display: flex; align-items: flex-end; gap: 24px; padding: 28px 56px 18px; border-bottom: 1px solid var(--ds-line); }
.ds-page > header .heading { flex: 1; min-width: 0; }
.ds-crumb { display: flex; align-items: center; gap: 10px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-crumb::before { content: ''; width: 18px; height: 2px; background: var(--ds-signal); }
.ds-page > header h1 { margin: 6px 0 0; font-size: 46px; line-height: 0.95; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds-page > header .aside { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-bottom: 4px; }
.ds-page > .body { overflow-y: auto; overscroll-behavior: contain; padding: 28px 56px 32px; scrollbar-width: thin; scrollbar-color: var(--ds-line-2) transparent; }
.ds-page > footer { display: flex; align-items: center; gap: 12px; padding: 14px 56px; background: rgb(7 9 13 / 0.72); border-top: 1px solid var(--ds-line); }
.ds-page > footer .grow { flex: 1; min-width: 0; }
.ds-chip { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border: 1px solid var(--ds-line); background: rgb(243 241 234 / 0.04); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-text-2); white-space: nowrap; }
.ds-chip b { color: var(--ds-text); font-weight: 700; }
.ds-h2 { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 2px solid var(--ds-line);
  font-size: 18px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.ds-h2 small { font-size: 13px; font-weight: 400; letter-spacing: 0.1em; color: var(--ds-text-3); }

/* Buttons: a quiet frame, the primary in signal, the big call to action in the footer. */
.ds-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 0 22px; border: 1px solid var(--ds-line-2); border-radius: 2px;
  background: rgb(243 241 234 / 0.05); font-size: 14px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap;
  transition: background-color 120ms, border-color 120ms, color 120ms, transform 120ms var(--ds-ease); }
.ds-btn:not(:disabled):hover, .ds-btn:focus-visible, .ds-btn[data-pad-focus] { border-color: var(--ds-signal); background: var(--ds-signal-dim); outline: none; }
.ds-btn:not(:disabled):active { transform: translateY(1px); }
/* The pressed button's top edge stays under the pointer, so a press there still clicks. */
.ds-btn:not(:disabled):active::after { content: ''; position: absolute; inset: -2px 0 0; }
.ds-btn.primary { background: var(--ds-signal); border-color: var(--ds-signal); color: var(--ds-signal-ink); }
.ds-btn.primary:not(:disabled):hover, .ds-btn.primary:focus-visible, .ds-btn.primary[data-pad-focus] { background: var(--ds-signal-hi); border-color: var(--ds-signal-hi); box-shadow: 0 0 0 2px var(--ds-ink), 0 0 0 4px var(--ds-signal); }
.ds-btn.big { min-height: 58px; min-width: 260px; padding: 0 36px; font-size: 24px; letter-spacing: 0.16em; }
.ds-btn:disabled { opacity: 0.5; }
.ds-btn.primary:disabled { opacity: 1; background: var(--ds-signal-dim); border-color: rgb(143 227 200 / 0.35); color: rgb(143 227 200 / 0.85); font-size: 16px; }
.ds-btn .ds-icon { width: 20px; height: 20px; }

/* A segmented picker: one choice lit. */
.ds-seg { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
.ds-seg button { min-height: 40px; padding: 8px 6px; border: 0; background: rgb(11 14 19 / 0.92); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ds-text-2); transition: background-color 100ms, color 100ms; }
.ds-seg button.on { background: var(--ds-text); color: var(--ds-ink); }
.ds-seg button:not(:disabled):not(.on):hover { background: var(--ds-raised-2); color: var(--ds-text); }
.ds-seg button:focus-visible, .ds-seg button[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: -2px; position: relative; z-index: 1; }
.ds-field-label { display: block; margin: 0 0 8px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }

/* Key hints: keyboard caps, or the controller's glyphs once a pad drives the screen. */
.ds-hints { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-hints > span { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.ds-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 6px; border: 1px solid var(--ds-line-2); border-bottom-width: 2px; border-radius: 3px;
  background: rgb(243 241 234 / 0.06); font-size: 11px; font-weight: 700; font-style: normal; letter-spacing: 0.04em; color: var(--ds-text); }
.ds-kbd.pad { display: none; border-radius: 50%; min-width: 22px; width: 22px; padding: 0; font-size: 12px; }
.pad .ds-kbd.key { display: none; } .pad .ds-kbd.pad { display: inline-flex; }

@keyframes ds-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ds-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ds-slide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  @keyframes ds-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-slide { from { opacity: 0; } to { opacity: 1; } }
}
@media (max-width: 960px) {
  .ds-page > header { flex-wrap: wrap; gap: 8px 16px; padding: 18px 16px 14px; }
  .ds-page > header h1 { font-size: 32px; }
  .ds-page > .body { padding: 20px 16px 24px; }
  .ds-page > footer { flex-wrap: wrap; padding: 12px 16px; }
  .ds-page > footer .ds-hints { display: none; }
  .ds-btn.big { min-width: 0; flex: 1 1 100%; order: 9; }
}
`;

export function installTheme(): void {
  if (document.getElementById('ds-theme-css')) return;
  const style = document.createElement('style');
  style.id = 'ds-theme-css';
  style.textContent = CSS;
  document.head.append(style);
}

/** A key hint: the keyboard cap and the controller glyph (shown in pad mode), then what it does. */
export function hint(key: string, pad: string, label: string): string {
  return `<span><i class="ds-kbd key">${escapeHtml(key)}</i><i class="ds-kbd pad">${escapeHtml(pad)}</i>${escapeHtml(label)}</span>`;
}

/** 24 px line icons, 1.6 px stroke, drawn inline. */
const PATHS: Readonly<Record<string, string>> = {
  online: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5M12 3.5C9.4 6.1 8.4 8.9 8.4 12s1 5.9 3.6 8.5"/>',
  range: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  town: '<path d="M3 20h18M5 20v-8l5-4 5 4v8M15 20v-6h4v6M9 20v-4h2v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  bots: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3"/><circle cx="12" cy="4" r="1"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  leave: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  kit: '<path d="M3 10h13l2-2h3v4h-3l-1 2H9l-1 4H5l1-4H3z"/>',
};

export function icon(name: keyof typeof PATHS | string): string {
  return `<svg class="ds-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

/**
 * Brings `root`'s contents up to `html` in place: elements that stay keep
 * their identity, so a press that spans an update still clicks, and hover,
 * focus and pictures do not flash.
 */
export function patchHtml(root: Element, html: string): void {
  const next = document.createElement('template');
  next.innerHTML = html;
  patchChildren(root, next.content);
}

function patchChildren(from: Node, to: Node): void {
  const want = [...to.childNodes];
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const have = from.childNodes[i];
    if (!have) from.appendChild(w);
    else if (have.nodeType !== w.nodeType || have.nodeName !== w.nodeName) from.replaceChild(w, have);
    else if (have instanceof Element) {
      const target = w as Element;
      for (const a of [...have.attributes]) if (!target.hasAttribute(a.name)) have.removeAttribute(a.name);
      for (const a of target.attributes) if (have.getAttribute(a.name) !== a.value) have.setAttribute(a.name, a.value);
      patchChildren(have, target);
    } else if (have.nodeValue !== w.nodeValue) have.nodeValue = w.nodeValue;
  }
  while (from.childNodes.length > want.length) from.lastChild!.remove();
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
