// Screenshots the dev soldier sheet (soldiers.html): every look holding each
// weapon through the game's poses, from the front and the side, at 1920 x 1080.
//
//   node apps/range/scripts/soldier-sheet.mjs [out dir] [base url] [t (s)] [weapons, comma-separated]
//
// VIEWS=front,side,back picks the views; ROWS=0,2 and COLS=0,3 (indices into
// the looks and the poses) frame only some soldiers, closer up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, sleep } from './chrome.mjs';

const out = process.argv[2] ?? 'soldiers';
const base = process.argv[3] ?? 'http://localhost:5173/';
const t = process.argv[4] ?? '0.9';
const weapons = (process.argv[5] ?? 'm4a1,smg,shotgun,sniper,pistol').split(',');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const weapon of weapons) {
    for (const view of (process.env.VIEWS ?? 'front,side').split(',')) {
      const url = new URL('soldiers.html', base);
      url.searchParams.set('weapon', weapon);
      url.searchParams.set('view', view);
      url.searchParams.set('t', t);
      if (process.env.ROWS) url.searchParams.set('rows', process.env.ROWS);
      if (process.env.COLS) url.searchParams.set('cols', process.env.COLS);
      await chrome.navigate(url.toString());
      await chrome.waitFor('document.body.dataset.soldiers', 60_000);
      // Let shaders compile.
      await sleep(1500);
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
      const file = join(out, `${weapon}-${view}${process.env.COLS ? `-${process.env.COLS.replaceAll(',', '')}` : ''}.png`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(file);
    }
  }
  if (chrome.errors.length) console.log(`console errors:\n${chrome.errors.join('\n')}`);
} finally {
  await chrome.close();
}
