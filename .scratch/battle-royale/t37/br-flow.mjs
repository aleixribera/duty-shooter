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

  await joinRoyale(keeper, 'Keeper', 0);
  await L.sleep(1500);
  await L.click(host, 'Start match');
  await host.must(`duty.game.driver?.match?.phase === 'playing'`, 60000);
  for (const c of [host, phone, keeper]) {
    await c.must(`[...document.querySelectorAll('button')].some((b) => /Join the match|Watch the match/.test(b.textContent) && !b.disabled) || (duty.game.player?.alive && !duty.game.paused)`, 120000, 500);
    if (await L.has(c, 'Join the match')) await L.click(c, 'Join the match');
  }
  L.log('in the match');
  await L.sleep(22000);
  await L.tap(keeper, 'KeyC');
  L.log('host', JSON.stringify(await L.state(host)));
  await shot(host, 't46', 'host-alive-1920');
  await shot(phone, 't45', 'phone-in-match');
  L.log('phone top', await rects(phone, ['.ds-stats', '.ds-br-top', '.ds-ringline', '.ds-health .bar', '.ds-ammo .bar']));

  // A late arrival: never in the match.
  late = await L.open('late', { url: URL_, width: 1920, height: 1080 });
  await joinRoyale(late, 'Late', 0);
  await L.sleep(1500);
  await shot(late, 't43', 'late-br-screen');
  L.log('late buttons', await L.buttons(late));
  if (await L.has(late, 'Watch the match')) await L.click(late, 'Watch the match');
  else if (await L.has(late, 'Join the match')) await L.click(late, 'Join the match');
  await L.sleep(1500);
  await shot(late, 't43', 'late-watching');
  L.log('late out card', await text(late, '.ds-out'), '| watch', await text(late, '.ds-watch'));

  // The phone keeps moving meanwhile, so a person stays in the match after the host is out.
  let hostOut = false;
  // It crouches where it landed, as the keeper does (wandering, it once walked into the sea).
  await L.tap(phone, 'KeyC');
  const moving = Promise.resolve();
  // The host cooks a frag in hand until it goes off (a Solo has no Squad to go Downed for).
  await L.keyDown(host, 'KeyG');
  await L.sleep(5000);
  await L.keyUp(host, 'KeyG');
  await L.sleep(800);
  L.log('host after the frag', JSON.stringify(await L.state(host)));
  // Failing that, it runs out of the Ring and stays out until it puts them out.
  const t0 = Date.now();
  while (Date.now() - t0 < 6 * 60_000) {
    const st = await L.state(host);
    if (!st.alive && !st.downed) break;
    // Straight away from the Ring's centre: out of it soonest.
    const want = await host.evaluate(`(() => { const o = duty.game.driver.match.objective; const p = duty.game.player.position; return Math.atan2(-(p[0] - o.circle.x), -(p[2] - o.circle.z)); })()`);
    for (let k = 0; k < 12; k++) {
      const yaw = await host.evaluate('duty.game.player.yaw');
      let d = want - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 0.05) break;
      await L.look(host, -d * 400, 0, 2);
    }
    await L.keyDown(host, 'KeyW');
    await L.keyDown(host, 'ShiftLeft');
    await L.sleep(6000);
    await L.keyUp(host, 'ShiftLeft');
    await L.keyUp(host, 'KeyW');
    L.log('running', JSON.stringify({ hp: st.hp, pos: st.pos, outside: await host.evaluate(`document.querySelector('.ds-outside')?.style.display !== 'none'`) }));
  }
  hostOut = true;
  L.log('phone', JSON.stringify(await L.state(phone)), 'keeper', JSON.stringify(await L.state(keeper)));
  L.log('host after the Ring', JSON.stringify(await L.state(host)));
  await L.sleep(1200);
  await shot(host, 't46', 'host-out-1920');
  L.log('host out', await rects(host, ['.ds-health', '.ds-ammo', '.ds-out', '.ds-watch']));
  await L.sleep(7000);
  await shot(host, 't47', 'host-watching-1920');
  L.log('watch bar', await text(host, '.ds-watch'));
  await L.tap(host, 'Escape');
  await L.sleep(1500);
  await shot(host, 't47', 'host-after-esc-1920');
  L.log('after esc', JSON.stringify({ menu: await host.evaluate('duty.menu.open + " " + duty.menu.screen'), buttons: await L.buttons(host) }));
  await L.tap(host, 'Escape');
  await L.sleep(800);

  // The host reloads and comes back to the Battle Royale screen.
  await host.navigate(URL_);
  await host.must(`location.protocol.startsWith('http') && performance.now() > 0`, 60000, 200);
  await joinRoyale(host, 'WWWWWWWWWWWWWWWW', 0);
  await L.sleep(2000);
  await shot(host, 't48', 'host-after-reload');
  L.log('host back', await text(host, '.ds-royale .ds-state'), '|', await L.buttons(host));
  const go = (await L.has(host, 'Join the match')) ? 'Join the match' : (await L.has(host, 'Watch the match')) ? 'Watch the match' : null;
  if (go) await L.click(host, go);
  await L.sleep(2500);
  await shot(host, 't48', 'host-rejoined');
  L.log('host rejoined', await rects(host, ['.ds-health', '.ds-ammo', '.ds-out', '.ds-watch']));
  await moving;
  await shot(phone, 't45', 'phone-in-match-later');
  L.log('phone alive', JSON.stringify(await L.state(phone)));
} finally {
  for (const c of [host, phone, late, keeper]) await c?.close();
}
