// PLAN item 9e (ticket 119): Range Control's caption, up mid-match, goes from under the pause menu and its editor
// and comes back at Resume. A Bot Match on Switchyard; prints the caption's display each step. Needs the dev server.
//
//   node .scratch/next-level/pause-editor/caption.mjs [base url]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const chrome = await launchChrome();
const js = async (e) => JSON.parse((await chrome.evaluate(`JSON.stringify(${e})`)) ?? 'null');
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const esc = async () => {
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
};
const caption = `(() => { const c = document.querySelector('.ds-caption'); return { on: c.classList.contains('on'), display: getComputedStyle(c).display }; })()`;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Team deathmatch', 'Start']) await click(p).then(() => sleep(400));
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive === true`, 120_000))) throw new Error('no match');
  await sleep(1000);
  await chrome.evaluate(`duty.game.hud.caption('Enemy team has taken the lead.', 30)`);
  await sleep(200);
  console.log('playing', JSON.stringify(await js(caption)));
  await esc();
  await sleep(300);
  await click('Loadout');
  await sleep(500);
  console.log('editor', JSON.stringify(await js(caption)));
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync('.scratch/next-level/pause-editor/caption-editor.jpg', Buffer.from(s.result.data, 'base64'));
  await click('Done');
  await sleep(300);
  await click('Resume');
  await sleep(300);
  console.log('resumed', JSON.stringify(await js(caption)));
} catch (e) {
  console.log('failed:', e.message);
} finally {
  await chrome.close();
}
