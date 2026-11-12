// Ticket 71: an enemy ping just past an ally, as in review 2026-11-12e's 05. The HUD's own ping and ally-tag views,
// drawn over Survival Town, with the marks as they were (left) and lifted clear of the tags (right).
//   node .scratch/next-level/ping-clear/marks.mjs <out.jpg>   (dev server on :5191)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const src = (f) => '/@fs/' + resolve('packages/fps-client/src/hud', f).split(String.fromCharCode(92)).join('/');
const chrome = await launchChrome();
try {
  await chrome.navigate('http://localhost:5191/?explore=survival-town&nolock&at=-6,-46,3.1416');
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
  await sleep(2500);
  const r = await chrome.evaluate(`(async () => {
    const { PingMarks, clearOfAllies } = await import('${src('ping-marks.ts')}');
    const { AllyTagsView } = await import('${src('ally-tags.ts')}');
    const hud = document.querySelector('.ds-hud') ?? document.body;
    const tag = (x, y, id, name) => ({ id, name, mark: 'chevron', label: null, x, y, edge: false, angle: 0, faded: false, hidden: false });
    const mark = (x, y, id) => ({ id, kind: 'enemy', name: 'Rook', x, y, distance: 53 });
    // Left half: as the review saw it. Right half: lifted.
    const tags = [tag(560, 480, 'a', 'Rook'), tag(1520, 480, 'b', 'Rook'), tag(1560, 300, 'c', 'Ember')];
    const marks = [mark(552, 540, 1), mark(1512, 540, 2)];
    for (const box of [hud]) {
      const layer = document.createElement('div');
      layer.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none';
      box.append(layer);
      new AllyTagsView(layer).update(tags);
      new PingMarks(layer).update([marks[0], ...clearOfAllies([marks[1]], tags)], null);
    }
    return 1;
  })()`);
  if (r !== 1) throw new Error('draw failed: ' + JSON.stringify(chrome.errors.slice(0, 3)));
  await sleep(600);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
