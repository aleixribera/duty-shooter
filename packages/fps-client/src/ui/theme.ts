/**
 * Duty Shooter's identity (DESIGN.md): Backlit. Graphite plates with cut
 * corners in low light, one warm light for what is chosen, two self-hosted
 * families, five type sizes, and team colours that always come with their mark. Shared by the menus, the lobby, the Battle Royale
 * screen and the HUD.
 *
 * The page shell, buttons, segmented pickers and key hints live here so the
 * menu screens and the lobby are one design. Everything is cheap to draw over
 * the live map: no backdrop blur, and transitions on transform, opacity and
 * colour only.
 */
import { installTouchMode } from '../touch/mode';

const CSS = `
@font-face { font-family: 'Chakra Petch'; font-style: normal; font-weight: 600; font-display: swap; src: url(fonts/chakra-petch-latin-600-normal.woff2) format('woff2'); }
@font-face { font-family: 'Chakra Petch'; font-style: normal; font-weight: 700; font-display: swap; src: url(fonts/chakra-petch-latin-700-normal.woff2) format('woff2'); }
@font-face { font-family: 'IBM Plex Sans Condensed'; font-style: normal; font-weight: 400; font-display: swap; src: url(fonts/ibm-plex-sans-condensed-latin-400-normal.woff2) format('woff2'); }
@font-face { font-family: 'IBM Plex Sans Condensed'; font-style: normal; font-weight: 600; font-display: swap; src: url(fonts/ibm-plex-sans-condensed-latin-600-normal.woff2) format('woff2'); }
:root {
  /* Backlit (DESIGN.md): graphite plates in low light, one warm light for what is chosen, what to do now and the reward. */
  --ds-ink: #0b0c0e; --ds-panel: #111315; --ds-raised: #1b1d20; --ds-raised-2: #24272b;
  --ds-text: #fbf6ec; --ds-text-2: #b3b5b8; --ds-text-3: #8b8e92;
  /* The light: its text and figures, a lit plate's edge, the edge lit at half (hover, focus), the halo round a lit plate, the glow round lit text. */
  --ds-light: #ffe2b0; --ds-light-edge: #ffe7c2; --ds-light-half: #b39d76; --ds-light-halo: rgb(255 206 140 / 0.45); --ds-light-glow: rgb(255 206 140 / 0.55);
  /* A plate's unlit edge, and the fill of a lit plate: lit from below. */
  --ds-plate-edge: #34373b; --ds-plate-lit: radial-gradient(ellipse 90% 140% at 50% 115%, #3b3226, #141516 72%);
  --ds-cut: 14px;
  --ds-hazard: #a68cff; --ds-hazard-dim: rgb(166 140 255 / 0.16);
  --ds-alert: #ff4a3d; --ds-blue: #3d8bff; --ds-orange: #ff9a3c; --ds-gold: #f2c230;
  /* The team colours as bare channels (for a tint of any strength), their portraits' backing, and the enemy marker. team-colours.ts rewrites these with the colour-vision setting. */
  --ds-blue-rgb: 61 139 255; --ds-orange-rgb: 255 154 60; --ds-t1-shade: #1d3354; --ds-t2-shade: #4a2f17; --ds-enemy: #ff6159;
  --ds-preview-sky: #a9bfd2; --ds-preview-wall: #857a68; --ds-preview-shade: #1b1f24;
  --ds-good: #7fdc6a; --ds-fair: #f2c230; --ds-poor: #ff5d52;
  --ds-line: rgb(251 246 236 / 0.12); --ds-line-2: rgb(251 246 236 / 0.22);
  --ds-glass: rgb(17 19 21 / 0.84); --ds-scrim: rgb(6 7 8 / 0.9); --ds-scrim-soft: rgb(6 7 8 / 0.72); --ds-scrim-thin: rgb(6 7 8 / 0.42);
  /* The menu's low light over the world: darkest at the edges and behind the list on the left, so the lit row is the brightest thing on screen. */
  --ds-scrim-menu: linear-gradient(90deg, rgb(6 7 8 / 0.8) 0%, rgb(6 7 8 / 0.55) 36%, rgb(6 7 8 / 0) 64%), radial-gradient(ellipse 90% 85% at 62% 42%, rgb(6 7 8 / 0.3) 0%, rgb(6 7 8 / 0.6) 70%, rgb(6 7 8 / 0.9) 100%);
  /* Plates: graphite at 90%, softer under a feed line, solid under a table, thin under a marker. */
  --ds-plate: rgb(17 19 21 / 0.9); --ds-plate-soft: rgb(17 19 21 / 0.74); --ds-plate-solid: rgb(17 19 21 / 0.95); --ds-plate-thin: rgb(17 19 21 / 0.55);
  /* An empty bar's track, the faintest lift of a surface, and a line strong enough to ring a marker. */
  --ds-track: rgb(251 246 236 / 0.16); --ds-tint: rgb(251 246 236 / 0.07); --ds-line-3: rgb(251 246 236 / 0.5);
  /* The crosshair and the scope: pure white and black, the only ones. Shadows that keep type off the world. */
  --ds-reticle: #fff; --ds-black: #000; --ds-shadow: rgb(0 0 0 / 0.6); --ds-shadow-hi: rgb(0 0 0 / 0.85); --ds-shadow-lo: rgb(0 0 0 / 0.35);
  /* A team's colour as the ground under a portrait, and the red a hit puts at the screen's edge. */
  --ds-blue-deep: #1d3354; --ds-orange-deep: #4a2f17; --ds-blood: rgb(140 0 0 / 0.75);
  --ds-ease: cubic-bezier(0.2, 0.7, 0.2, 1); --ds-fast: 120ms; --ds-slow: 240ms;
  --ds-type-display: clamp(30px, min(5.6vh, 4.2vw), 60px); --ds-type-title: clamp(32px, 4.8vh, 52px);
  --ds-type-heading: 22px; --ds-type-body: 16px; --ds-type-small: 13px;
  --ds-gutter: 56px;
  /* The screen's safe area (a phone's notch, rounded corners and home bar): every edge counts from these. */
  --ds-safe-t: env(safe-area-inset-top, 0px); --ds-safe-r: env(safe-area-inset-right, 0px); --ds-safe-b: env(safe-area-inset-bottom, 0px); --ds-safe-l: env(safe-area-inset-left, 0px);
  /* Touch controls: glass thin enough to see the fight through. */
  --ds-touch-fill: rgb(17 19 21 / 0.42); --ds-touch-line: rgb(251 246 236 / 0.4); --ds-touch-press: rgb(251 246 236 / 0.3); --ds-touch-knob: rgb(251 246 236 / 0.55);
  /* Two self-hosted families (public/fonts, SIL OFL), on the old system stack while they load. */
  --ds-font: 'IBM Plex Sans Condensed', Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif;
  --ds-font-display: 'Chakra Petch', Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif;
}
.ds-ui { font-family: var(--ds-font); font-variant-numeric: tabular-nums; color: var(--ds-text); -webkit-font-smoothing: antialiased; }
.ds-ui *, .ds-ui *::before, .ds-ui *::after { box-sizing: border-box; }
.ds-ui button { font: inherit; color: inherit; cursor: pointer; }
.ds-ui button:disabled { cursor: default; }
/* A label over a value: sentence case, small, the second text colour. */
.ds-label { font-size: var(--ds-type-small); font-weight: 400; letter-spacing: 0.01em; color: var(--ds-text-2); }
.ds-title { font-family: var(--ds-font-display); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-t1 { color: var(--ds-blue); } .ds-t2 { color: var(--ds-orange); }
/* Lit text: the clock, the score popup, the result, the next Rank, a figure that just changed. No plate. */
.ds-lit-text { color: var(--ds-light); text-shadow: 0 0 22px var(--ds-light-glow); }

/* The plate (DESIGN.md, Shape and depth): cut at the top left and the bottom right, drawn as two layers (the edge, then
   the fill inset by the edge's width) so the halo, a drop-shadow on the element itself, follows the cut. Its edge and fill
   are its own: a plate inside a lit one starts unlit again. Unlit, lit at half (hover, focus), lit (chosen), your own, empty. */
.ds-plate, .ds-btn, .ds-seg button, .ds-tabs button { --ds-ch: 10px; --ds-edge: var(--ds-plate-edge); --ds-edge-w: 1px; --ds-fill: var(--ds-plate); position: relative; isolation: isolate; }
.ds-plate::before, .ds-plate::after, .ds-btn::before, .ds-btn::after, .ds-seg button::before, .ds-seg button::after, .ds-tabs button::before, .ds-tabs button::after {
  content: ''; position: absolute; z-index: -1; pointer-events: none;
  clip-path: polygon(var(--ds-ch) 0, 100% 0, 100% calc(100% - var(--ds-ch)), calc(100% - var(--ds-ch)) 100%, 0 100%, 0 var(--ds-ch)); }
.ds-plate::before, .ds-btn::before, .ds-seg button::before, .ds-tabs button::before { inset: 0; background: var(--ds-edge); }
.ds-plate::after, .ds-btn::after, .ds-seg button::after, .ds-tabs button::after { inset: var(--ds-edge-w); background: var(--ds-fill); }
.ds-plate { --ds-ch: var(--ds-cut); }
/* A plate that scrolls (a long dialog, the held scoreboard) carries its own fill, cut the same: its layers only cover the first screenful. */
.ds-plate.is-scroll { background: var(--ds-fill); clip-path: polygon(var(--ds-ch) 0, 100% 0, 100% calc(100% - var(--ds-ch)), calc(100% - var(--ds-ch)) 100%, 0 100%, 0 var(--ds-ch)); }
.ds-plate.is-half { --ds-edge: var(--ds-light-half); }
.ds-plate.is-lit, .ds-btn.primary, .ds-seg button.on { --ds-edge: var(--ds-light-edge); --ds-edge-w: 2px; --ds-fill: var(--ds-plate-lit); filter: drop-shadow(0 0 14px var(--ds-light-halo)); }
/* Your own row or seat: raised, its edge in the second text colour. The light is kept for what you pick. */
.ds-plate.is-own { --ds-edge: var(--ds-text-2); --ds-fill: var(--ds-raised); }
/* An empty slot: the one dashed line. */
.ds-plate.is-empty { --ds-edge: transparent; --ds-fill: transparent; outline: 1px dashed var(--ds-text-2); outline-offset: -1px; }
/* Light comes on in one move: brightness falls from 2.4 to 1 as it shows. */
@keyframes ds-light-on { from { filter: brightness(2.4) drop-shadow(0 0 14px var(--ds-light-halo)); } }
.ds-plate.is-lit.light-on { animation: ds-light-on 400ms var(--ds-ease) forwards; }

/* The page shell: a header with the title, a body that scrolls on its own, and a footer that always shows the actions. */
.ds-page { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto;
  padding: var(--ds-safe-t) var(--ds-safe-r) var(--ds-safe-b) var(--ds-safe-l);
  background: linear-gradient(90deg, rgb(6 7 8 / 0.94) 0%, rgb(6 7 8 / 0.82) 55%, rgb(6 7 8 / 0.9) 100%); }
.ds-page > header { display: flex; align-items: flex-end; gap: 24px; padding: 28px var(--ds-gutter) 18px; border-bottom: 1px solid var(--ds-line); }
.ds-page > header .heading { flex: 1; min-width: 0; }
.ds-page > header h1 { margin: 0; font-family: var(--ds-font-display); font-size: var(--ds-type-title); line-height: 0.92; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ds-page > header .aside { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-bottom: 4px; }
.ds-page > .body { overflow-y: auto; overscroll-behavior: contain; padding: 28px var(--ds-gutter) 32px; scrollbar-width: thin; scrollbar-color: var(--ds-line-2) transparent; }
.ds-page > footer { display: flex; align-items: center; gap: 12px; padding: 14px var(--ds-gutter); background: var(--ds-scrim-soft); border-top: 1px solid var(--ds-line); }
.ds-page > footer .grow { flex: 1; min-width: 0; }
.ds-chip { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border: 1px solid var(--ds-plate-edge); background: var(--ds-plate); font-family: var(--ds-font-display); font-size: var(--ds-type-small); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ds-text-2); white-space: nowrap; }
.ds-chip b { color: var(--ds-text); font-weight: 700; }
/* A block's name at heading size, its count or note beside it in sentence case. */
.ds-h2 { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--ds-line-2);
  font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-h2 small { font-family: var(--ds-font); font-size: var(--ds-type-small); font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--ds-text-2); }

/* Readouts: a label over a value, side by side in one strip split by lines. */
.ds-readouts { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
.ds-readouts > div { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; background: var(--ds-panel); }
.ds-readouts span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-readouts b { font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 1.1; font-weight: 700; letter-spacing: 0.01em; }

/* A status dot and the sentence that says what the state means. */
.ds-state { display: flex; align-items: baseline; gap: 10px; font-size: var(--ds-type-body); color: var(--ds-text); }
.ds-state::before { content: ''; flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--ds-alert); transform: translateY(-1px); }
.ds-state.up::before { background: var(--ds-good); }
.ds-state.busy::before { background: var(--ds-fair); }
.ds-state.wait::before { background: var(--ds-text-3); }

/* Buttons: an unlit plate, lit at half under the pointer or focus; the primary is the screen's lit action. */
.ds-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 0 22px; border: 0; background: none;
  font-family: var(--ds-font-display); font-size: var(--ds-type-body); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; color: var(--ds-text);
  transition: color var(--ds-fast); }
.ds-btn:not(:disabled):hover, .ds-btn:focus-visible, .ds-btn[data-pad-focus] { --ds-edge: var(--ds-light-half); outline: none; }
.ds-btn:not(:disabled):active { --ds-fill: var(--ds-raised-2); }
.ds-btn.primary:not(:disabled):hover, .ds-btn.primary:focus-visible, .ds-btn.primary[data-pad-focus] { --ds-edge: var(--ds-reticle); }
/* Focus on a lit control: the edge goes white and a ring stands 4 px out, since a lit plate has no brighter edge to give (DESIGN.md, Light). */
.ds-btn.primary:not(:disabled):focus-visible, .ds-btn.primary:not(:disabled)[data-pad-focus], .ds-seg button.on:focus-visible, .ds-seg button.on[data-pad-focus] { outline: 2px solid var(--ds-text-2); outline-offset: 4px; }
.ds-btn.primary:not(:disabled):active { --ds-fill: var(--ds-raised-2); }
.ds-btn.big { --ds-ch: var(--ds-cut); min-height: 58px; min-width: 260px; padding: 0 36px; font-size: var(--ds-type-heading); letter-spacing: 0.12em; }
.ds-btn:disabled { color: var(--ds-text-2); }
/* A primary that can't be pressed is unlit, and its label says why. */
.ds-btn.primary:disabled { --ds-edge: var(--ds-plate-edge); --ds-edge-w: 1px; --ds-fill: var(--ds-plate); filter: none; font-size: var(--ds-type-body); }
.ds-btn .ds-icon { width: 20px; height: 20px; }

/* A segmented picker: one choice lit. */
.ds-seg { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: 6px; }
.ds-seg button { --ds-ch: 8px; min-height: 40px; padding: 8px 6px; border: 0; background: none; font-family: var(--ds-font-display); font-size: var(--ds-type-small); font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ds-text-2); transition: color 100ms; }
.ds-seg button.on { color: var(--ds-text); }
.ds-seg button:not(:disabled):not(.on):hover { --ds-edge: var(--ds-light-half); color: var(--ds-text); }
.ds-seg button:focus-visible, .ds-seg button[data-pad-focus] { --ds-edge: var(--ds-light-half); color: var(--ds-text); outline: none; z-index: 1; }
.ds-seg button.on:focus-visible, .ds-seg button.on[data-pad-focus] { --ds-edge: var(--ds-reticle); }
/* A picker that can't be used goes out: its words dim, and its choice keeps a grey edge without the light, so it no longer looks live. */
.ds-seg button:disabled { color: var(--ds-text-3); cursor: default; }
.ds-seg button.on:disabled { --ds-edge: var(--ds-text-3); --ds-edge-w: 1px; --ds-fill: var(--ds-plate); color: var(--ds-text-2); filter: none; }
.ds-field-label { display: block; margin: 0 0 8px; font-size: var(--ds-type-small); color: var(--ds-text-2); }

/* Key hints: keyboard caps, or the controller's glyphs once a pad drives the screen. */
.ds-hints { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-hints > span { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.ds-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 24px; padding: 0 7px; border: 1px solid var(--ds-line-2); border-radius: 2px;
  background: var(--ds-plate); font-family: var(--ds-font-display); font-size: var(--ds-type-small); font-weight: 600; font-style: normal; letter-spacing: 0.04em; color: var(--ds-text); }
.ds-kbd.pad { display: none; border-radius: 50%; min-width: 24px; width: 24px; padding: 0; }
.pad .ds-kbd.key { display: none; } .pad .ds-kbd.pad { display: inline-flex; }

/* Touch (the last input was a finger, touch/mode.ts): the page is a game, not a document. Nothing scrolls past its end, selects, zooms on a double tap or raises the callout; key caps name keys nobody has, so they go. */
html.ds-touch, html.ds-touch body { overscroll-behavior: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
html.ds-touch input, html.ds-touch textarea { -webkit-user-select: text; user-select: text; }
html.ds-touch .ds-kbd.key, html.ds-touch .ds-kbd.pad { display: none; }
html.ds-touch .ds-hints { visibility: hidden; }
/* A page opened over a match (the loadout, Settings) has the screen: the HUD under it would read through its scrim. */
body:has(.ds-menu:not([hidden]) .ds-page) .ds-hud { visibility: hidden; }
/* A thumb's 44 px for every button, whatever its row gave it. */
html.ds-touch .ds-ui .ds-btn { min-height: 44px; }
/* A thumb on a seam picks the neighbour: on touch the segments of a picker stand 8 px apart, each in its own line (design audit 2026-11-10, F13). */
html.ds-touch .ds-seg { gap: 8px; }

/* The rise is the translate property, not transform: a line centred by its transform (the hint, the round card) keeps its place as it comes in. */
@keyframes ds-in { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: none; } }
@keyframes ds-slide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  @keyframes ds-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-slide { from { opacity: 0; } to { opacity: 1; } }
  .ds-plate.is-lit.light-on { animation: none; }
}
@media (max-width: 960px) {
  :root { --ds-gutter: 16px; }
  .ds-page > header { flex-wrap: wrap; gap: 8px 16px; padding: 18px var(--ds-gutter) 14px; }
  .ds-page > header .heading { flex: 1 1 100%; }
  .ds-page > header h1 { font-size: var(--ds-type-title); }
  .ds-page > .body { padding: 20px var(--ds-gutter) 24px; }
  .ds-page > footer { flex-wrap: wrap; padding: 12px var(--ds-gutter); }
  .ds-page > footer .ds-hints { display: none; }
  /* No halo on a plate this wide: a filter over half the screen costs the toaster. */
  .ds-btn.big { min-width: 0; flex: 1 1 100%; order: 9; filter: none; }
}
/* A phone held sideways has width and no height: the header is one line and the footer one row, so the body keeps the screen. */
@media (max-height: 520px) {
  .ds-page > header { flex-wrap: nowrap; align-items: center; gap: 16px; padding: 10px var(--ds-gutter) 8px; }
  /* The title alone says where this is; what stands beside it (the tabs) takes the rest of the line and scrolls sideways. */
  .ds-ui .ds-page > header .heading { flex: 0 0 auto; max-width: 50%; }
  .ds-page > header h1 { font-size: var(--ds-type-heading); line-height: 1.2; }
  .ds-ui .ds-page > header .aside { flex: 1 1 0; flex-wrap: nowrap; justify-content: flex-end; min-width: 0; padding-bottom: 0; }
  .ds-ui .ds-page > header .aside:has(.ds-tabs) { justify-content: flex-start; }
  .ds-ui .ds-page > header .ds-tabs { order: 0; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .ds-ui .ds-page > header .ds-tabs button.on { filter: none; }
  .ds-ui .ds-page > header .ds-tabs button { flex: 0 0 auto; padding: 0 12px; font-size: var(--ds-type-small); letter-spacing: 0.08em; }
  .ds-page > .body { padding-top: 16px; padding-bottom: 20px; }
  .ds-page > footer { flex-wrap: nowrap; gap: 8px; padding: 8px var(--ds-gutter); }
  .ds-btn.big { flex: 1 1 0; min-height: 44px; padding: 0 16px; font-size: var(--ds-type-body); }
}
`;

export function installTheme(): void {
  // The menus are up before the engine: they have to know a finger from a mouse from the first tap.
  installTouchMode();
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
  island: '<path d="M3 18c3-1.6 6-1.6 9 0s6 1.6 9 0M5.5 15.5 11 7l3.5 5 1.5-2 3 5.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  grenade: '<circle cx="12" cy="14.5" r="5.5"/><path d="M10 9V5.5h4V9M14 5.5h3.5V9"/>',
  smoke: '<rect x="9" y="10" width="6" height="10" rx="1"/><path d="M9 13h6M11 10V8h2v2"/><path d="M13 6.5c0-1.5 1.5-2.5 3-2 1-1.5 4-1 4 1.2"/>',
  flash: '<rect x="9" y="9" width="6" height="11" rx="1"/><path d="M9 12.5h6M9 16.5h6M11 9V7h2v2"/><path d="M5 5l2 2M19 5l-2 2M12 2.5V4.5"/>',
  perk: '<path d="M12 3 20 7v5c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V7z"/>',
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
