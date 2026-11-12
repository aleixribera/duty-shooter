// Ticket 85: the main menu the moment it appears, before the world has drawn, with the still and without it.
//   node .scratch/next-level/menu-still/look.mjs <out dir> [block]   (block: the still's request fails, as before the fix)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
const block = process.argv[3] === 'block';
const PHONE = process.env.PHONE === '1';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  if (block) { await chrome.send('Network.enable'); await chrome.send('Network.setBlockedURLs', { urls: ['*menu/survival-town.jpg'] }); }
  if (PHONE) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor(`[...document.querySelectorAll('button')].some((b) => /BOT MATCH/i.test(b.innerText))`, 60_000))) throw new Error('no menu');
  const state = () => chrome.evaluate(`JSON.stringify({ game: !!globalThis.duty?.game, drawing: globalThis.duty?.game?.drawing ?? null, t: Math.round(performance.now()) })`);
  const at = [];
  at.push(['menu', await state()]); await shot(`${PHONE ? 'phone-' : ''}menu`);
  if (!(await chrome.waitFor('globalThis.duty?.game?.drawing', 120_000))) throw new Error('world never drew');
  at.push(['drawing', await state()]); await shot(`${PHONE ? 'phone-' : ''}drawing`);
  await sleep(700);
  at.push(['live', await state()]); await shot(`${PHONE ? 'phone-' : ''}live`);
  await sleep(4000);
  at.push(['later', await state()]); await shot(`${PHONE ? 'phone-' : ''}later`);
  at.push(['still', await chrome.evaluate('getComputedStyle(document.body).backgroundImage.slice(0, 40)')]);
  console.log(JSON.stringify(at), chrome.errors.slice(0, 3));
} finally {
  await chrome.close();
}
