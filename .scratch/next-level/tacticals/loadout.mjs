// Ticket 20: the loadout screen with its Tactical and Perk rows, at desktop and phone width.
//   node .scratch/next-level/tacticals/loadout.mjs [desktop|phone]
import { open, sleep } from '../settings/lib.mjs';

const which = process.argv[2] ?? 'desktop';
const phone = which === 'phone';
const chrome = await open('?nolock&hz=60', phone ? { width: 390, height: 844, dpr: 2, mobile: true } : {});
try {
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 120_000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.evaluate(`duty.menu.loadout('lobby')`);
  await sleep(500);
  console.log(await chrome.shot(`../tacticals/loadout-${which}-1.png`));
  // Hover the Flash and the Blast Vest tiles: the Details card follows.
  for (const name of ['Flash', 'Blast Vest']) {
    await chrome.evaluate(`(() => { const b = [...document.querySelectorAll('.ds-mode')].find((x) => x.textContent.startsWith(${JSON.stringify(name)})); b.scrollIntoView({ block: 'center' }); b.dispatchEvent(new MouseEvent('mouseenter')); return !!b; })()`);
    await sleep(300);
    console.log(await chrome.shot(`../tacticals/loadout-${which}-${name.replace(' ', '-').toLowerCase()}.png`));
  }
  const over = await chrome.evaluate(`document.documentElement.scrollWidth > innerWidth`);
  console.log('overflow', over, 'errors', chrome.errors);
} finally {
  await chrome.close();
}
