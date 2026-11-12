// Bullet holes up close, as ../holes/holes.mjs, plus a point-blank spot 0.6 m from the north house front (the review saw the holes from there).
// and a shaded one (the wall at (-55, -10)), then the screen and a crop round the crosshair at each.
//   node .scratch/next-level/holes/holes.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: holes.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5191/';
mkdirSync(out, { recursive: true });

const SPOTS = [
  ['sun', '-1,-12,0'],
  ['shade', '-53,-10,1.571'],
  ['close', '-1,-13.3,0'],
];

const chrome = await launchChrome();
try {
  for (const [name, at] of SPOTS) {
    await chrome.navigate(`${BASE}?explore=survival-town&nolock&at=${at}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
    await sleep(4000);
    const mouse = (type, x, y) => chrome.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    // Six single shots, the aim nudged a little between them so the holes stand apart.
    for (let i = 0; i < 6; i++) {
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960 + (i % 3) * 40 - 40, y: 540 + (i < 3 ? -25 : 25), buttons: 0 });
      await sleep(250);
      await mouse('mousePressed', 960, 540);
      await sleep(60);
      await mouse('mouseReleased', 960, 540);
      await sleep(450);
    }
    await sleep(2500);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    const c = await chrome.send('Page.captureScreenshot', { format: 'png', clip: { x: 810, y: 390, width: 300, height: 200, scale: 2 } });
    writeFileSync(`${out}/${name}-crop.png`, Buffer.from(c.result.data, 'base64'));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
