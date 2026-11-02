// Tickets 49 and 51, the lobby part of br-flow.mjs alone.
// Tickets 37-51: the Battle Royale screens and HUD states, before and after.
// Needs Vite on 5241 proxying to a server on 3241 (see t37/README in the ticket comments).
// Usage: node .scratch/battle-royale/t37/br-flow.mjs <tag> [squads=1|2]
//   lobby (host desktop + phone friend, 16-character names), in match (both widths, ping on),
//   the host out by a grenade cooked in hand, Esc while watching, a late arrival, and the host
//   reloading and coming back.
import * as L from '../bugs/lib.mjs';

const tag = process.argv[2] ?? 'before';
const squads = Number(process.argv[3] ?? 1);
const URL_ = 'http://localhost:5241/?online&nolock';
const shot = (c, t, name) => L.shoot(c, `${t}/${tag}-${name}`);
const rects = (c, sels) =>
  c.evaluate(
    `JSON.stringify(${JSON.stringify(sels)}.map((q) => [...document.querySelectorAll(q)].filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return q + ' ' + Math.round(r.x) + '..' + Math.round(r.right) + ' y' + Math.round(r.y) + '..' + Math.round(r.bottom) + ' ' + JSON.stringify(e.innerText.replace(/\\s+/g, ' ').slice(0, 60)); })).flat())`,
  );
const text = (c, sel) => L.text(c, sel);

async function joinRoyale(c, name, size) {
  await c.must(`!!duty.menu && duty.menu.open`, 60000);
  await L.sleep(1500);
  await L.click(c, 'Battle Royale');
  await c.must(`!![...document.querySelectorAll('.ds-royale input[name=name]')].find((i) => i.getClientRects().length)`, 30000);
  await c.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name=name]'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  if (size) await L.click(c, size === 1 ? 'Solos' : size === 2 ? 'Duos' : 'Trios').catch(() => {});
  await c.must(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Join server' && !b.disabled)`, 30000);
  await L.click(c, 'Join server');
  await c.must(`duty.game?.driver?.match?.lobby && !!document.querySelector('.ds-royale:not([hidden]) .ds-state')`, 120000, 500);
}

const host = await L.open('host', { url: URL_, width: 1920, height: 1080 });
const phone = await L.open('phone', { url: URL_, phone: true });
let late = null;
const keeper = await L.open('keeper', { url: URL_, width: 1280, height: 720 });
try {
  await joinRoyale(host, 'WWWWWWWWWWWWWWWW', squads);
  await L.sleep(1500);
  await joinRoyale(phone, 'MMMMMMMMMMMMMMMM', 0);
  // The phone player starts its own Squad so the host's shows under Other Squads.
  if (squads > 1) await L.click(phone, 'Start a new Squad').catch(() => L.log('no new squad button'));
  await L.sleep(2500);
  L.log('phone scrollWidth', await phone.evaluate('document.documentElement.scrollWidth + "/" + innerWidth + " body " + document.body.scrollWidth'));
  L.log('phone lobby', await rects(phone, ['.ds-royale h2', '.ds-royale .ds-state', '.ds-royale .squad .who', '.ds-royale footer .big']));
  await shot(phone, 't51', 'phone-br-lobby');
  await shot(phone, 't49', 'phone-long-names-lobby');
  await shot(host, 't49', 'desktop-long-names-lobby');

} finally {
  for (const c of [host, phone, late, keeper]) await c?.close();
}
