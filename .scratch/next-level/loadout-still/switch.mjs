// The review's case: gun A drawn, B asked for (its shaders hold every frame), then A again: A's still must show.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const chrome = await launchChrome();
const st = () => chrome.evaluate(`JSON.stringify({ img: !document.querySelector('.ds-stage img').hidden, src: document.querySelector('.ds-stage img').getAttribute('src')?.split('/').pop(), shown: document.querySelector('.ds-stage').dataset.shown ?? null, drawn: document.querySelector('.ds-stage').dataset.drawn ?? null })`);
try {
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor('!!globalThis.duty?.menu?.gunStage', 90_000))) throw new Error('no start');
  await chrome.evaluate(`globalThis.duty.menu.loadout('main')`);
  await chrome.waitFor(`document.querySelector('.ds-stage')?.dataset.drawn === 'm4a1'`, 90_000, 100);
  console.log('A drawn', await st());
  await chrome.evaluate(`globalThis.duty.menu.gunStage.show('lmg', undefined, null)`);
  await sleep(400);
  console.log('B asked', await st());
  await chrome.evaluate(`globalThis.duty.menu.gunStage.show('m4a1', undefined, null)`);
  await sleep(150);
  console.log('A again', await st());
  await chrome.waitFor(`document.querySelector('.ds-stage')?.dataset.drawn === 'm4a1' && document.querySelector('.ds-stage img').hidden`, 60_000, 100);
  console.log('A drawn again', await st());
} finally {
  await chrome.close();
}
