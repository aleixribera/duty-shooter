// Ticket 63: the Bot Match setup. The menu's Bot Match opened at desktop, phone-landscape and phone sizes, then a mode picked by keyboard focus.
//   node .scratch/next-level/setup/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = resolve(import.meta.dirname, process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: look.mjs <out dir, under this folder>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const SIZES = { desktop: [1920, 1080, false], landscape: [844, 390, true], phone: [390, 844, true] };
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, captureBeyondViewport: false });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
try {
  for (const [name, [width, height, mobile]] of Object.entries(SIZES).filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await chrome.navigate('http://localhost:5191/');
    await chrome.waitFor('document.querySelector(".ds-home")', 240_000);
    await sleep(2500);
    if (!(await click('Bot Match'))) { await shot(`${name}-fail`); throw new Error('no Bot Match'); }
    await sleep(1500);
    await shot(name);
    if (name === 'desktop') {
      // Real key presses: the menu's own keyboard moves its pad focus, and a key press is what lights :focus-visible.
      const key = async (k, code) => {
        await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: code === 'Tab' ? 9 : 40 });
        await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: code === 'Tab' ? 9 : 40 });
        await sleep(150);
      };
      let on = '';
      for (let i = 0; i < 30 && !on.startsWith('FREE'); i++) {
        await key('Tab', 'Tab');
        on = (await chrome.evaluate(`(document.querySelector('[data-pad-focus]') ?? document.activeElement)?.innerText?.trim().toUpperCase() ?? ''`)) ?? '';
      }
      console.log('focused:', on, await chrome.evaluate(`(() => { const e = document.activeElement; const s = getComputedStyle(e); return JSON.stringify({ tag: e.tagName, cls: e.className, pad: e.hasAttribute('data-pad-focus'), fv: e.matches(':focus-visible'), hasFocus: document.hasFocus(), outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, padEl: document.querySelector('[data-pad-focus]')?.innerText }); })()`));
      await sleep(300);
      await shot('desktop-focus');
    }
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
