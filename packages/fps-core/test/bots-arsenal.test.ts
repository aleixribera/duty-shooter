import { describe, expect, it } from 'vitest';
import { BOT_NAMES, Bot, STATS, Simulation, botProfile, buildNavGraph, createWorld, parseLoadout, sightBlocked, viewDirection, type Loadout, type NavGraph, type PlayerOutput, type SimEvent, type TickOutput, type UserCmd, type Vec3, type WeaponId } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const AREA: [number, number][] = [
  [-60, -60],
  [60, -60],
  [60, 60],
  [-60, 60],
];
const open = createWorld([FLOOR]);
const openNav = buildNavGraph(open, { area: AREA, spacing: 3 });

/** A 1.3 m crate: it hides a crouching player and shows a standing one's head. */
const CRATE = box({ min: [-1, 0, -21], max: [1, 1.3, -19], material: 'wood' });
const crated = createWorld([FLOOR, CRATE]);
const cratedNav = buildNavGraph(crated, { area: AREA, spacing: 3 });

const armed = (primary: WeaponId): Loadout => ({ primary, secondary: 'pistol', grenade: 'frag' });

interface Duel {
  readonly sim: Simulation;
  readonly bot: Bot;
  readonly outputs: TickOutput[];
  /** Steps one tick: the bot thinks (seeing the grenades too), the target does `target`. */
  step(target?: UserCmd): TickOutput;
  readonly self: () => PlayerOutput;
  readonly target: () => PlayerOutput;
}

/** A bot ('b', team 1) carrying `loadout`, and a player ('t', team 2), on `world`. */
function duel(world: ReturnType<typeof createWorld>, nav: NavGraph, at: { bot: Vec3; botYaw?: number; target: Vec3; targetYaw?: number }, loadout: Loadout, name = 'Kestrel'): Duel {
  const sim = new Simulation(world);
  sim.addPlayer({ id: 'b', team: 1, position: at.bot, yaw: at.botYaw ?? 0, loadout });
  sim.addPlayer({ id: 't', team: 2, position: at.target, yaw: at.targetYaw ?? Math.PI });
  const bot = new Bot('b', botProfile(name), nav, world);
  const outputs: TickOutput[] = [];
  let out = sim.output();
  let events: readonly SimEvent[] = [];
  const find = (id: string) => () => (outputs.at(-1) ?? out).players.find((p) => p.id === id)!;
  return {
    sim,
    bot,
    outputs,
    self: find('b'),
    target: find('t'),
    step(target = usercmd({ yaw: at.targetYaw ?? Math.PI })) {
      const self = out.players.find((p) => p.id === 'b')!;
      const cmd = bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events, grenades: out.grenades, isEnemy: (o: PlayerOutput) => o.team !== self.team });
      out = sim.step({ b: cmd, t: target });
      events = out.events;
      outputs.push(out);
      return out;
    },
  };
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const killTick = (outputs: readonly TickOutput[], victim: string) => outputs.findIndex((o) => o.events.some((e) => e.type === 'kill' && e.victim === victim));
const shotsOf = (outputs: readonly TickOutput[]) => outputs.flatMap((o, i) => o.events.filter((e) => e.type === 'shot' && e.shooter === 'b').map((e) => ({ i, e })));

/** Runs until the target dies or `seconds` pass, the target doing `cmd`. */
function fight(d: Duel, seconds: number, cmd?: (i: number) => UserCmd): number {
  for (let i = 0; i < ticks(seconds) && killTick(d.outputs, 't') < 0; i++) d.step(cmd?.(i));
  return killTick(d.outputs, 't');
}

describe('bots with the arsenal', () => {
  it("carry loadouts that suit their personalities, and every weapon turns up", () => {
    const profiles = BOT_NAMES.map((n) => botProfile(n));
    for (const p of profiles) expect(parseLoadout(p.loadout), p.name).toEqual(p.loadout);
    const share = (style: string, weapons: readonly WeaponId[]) => {
      const of = profiles.filter((p) => p.style === style);
      return of.filter((p) => weapons.includes(p.loadout.primary)).length / of.length;
    };
    expect(share('rusher', ['smg', 'shotgun'])).toBeGreaterThanOrEqual(0.75);
    expect(share('anchor', ['sniper', 'm4a1'])).toBeGreaterThanOrEqual(0.75);
    expect(share('anchor', ['sniper'])).toBeGreaterThan(0);
    for (const w of ['m4a1', 'smg', 'shotgun', 'sniper'] as const) expect(profiles.filter((p) => p.loadout.primary === w).length, w).toBeGreaterThanOrEqual(2);
    expect(botProfile('Kestrel').loadout).toEqual(botProfile('Kestrel').loadout);
  });

  it('pushes in with the shotgun and kills from close range', () => {
    const d = duel(open, openNav, { bot: [0, 0, 0], target: [0, 0, -25] }, armed('shotgun'), 'Vandal');
    const k = fight(d, 15);
    expect(k).toBeGreaterThan(0);
    const at = d.outputs[k]!.players;
    expect(flat(at.find((p) => p.id === 'b')!.position, at.find((p) => p.id === 't')!.position)).toBeLessThan(10);
  });

  it('pushes toward a strafing player with the SMG', () => {
    const d = duel(open, openNav, { bot: [0, 0, 0], target: [0, 0, -32] }, armed('smg'), 'Vandal');
    const k = fight(d, 15, (i) => usercmd({ yaw: Math.PI, right: Math.floor(i / 36) % 2 ? 1 : -1 }));
    expect(k).toBeGreaterThan(0);
    const at = d.outputs[k]!.players;
    expect(flat(at.find((p) => p.id === 'b')!.position, at.find((p) => p.id === 't')!.position)).toBeLessThan(26);
  });

  it('holds its distance with the sniper rifle, and fires only stopped and scoped', () => {
    const d = duel(open, openNav, { bot: [0, 0, 0], target: [0, 0, -45] }, armed('sniper'), 'Rook');
    const k = fight(d, 15);
    expect(k).toBeGreaterThan(0);
    for (const { i } of shotsOf(d.outputs.slice(0, k + 1))) {
      const b = d.outputs[Math.max(0, i - 1)]!.players.find((p) => p.id === 'b')!;
      expect(Math.hypot(b.velocity[0], b.velocity[2])).toBeLessThan(0.8);
      expect(b.weapon.ads).toBeGreaterThan(0.85);
    }
    for (const o of d.outputs.slice(0, k + 1)) expect(flat(o.players.find((p) => p.id === 'b')!.position, [0, 0, -45])).toBeGreaterThan(30);
  });

  it('switches to the pistol when the primary runs dry up close, and reloads instead at range', () => {
    const dry = (distance: number) => {
      const d = duel(open, openNav, { bot: [0, 0, 0], target: [150, 0, 150] }, armed('m4a1'));
      for (let i = 0; i < ticks(1.5); i++) d.step();
      const state = d.sim.playerState('b')!;
      state.weapons[0]!.ammo = 0;
      d.sim.setPlayerState(state);
      const b = d.self();
      const dir = viewDirection(b.yaw, 0);
      d.sim.respawn('t', [b.position[0] + dir[0] * distance, 0, b.position[2] + dir[2] * distance], b.yaw + Math.PI);
      for (let i = 0; i < ticks(2); i++) d.step();
      return d;
    };
    const close = dry(6);
    expect(close.outputs.some((o) => o.players.find((p) => p.id === 'b')!.weapon.id === 'pistol')).toBe(true);
    expect(shotsOf(close.outputs).some(({ e }) => e.type === 'shot' && e.weapon === 'pistol')).toBe(true);
    const far = dry(25);
    expect(far.outputs.every((o) => o.players.find((p) => p.id === 'b')!.weapon.id === 'm4a1')).toBe(true);
    expect(far.outputs.some((o) => o.players.find((p) => p.id === 'b')!.weapon.action === 'reload')).toBe(true);
  });

  it('throws a frag that lands within 3 m of an enemy it saw take cover', () => {
    const d = duel(crated, cratedNav, { bot: [0, 0, 0], target: [0, 0, -21.6] }, armed('m4a1'));
    // Standing, the target's head shows over the crate; then it crouches out of sight.
    for (let i = 0; i < ticks(0.4); i++) d.step();
    const crouched = usercmd({ yaw: Math.PI, buttons: ['Crouch'] });
    for (let i = 0; i < ticks(8) && !d.outputs.some((o) => o.events.some((e) => e.type === 'explosion')); i++) d.step(crouched);
    const blast = d.outputs.flatMap((o) => o.events).find((e) => e.type === 'explosion');
    expect(blast?.type).toBe('explosion');
    if (blast?.type !== 'explosion') return;
    expect(blast.thrower).toBe('b');
    expect(flat(blast.point, d.target().position)).toBeLessThan(3);
  });

  it('runs from a live frag dropped near it, out of its reach or behind cover, and stays clear', () => {
    // The target cooks a frag 3 m in front of the bot; shot, it drops it live at its feet.
    const d = duel(open, openNav, { bot: [0, 0, 0], botYaw: 0, target: [0, 0, -3] }, armed('m4a1'), 'Rook');
    // Its next errand takes it just past where the frag will lie.
    d.bot.goTo([0, 0, -6]);
    const cooking = usercmd({ yaw: Math.PI, buttons: ['Grenade'] });
    let blast: SimEvent | undefined;
    for (let i = 0; i < ticks(5) && !blast; i++) blast = d.step(cooking).events.find((e) => e.type === 'explosion');
    expect(blast?.type).toBe('explosion');
    if (blast?.type !== 'explosion') return;
    expect(flat(blast.point, [0, 0, -3])).toBeLessThan(1);
    const dropped = d.outputs.findIndex((o) => o.events.some((e) => e.type === 'grenade' && e.phase === 'drop'));
    expect(dropped).toBeGreaterThan(0);
    const frag: Vec3 = [blast.point[0], blast.point[1] + 0.3, blast.point[2]];
    for (const o of d.outputs.slice(dropped + ticks(1.5))) {
      const b = o.players.find((p) => p.id === 'b')!;
      const eye: Vec3 = [b.position[0], b.position[1] + b.eyeHeight, b.position[2]];
      expect(flat(b.position, frag) >= STATS.grenade.radius.value || sightBlocked(open, frag, eye), `tick ${o.tick}`).toBe(true);
    }
    expect(d.self().alive).toBe(true);
  });
});
