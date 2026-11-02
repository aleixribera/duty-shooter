// Ticket 13: Play Online and a Battle Royale at once, from the page's own server
// (which starts the Battle Royale process on demand). Two muted headless Chromes:
// one joins Play Online and starts its match, the other opens the Battle Royale
// screen, joins and starts a match with 59 bots. Prints what /status, /royale/status
// and /healthz report along the way, and screenshots both.
// Usage: node .scratch/battle-royale/process/both-at-once.mjs [base=http://127.0.0.1:3011/] [tag=local] [dev] [api=base]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:3011/';
const tag = process.argv[3] ?? 'local';
/** A dev page (Vite, with the dev hooks and ?nolock) plays the matches; a production page joins them. */
const dev = process.argv[4] === 'dev';
/** The server's own endpoints: through the page's origin unless given. */
const api = process.argv[5] ?? base;
const out = '.scratch/battle-royale/process/shots';
mkdirSync(out, { recursive: true });
const get = async (path) => {
  const res = await fetch(new URL(path, api), { cache: 'no-store' });
  return `${res.status} ${await res.text()}`;
};
const find = (text) => `[...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())}))`;
const until = async (test, ms) => {
  const end = Date.now() + ms;
  while (!(await test())) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(250);
  }
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function open(name) {
  const chrome = await launchChrome();
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  const wait = chrome.waitFor.bind(chrome);
  chrome.waitFor = async (expression, ms, every) => {
    const v = await wait(expression, ms, every);
    if (!v) throw new Error(`${name}: timed out waiting for ${expression.slice(0, 120)}`);
    return v;
  };
  await chrome.navigate(`${base}${dev ? '?online&nolock' : ''}`);
  await chrome.waitFor(`location.protocol.startsWith('http') && performance.now() > 0`, 60_000, 200);
  await chrome.waitFor(`!!${find('Battle Royale')} && document.body.dataset.backend`, 120_000, 250);
  await chrome.evaluate(`(() => { const i = document.querySelector('input[aria-label="Name"]'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('change')); })()`);
  return chrome;
}

async function click(chrome, text) {
  const box = JSON.parse((await chrome.evaluate(`(() => { const b = ${find(text)}; if (!b || b.disabled) return 'null'; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`)) ?? 'null');
  if (!box) throw new Error(`no enabled button "${text}"`);
  for (const type of ['mousePressed', 'mouseReleased']) await chrome.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  log(`clicked "${text}"`);
}

async function shoot(chrome, name) {
  const { data } = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })).result;
  const file = `${out}/${tag}-${name}.jpg`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  log(file);
}

const online = await open('Online');
const royale = await open('Royale');
try {
  log('healthz', await get('healthz'));
  // Play Online first: its match under way before the Battle Royale process exists.
  await click(online, 'Play Online');
  // With a name already set, Play Online joins at once and lands in the lobby (or a match under way).
  // A match already under way (someone else's) is joined as it is; an empty server's lobby waits for Start.
  const playing = async () => JSON.parse((await get('status')).slice(4)).phase === 'playing';
  await until(async () => (await playing()) || (await online.evaluate(`!!(${find('Start')})`)), 120_000);
  if (!(await playing())) await click(online, 'Start');
  await until(playing, 60_000);
  // Into the match: the host goes in by itself once the map is lit; the button does it too.
  await sleep(3000);
  if (await online.evaluate(`!!${find('Join the match')}`)) await click(online, 'Join the match');
  // A production page can't take the pointer headless, so it stays seated on the lobby page; a dev page (?online&nolock) plays.
  if (dev) await online.waitFor(`duty.driver?.match?.phase === 'playing' && !duty.game.paused`, 60_000, 200);
  log('Play Online is playing; /status', await get('status'));

  const t0 = Date.now();
  await click(royale, 'Battle Royale');
  await royale.waitFor(`!!${find('Join server')}`, 30_000, 200);
  log('Battle Royale screen up; /royale/status', await get('royale/status'));
  await shoot(royale, '01-royale-screen');
  await click(royale, 'Join server');
  await royale.waitFor(`!!${find('Start match')}`, 120_000, 100);
  log(`Battle Royale lobby after ${Date.now() - t0} ms from opening its screen`);
  await click(royale, 'Start match');
  await until(async () => JSON.parse((await get('royale/status')).slice(4)).phase === 'playing', 60_000);
  // The host goes in by itself once the island is lit; the button does it too.
  await sleep(3000);
  if (await royale.evaluate(`!!${find('Join the match')}`)) await click(royale, 'Join the match');
  if (dev) await royale.waitFor(`duty.driver?.match?.phase === 'playing' && !duty.game.paused`, 120_000, 200);
  log('Battle Royale is playing');
  await sleep(8000);
  log('/status', await get('status'));
  log('/royale/status', await get('royale/status'));
  log('/healthz', await get('healthz'));
  await shoot(online, '02-online-playing');
  await shoot(royale, '03-royale-playing');
  const errors = [...online.errors, ...royale.errors];
  if (dev) {
    const seen = async (c) => JSON.parse(await c.evaluate(`JSON.stringify({ status: duty.driver.status, mode: duty.driver.match?.mode, map: duty.driver.match?.map, phase: duty.driver.match?.phase, seats: duty.driver.scores.length, alive: duty.game.player?.alive })`));
    log('Play Online page sees', JSON.stringify(await seen(online)));
    log('Battle Royale page sees', JSON.stringify(await seen(royale)));
  } else {
    const line = (c) => c.evaluate(`[...document.querySelectorAll('.ds-lobby, .ds-royale')].filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 300)).join(' | ')`);
    log('Play Online page:', await line(online));
    log('Battle Royale page:', await line(royale));
  }
  if (errors.length) log('page errors:', errors.slice(0, 8));
} catch (error) {
  await shoot(online, 'fail-online');
  await shoot(royale, 'fail-royale');
  log('online buttons', await online.evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0).map((b) => b.textContent.trim().slice(0, 30)))`));
  throw error;
} finally {
  await online.close();
  await royale.close();
}
