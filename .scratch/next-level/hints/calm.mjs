// Hints wait for a quiet moment (ticket 39): Survival Town walked alone with fresh hint memory. Walk (learns "move"),
// hold the trigger 10 s, let go, and log the hint line every 250 ms. The sights' hint must not show while firing, and must
// show about four seconds after the last shot.
//   node .scratch/next-level/hints/calm.mjs [base url]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5191/';
const chrome = await launchChrome();
try {
  await chrome.navigate(`${BASE}?explore=survival-town&nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 90_000))) throw new Error('page did not start');
  await sleep(3000);
  const hint = () => chrome.evaluate(`(() => { const h = document.querySelector('.ds-hintline'); return h && !h.hidden ? h.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
  const key = (type) => chrome.send('Input.dispatchKeyEvent', { type, code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  const log = [];
  const sample = async (phase, seconds) => {
    const start = Date.now();
    while (Date.now() - start < seconds * 1000) {
      log.push({ phase, t: +((Date.now() - start) / 1000).toFixed(2), hint: await hint() });
      await sleep(250);
    }
  };
  log.push({ phase: 'start', hint: await hint() });
  await key('keyDown');
  await sleep(800);
  await key('keyUp');
  await mouse('mousePressed');
  await sample('firing', 10);
  await mouse('mouseReleased');
  await sample('after', 8);
  const firingHints = [...new Set(log.filter((l) => l.phase === 'firing').map((l) => l.hint))];
  const firstAfter = log.find((l) => l.phase === 'after' && l.hint?.includes('Aim'));
  console.log(JSON.stringify({ start: log[0].hint, firingHints, aimShownAfter: firstAfter?.t ?? null, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
