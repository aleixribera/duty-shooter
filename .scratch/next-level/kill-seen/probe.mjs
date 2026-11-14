// Probe (pass 68): does the scripted player's steer run with `game.sees`? Prints the steer's exception, if any, and
// sees() against each foe beside the walls-only test.
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { steer } from '../../../apps/range/scripts/trailer/shots.mjs';

const chrome = await launchChrome();
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
try {
  await chrome.navigate('http://localhost:5173/?nolock&matchtime=90');
  await chrome.waitFor(`!!globalThis.duty?.game`, 90_000);
  await sleep(2000);
  for (const p of ['Bot Match', 'Station Nine', 'Free-for-all', 'Mixed teams', 'Start']) (await click(p)) || console.log('no button', p), await sleep(300);
  await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000);
  await chrome.evaluate(CAMERA_LIB);
  const seen = {};
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const r = await chrome.send('Runtime.evaluate', { expression: steer({ range: 40 }), returnByValue: true });
    const v = r.result?.result?.value;
    const k = v ? `ads=${v.ads} fire=${v.fire}` : `throw ${r.result?.exceptionDetails?.exception?.description?.slice(0, 160)}`;
    seen[k] = (seen[k] ?? 0) + 1;
  }
  console.log(JSON.stringify(seen, null, 1));
} finally {
  await chrome.close();
}
