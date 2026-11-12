// The in-game changelog: the main menu's foot and the Changelog screen, on a desktop and a phone.
//   node .scratch/changelog/look.mjs <out dir>   (dev server on :5191)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../apps/range/scripts/chrome.mjs';

const [out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
try {
  for (const [name, w, h, mobile] of [['desktop', 1920, 1080, false], ['phone', 390, 844, true], ['phone-side', 844, 390, true]]) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await chrome.navigate('http://localhost:5191/?nolock');
    if (!(await chrome.waitFor("document.querySelector('.ds-version')", 90_000))) throw new Error('menu did not show');
    await sleep(1500);
    if (name === 'phone') await chrome.evaluate("document.querySelector('.ds-home').scrollTop = 1e5");
    await shot(`${name}-menu`);
    await chrome.evaluate("document.querySelector('button.ds-version').click()");
    await chrome.waitFor("document.querySelector('.ds-log li')", 10_000);
    await sleep(300);
    await shot(`${name}-changelog`);
    const info = await chrome.evaluate(`({ rows: document.querySelectorAll('.ds-log li').length, days: document.querySelectorAll('.ds-log section').length, focus: document.activeElement?.className, overflowX: document.documentElement.scrollWidth > innerWidth, label: document.querySelector('.ds-page h1')?.textContent })`);
    console.log(name, JSON.stringify(info));
    await chrome.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))");
    await sleep(200);
    console.log(name, 'after Esc:', JSON.stringify(await chrome.evaluate("!!document.querySelector('.ds-dests')")));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
