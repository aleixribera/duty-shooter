// Review 2026-11-13a, defect 1: teammates' tags pinned round the screen's edges, over the health, the feed and the gun.
// A team Bot Match, looking round from the spawn at desktop and phone width: how many ally tags hold an edge.
//   node .scratch/next-level/ally-edges/look.mjs <out dir> [map button] [mode button]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, map = 'Switchyard', mode = 'Team deathmatch'] = process.argv.slice(2);
if (!out) throw new Error('usage: look.mjs <out dir> [map] [mode]');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate('http://localhost:5173/?nolock&seed=5');
  if (!(await chrome.waitFor('globalThis.duty?.game', 120_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', map, mode, 'Mixed teams', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 240_000))) throw new Error('match did not start');
  // Past the opening count, with the bots spread out.
  await sleep(Number(process.env.WAIT ?? 9000));
  const report = [];
  const look = async (label) => {
    for (let k = 0; k < 4; k++) {
      const yaw = (k * Math.PI) / 2;
      await chrome.evaluate(`duty.game.input.setAngles(${yaw}, 0), 1`);
      await sleep(600);
      const tags = JSON.parse(
        await chrome.evaluate(`JSON.stringify([...document.querySelectorAll('.ds-ally')].map((e) => ({ edge: e.classList.contains('edge'), name: e.querySelector('.name')?.innerText ?? null })))`),
      );
      report.push({ at: `${label}-${k}`, tags: tags.length, edge: tags.filter((t) => t.edge).length, names: tags.map((t) => `${t.name ?? '-'}${t.edge ? '@edge' : ''}`) });
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      writeFileSync(`${out}/${label}-yaw-${k}.jpg`, Buffer.from(s.result.data, 'base64'));
    }
  };
  await look('desktop');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  await look('phone');
  for (const r of report) console.log(JSON.stringify(r));
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
