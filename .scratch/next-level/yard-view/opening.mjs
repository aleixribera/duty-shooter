// A Survival Town team Bot Match's first look, several times over: which yard the player's team starts in, and its frame.
//   node .scratch/next-level/yard-view/opening.mjs <out dir> [runs] [mode label]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const [out, runsArg = '4', mode = 'Team deathmatch'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  });
  return r.result?.result?.value === true;
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const rows = [];
  for (let run = 0; run < Number(runsArg); run++) {
    await chrome.navigate('http://localhost:5173/?nolock');
    if (!(await chrome.waitFor(`!!globalThis.duty?.game && !!globalThis.duty?.sound`, 120_000))) throw new Error('page did not start');
    await sleep(1500);
    for (const p of ['Bot Match', 'Survival Town', mode]) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    await click('Mixed teams');
    await sleep(300);
    if (!(await click('Start'))) throw new Error('no Start button');
    if (!(await chrome.waitFor(`!!duty.driver?.match && !!duty.game?.player`, 120_000))) throw new Error('match did not start');
    await sleep(2500);
    const where = JSON.parse(await chrome.evaluate(`JSON.stringify({ p: duty.game.player.position ?? duty.game.player.state?.position ?? null, phase: duty.driver.match.phase })`));
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/run${run}.jpg`, Buffer.from(s.result.data, 'base64'));
    const z = where.p?.[2] ?? where.p?.z;
    rows.push({ run, phase: where.phase, position: where.p, yard: z === undefined ? '?' : z < 0 ? 'south (z<0)' : 'north (z>0)' });
    console.log(JSON.stringify(rows.at(-1)));
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
