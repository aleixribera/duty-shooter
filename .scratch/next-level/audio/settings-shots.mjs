// Screenshots of the Settings' audio rows at desktop and phone width, and a check that the
// sliders reach the mix. Headless and muted. Needs the dev server.
//   node .scratch/next-level/audio/settings-shots.mjs
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = (name) => new URL(`./ui/${name}`, import.meta.url);
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.sound', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  for (const p of ['Settings', 'Interface']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  const shot = async (name, width, height, mobile) => {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await sleep(700);
    await chrome.evaluate(`(() => { const rows = [...document.querySelectorAll('input[type=range]')]; rows.at(-1)?.scrollIntoView({ block: 'end' }); return rows.length; })()`);
    await sleep(400);
    const png = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(out(name), Buffer.from(png.result.data, 'base64'));
  };
  await shot('settings-audio-desktop.png', 1920, 1080, false);
  await shot('settings-audio-phone.png', 390, 844, true);
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  // The rows as the page has them, then the Music slider moved: does the mix follow, and does it survive a reload's parse?
  const rows = await chrome.evaluate(`JSON.stringify([...document.querySelectorAll('input[type=range]')].slice(-5).map((i) => ({ label: i.closest('label, .row, div')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 60), value: Number(i.value), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) })))`);
  console.log('rows', rows);
  const before = await chrome.evaluate('JSON.stringify(duty.sound.state.mix)');
  await chrome.evaluate(`(() => { const i = [...document.querySelectorAll('input[type=range]')].at(-4); i.value = '0.35'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await sleep(500);
  const after = await chrome.evaluate('JSON.stringify(duty.sound.state.mix)');
  const saved = await chrome.evaluate(`(() => { for (let k = 0; k < localStorage.length; k++) { const v = localStorage.getItem(localStorage.key(k)); if (v && v.includes('musicVolume')) return localStorage.key(k) + ' ' + JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(v)).filter(([key]) => /olume/.test(key)))); } return 'not saved'; })()`);
  console.log('mix before', before, '\nmix after ', after, '\nsaved', saved);
  if (chrome.errors.length) console.log('console errors:', chrome.errors.join(' | '));
} finally {
  await chrome.close();
}
