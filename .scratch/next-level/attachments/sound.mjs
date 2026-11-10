// Ticket 19: a suppressed shot reaches the sound system with its muzzle device (the voice dulls it and shortens its reach).
//   node .scratch/next-level/attachments/sound.mjs
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: { muzzle: 'suppressor' } } };
const SEED = `(() => { try { const k = 'duty-shooter.settings.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.loadout = ${JSON.stringify(loadout)}; localStorage.setItem(k, JSON.stringify(s)); } catch {} })()`;
const PAD = `(() => { const pad = (window.__pad = { buttons: Array(18).fill(0), axes: [0, 0, 0, 0] });
  navigator.getGamepads = () => [{ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: pad.axes.slice(), buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })) }];
  Document.prototype.hasFocus = () => true; })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PAD });
  await chrome.navigate(`${BASE}?explore=range&nolock`);
  if (!(await chrome.waitFor('window.duty?.game?.player && !duty.game.paused', 240_000))) throw new Error('never playing');
  await sleep(2500);
  for (const v of [1, 0, 1, 0]) { await chrome.evaluate(`__pad.buttons[3] = ${v}`); await sleep(250); }
  await sleep(1000);
  await chrome.evaluate('__pad.buttons[7] = 1');
  await sleep(400);
  await chrome.evaluate('__pad.buttons[7] = 0');
  await sleep(300);
  const found = await chrome.evaluate(`(() => { const seen = []; const walk = (o, d) => { if (!o || d > 3 || typeof o !== 'object') return; for (const k of Object.keys(o)) { try { const v = o[k]; if (Array.isArray(v) && v[0]?.event && v[0]?.params) seen.push(v); else walk(v, d + 1); } catch {} } }; walk(window.duty, 0); const log = seen[0] ?? []; return JSON.stringify(log.filter((e) => e.event === 'gunshot').slice(-3).map((e) => e.params)); })()`);
  console.log('gunshots', found);
} finally {
  await chrome.close();
}
