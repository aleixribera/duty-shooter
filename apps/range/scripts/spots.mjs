// Screenshots every reference spot of a map (?spot=<name>, HUD and menu
// hidden) at 1920 x 1080, for comparing builds side by side.
//
//   node apps/range/scripts/spots.mjs [map] [out dir] [base url] [only: spots whose name contains this]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from './chrome.mjs';

const map = process.argv[2] ?? 'survival-town';
const out = process.argv[3] ?? 'spots';
const base = process.argv[4] ?? 'http://localhost:5173/';
const only = process.argv[5] ?? '';
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  const page = (spot) => {
    const url = new URL(base);
    url.searchParams.set('map', map);
    if (spot) url.searchParams.set('spot', spot);
    return url.toString();
  };
  await chrome.navigate(page(null));
  const names = await chrome.waitFor('globalThis.duty?.map?.referenceSpots?.map((s) => s.name)', 60_000);
  if (!names) throw new Error('The page did not expose its map (a dev build is needed)');
  for (const name of names.filter((n) => n.includes(only))) {
    await chrome.navigate(page(name));
    await chrome.waitFor('globalThis.duty?.game', 60_000);
    // The first load of a map in dev bakes its lighting.
    await chrome.waitFor('document.body.dataset.bake', 180_000);
    // Let shaders compile and shadows settle.
    await sleep(2500);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const file = join(out, `${map}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log(file);
  }
  if (chrome.errors.length) console.log(`console errors:\n${chrome.errors.join('\n')}`);
} finally {
  await chrome.close();
}
