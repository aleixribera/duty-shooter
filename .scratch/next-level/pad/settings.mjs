// Ticket 13: the Controller section of Settings, with its aim slowdown and vibration rows, at desktop and phone width.
//   node .scratch/next-level/pad/settings.mjs [desktop|phone]
import { open, sleep } from '../settings/lib.mjs';

const which = process.argv[2] ?? 'desktop';
const phone = which === 'phone';
const chrome = await open('?nolock&hz=60', phone ? { width: 390, height: 844, dpr: 2, mobile: true } : {});
try {
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 120_000))) throw new Error('page did not start');
  await sleep(1500);
  console.log('settings', await chrome.click('Settings'));
  await sleep(400);
  const tabs = await chrome.evaluate(`[...document.querySelectorAll('.ds-tabs button')].map((b) => b.textContent)`);
  const i = tabs.findIndex((t) => /controller|mouse/i.test(t));
  console.log('tabs', tabs, 'opening', tabs[i]);
  await chrome.evaluate(`document.querySelectorAll('.ds-tabs button')[${i}].click()`);
  await sleep(300);
  // The new rows brought into view.
  const found = await chrome.evaluate(`(() => { const r = [...document.querySelectorAll('.ds-menu label, .ds-menu .row, .ds-menu span')].find((e) => e.textContent.trim().startsWith('Vibration')); if (!r) return false; r.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(300);
  console.log('vibration row', found);
  console.log(await chrome.shot(`../pad/settings-${which}.png`));
  const over = await chrome.evaluate(`document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.ds-menu .ds-page *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.ds-tabs'))`);
  console.log('overflow', over, 'errors', chrome.errors);
} finally {
  await chrome.close();
}
