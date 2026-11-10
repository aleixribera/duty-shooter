// Ticket 20 on a phone: the tactical button sits with the others (44 px, 8 px apart, on screen),
// and a tap on it throws the smoke.
//   node .scratch/next-level/tacticals/touch.mjs [width] [height]
import { phone, sleep } from '../touch/lib.mjs';
import { self, visibleControls } from '../touch/play.mjs';

const W = Number(process.argv[2] ?? 844);
const H = Number(process.argv[3] ?? 390);
const p = await phone({ width: W, height: H, query: '?explore=range&nolock', storage: { 'duty-shooter.settings.v1': JSON.stringify({ loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null } }) } });
try {
  if (!(await p.ready())) throw new Error('page did not start');
  if (!(await p.chrome.waitFor('duty.game.player && !duty.game.paused', 240_000))) throw new Error('never playing');
  await sleep(3000);
  // A first touch turns the touch layer on.
  await p.down(1, W * 0.75, H * 0.4);
  await p.up(1);
  await sleep(800);
  // SHOWUSE=1: the Use button shown, as beside a door or a beacon, to check the tactical keeps clear of it.
  if (process.env.SHOWUSE) await p.js(`document.querySelectorAll('.ds-tc [data-c="use"]').forEach((e) => e.removeAttribute('hidden'))`);
  const cs = (await visibleControls(p)).filter((c) => c.name !== 'look' && c.name !== 'stick');
  console.log('controls', cs.map((c) => `${c.name} ${c.w}x${c.h}@${c.x},${c.y}`).join('  '));
  const small = cs.filter((c) => c.w < 44 || c.h < 44);
  const out = cs.filter((c) => c.x < 0 || c.y < 0 || c.x + c.w > W || c.y + c.h > H);
  const near = [];
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      const gap = Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2)) - a.w / 2 - b.w / 2;
      if (gap < 8) near.push(`${a.name}/${b.name} ${gap.toFixed(1)}`);
    }
  console.log('small', small.map((c) => c.name), 'off screen', out.map((c) => c.name), 'near', near);
  console.log(await p.shot(`tactical-${W}x${H}`));
  const before = await p.js('duty.game.player.tacticals');
  const t = cs.find((c) => c.name === 'tactical');
  if (!t) throw new Error('no tactical button');
  await p.down(3, t.x + t.w / 2, t.y + t.h / 2);
  await sleep(300);
  await p.up(3);
  await sleep(1500);
  const after = await p.js('duty.game.player.tacticals');
  console.log('tacticals', before, '->', after, 'grenades', await p.js(`duty.driver.grenades().map((g) => g.kind ?? 'frag')`));
  console.log(await p.shot(`tactical-${W}x${H}-thrown`));
  console.log('errors', p.chrome.errors.slice(0, 5));
} finally {
  await p.chrome.close();
}
