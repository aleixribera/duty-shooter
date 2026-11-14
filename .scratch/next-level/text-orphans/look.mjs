// Pass 66 (ticket 103): text orphans from review 2026-11-14b. The Profile's shut guns at desktop width, the Loadout's
// optic row on a phone, and the gun game round card (its goal line put into the HUD's round card as the countdown
// renders it), each with the line count of the text the review saw orphaned.
//   node .scratch/next-level/text-orphans/look.mjs <out dir>   (dev server on :5173, `preview_start range`)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// Each matching element's text split into its rendered lines (by the tops of its text's client rects).
const lines = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent).map((e) => { const r = document.createRange(); r.selectNodeContents(e); const rows = []; for (const q of r.getClientRects()) { const top = Math.round(q.top); if (!rows.some((t) => Math.abs(t - top) < 4)) rows.push(top); } return e.innerText.replace(/\\n/g, ' ') + ' => ' + rows.length + ' line(s)'; })`;
const chrome = await launchChrome();
const report = {};
try {
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await desktop();
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);

  if (!(await click('Profile'))) throw new Error('no Profile');
  await sleep(1000);
  await shot('1-profile');
  report.profile = await chrome.evaluate(lines('.ds-prof .gun.shut .who span'));

  await click('Back');
  await sleep(600);
  if (!(await click('Loadout'))) throw new Error('no Loadout');
  await sleep(2500);
  await phone();
  await sleep(1200);
  await chrome.evaluate(`document.querySelector('.ds-smith-tiles[data-slot="optic"]')?.scrollIntoView({ block: 'center' })`);
  await sleep(500);
  await shot('2-loadout-phone');
  report.optic = await chrome.evaluate(lines('.ds-smith-tiles .ds-mode span'));
  await desktop();
  await sleep(800);
  await shot('3-loadout-desktop');

  await click('Done');
  await sleep(600);
  // The round card as the countdown draws it before a gun game (hud.ts), with the card unhidden over the menu's world.
  await chrome.evaluate(`(() => { document.querySelector('.ds-menu')?.setAttribute('hidden', ''); const r = document.querySelector('.ds-round'); let n = r; while (n && n !== document.body) { n.hidden = false; n.style.display = n.style.display === 'none' ? '' : n.style.display; n = n.parentElement; } r.innerHTML = '<div class="sub">Gun game</div><h2 class="count">4</h2><div class="goal">Kills move you up 7 guns: first through them all wins, or the furthest when the clock runs out</div>'; })()`);
  await sleep(500);
  await shot('4-gungame-card');
  report.goal = await chrome.evaluate(lines('.ds-round .goal'));
  await phone();
  await sleep(800);
  await shot('5-gungame-card-phone');
  report.goalPhone = await chrome.evaluate(lines('.ds-round .goal'));
  report.errors = chrome.errors.slice(0, 3);
  console.log(JSON.stringify(report, null, 1));
} finally {
  await chrome.close();
}
