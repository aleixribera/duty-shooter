// The lobby's picture of a map: one reference spot, cropped to the lobby
// card's shape (960 x 414) and saved as public/maps/<map>.jpg.
//
//   node apps/range/scripts/map-picture.mjs <map> <spot> [base url]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './chrome.mjs';

const [map, spot, base = 'http://localhost:5173/'] = process.argv.slice(2);
if (!map || !spot) throw new Error('usage: map-picture.mjs <map> <spot> [base url]');
const chrome = await launchChrome();
try {
  const url = new URL(base);
  url.searchParams.set('map', map);
  url.searchParams.set('spot', spot);
  await chrome.navigate(url.toString());
  await chrome.waitFor('globalThis.duty?.game', 60_000);
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(3000);
  // 1920 x 828 from the middle of the frame, halved.
  const shot = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 126, width: 1920, height: 828, scale: 0.5 } });
  const file = fileURLToPath(new URL(`../public/maps/${map}.jpg`, import.meta.url));
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(file);
} finally {
  await chrome.close();
}
