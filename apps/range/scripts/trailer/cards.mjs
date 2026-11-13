// The trailer's type, rendered as 1920 x 1080 PNGs in the game's own design
// language (DESIGN.md): Bahnschrift condensed capitals, flat ink, held to the
// left edge, the T-minus readout as the only ornament. Slates are transparent,
// to lay over footage; cards are full frames.
//
//   node apps/range/scripts/trailer/cards.mjs <out dir> <cards.json>
//
// cards.json: [{ "name": "slate-yard", "kind": "slate", "title": "Switchyard", "readout": "T−7:12", "bottom": 96 },
//              { "name": "line-1", "kind": "line", "text": "Every match is a weapons test." },
//              { "name": "title", "kind": "title", "text": "Duty Shooter" },
//              { "name": "end", "kind": "end", "text": "Duty Shooter", "facts": ["4 maps", ...], "call": "...", "url": "..." }]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launchChrome } from '../chrome.mjs';

const [out, list] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(list, 'utf8'));
mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const CSS = `
  :root { --ink: #0b0c0e; --text: #fbf6ec; --text-2: #b3b5b8; --line: rgba(251, 246, 236, 0.22); --light: #ffe2b0; --gutter: 112px; }
  html, body { margin: 0; width: 1920px; height: 1080px; background: transparent; overflow: hidden; }
  body { font-family: Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif; color: var(--text); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
  .full { position: absolute; inset: 0; background: var(--ink); }
  .scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 360px; background: linear-gradient(to top, rgba(7, 9, 13, 0.62), rgba(7, 9, 13, 0)); }
  .slate { position: absolute; left: var(--gutter); bottom: 96px; display: flex; align-items: baseline; gap: 28px; }
  .slate h1 { margin: 0; font-size: 76px; font-weight: 700; font-stretch: condensed; text-transform: uppercase; letter-spacing: 0.02em; line-height: 0.9; }
  .slate .readout { font-size: 34px; font-weight: 400; color: var(--text-2); padding-left: 28px; border-left: 1px solid var(--line); line-height: 1; }
  .line { position: absolute; left: var(--gutter); right: var(--gutter); top: 50%; transform: translateY(-50%); margin: 0; font-size: 104px; font-weight: 700; font-stretch: condensed; text-transform: uppercase; letter-spacing: 0.015em; line-height: 0.92; }
  .title { position: absolute; left: var(--gutter); top: 50%; transform: translateY(-54%); margin: 0; font-size: 252px; font-weight: 700; font-stretch: condensed; text-transform: uppercase; letter-spacing: 0.01em; line-height: 0.86; }
  .end h1 { position: absolute; left: var(--gutter); top: 300px; margin: 0; font-size: 168px; font-weight: 700; font-stretch: condensed; text-transform: uppercase; letter-spacing: 0.01em; line-height: 0.86; }
  .facts { position: absolute; left: var(--gutter); top: 560px; display: flex; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .facts div { padding: 22px 40px 22px 0; margin-right: 40px; border-right: 1px solid var(--line); font-size: 34px; text-transform: uppercase; letter-spacing: 0.04em; }
  .facts div:last-child { border-right: 0; margin-right: 0; }
  .call { position: absolute; left: var(--gutter); top: 720px; font-size: 52px; font-weight: 700; font-stretch: condensed; text-transform: uppercase; letter-spacing: 0.02em; }
  .url { position: absolute; left: var(--gutter); top: 790px; font-size: 34px; color: var(--text-2); }
  .count { position: absolute; left: var(--gutter); bottom: 96px; font-size: 220px; font-weight: 700; font-stretch: condensed; line-height: 0.8; }
`;

function body(c) {
  switch (c.kind) {
    case 'slate':
      // `bottom` (px) lifts a slate clear of a HUD along the frame's foot.
      return `<div class="scrim"></div><div class="slate"${c.bottom ? ` style="bottom: ${Number(c.bottom)}px"` : ''}><h1>${esc(c.title)}</h1>${c.readout ? `<div class="readout">${esc(c.readout)}</div>` : ''}</div>`;
    case 'line':
      return `${c.over ? '<div class="scrim" style="height:100%;background:rgba(7,9,13,0.35)"></div>' : '<div class="full"></div>'}<p class="line">${esc(c.text)}</p>`;
    case 'title':
      return `<div class="full"></div><h1 class="title">${esc(c.text)}</h1>`;
    case 'end':
      return `<div class="full"></div><div class="end"><h1>${esc(c.text)}</h1></div><div class="facts">${c.facts.map((f) => `<div>${esc(f)}</div>`).join('')}</div><div class="call">${esc(c.call)}</div>${c.url ? `<div class="url">${esc(c.url)}</div>` : ''}`;
    case 'count':
      return `<div class="scrim"></div><div class="count">${esc(c.text)}</div>`;
    default:
      throw new Error(`unknown card kind ${c.kind}`);
  }
}

const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const c of cards) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body(c)}</body></html>`;
    await chrome.navigate(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await chrome.waitFor(`document.readyState === 'complete' && document.fonts.status === 'loaded'`, 10_000, 100);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${c.name}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(`${cards.length} cards in ${out}`);
} finally {
  await chrome.close();
}
