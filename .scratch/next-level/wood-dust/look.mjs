// Ticket 78: what a shot into wood throws up. Survival Town walked alone, each spot with a pitch.
//   node .scratch/next-level/wood-dust/look.mjs <out dir> name=x,z,yaw,pitch[,fire ms] ...   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, ...spots] = process.argv.slice(2);
if (!out) throw new Error('usage: wood-dust/look.mjs <out dir> name=x,z,yaw,pitch ...');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  for (const v of spots) {
    const [name, at] = v.split('=');
    const [x, z, yaw, pitch, fire] = at.split(',').map(Number);
    await chrome.navigate(`http://localhost:5191/?explore=survival-town&nolock&at=${x},${z},${yaw}`);
    if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
    await sleep(2500);
    await chrome.evaluate(`duty.game.input.setAngles(${yaw}, ${pitch}), 1`);
    await sleep(1500);
    if (fire) {
      // Held fire: the shot lands mid-burst, as the review's 05 does.
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'left', clickCount: 1 });
      await sleep(fire);
    }
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
    if (fire) await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'left', clickCount: 1 });
    if (fire) {
      // Settled: the dust gone, what the burst left on the wall.
      await sleep(2500);
      const t = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
      writeFileSync(`${out}/${name}-settled.jpg`, Buffer.from(t.result.data, 'base64'));
    }
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
