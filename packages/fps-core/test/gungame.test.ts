import { describe, expect, it } from 'vitest';
import { anglesOf, createWorld, zoneCentre, type ModeContext, type ModeEvent, type SimEvent, type SpawnPoint } from '@duty-shooter/fps-core';
import { GUN_GAME_GUNS, GUN_GAME_KILLS_PER_GUN, GunGame } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const WORLD = createWorld([]);

function ctx(matchTime = 0): ModeContext {
  return { tick: 0, time: matchTime, matchTime, players: [], spawns: [], teamSpawns: null, world: WORLD, zones: [], sites: [], using: new Set() };
}

function killed(killer: string | null, victim: string, cause: 'bullet' | 'melee' | 'fall' = 'bullet'): SimEvent {
  return { type: 'kill', killer, victim, cause, zone: cause === 'fall' ? null : 'upperTorso', weapon: cause === 'fall' ? null : 'm4a1' };
}

/** A gun game with players a, b and c. */
function gungame(timeLimit: number | null = 600): GunGame {
  const mode = new GunGame({ timeLimit });
  mode.start(['a', 'b', 'c'].map((id) => ({ id, name: id, team: null })));
  return mode;
}

function progressOf(mode: GunGame, id: string): number {
  return mode.scores().find((s) => s.id === id)!.score;
}

const K = GUN_GAME_KILLS_PER_GUN;

/** `killer` kills `victim` `n` times. */
function kills(mode: GunGame, killer: string, victim: string, n: number): ModeEvent[] {
  return Array.from({ length: n }, () => mode.onEvents([killed(killer, victim)], ctx())).flat();
}

describe('gun game', () => {
  it('starts everyone on the first gun with no grenade, and only free-for-all', () => {
    const mode = gungame();
    expect(mode.loadoutOf('a')).toEqual({ primary: 'm4a1', secondary: 'm4a1', grenade: null });
    expect(mode.loadoutOf('nobody')).toBeNull();
    expect(mode.canDamage({ id: 'a', team: 1, kind: 'player' }, { id: 'b', team: 2, kind: 'player' })).toBe(true);
    expect(mode.killLimit).toBe(GUN_GAME_GUNS.length * K);
  });

  it('runs the ladder from the M4A1 down to the pistol, 3 to 5 kills a gun', () => {
    expect(GUN_GAME_GUNS).toEqual(['m4a1', 'smg', 'shotgun', 'sniper', 'pistol']);
    expect(K).toBeGreaterThanOrEqual(3);
    expect(K).toBeLessThanOrEqual(5);
  });

  it('moves a killer on to the next gun after enough kills, and tells everyone', () => {
    const mode = gungame();
    expect(kills(mode, 'a', 'b', K - 1).some((e) => e.type === 'level')).toBe(false);
    expect(mode.loadoutOf('a')?.primary).toBe('m4a1');
    expect(kills(mode, 'a', 'b', 1)).toContainEqual<ModeEvent>({ type: 'level', player: 'a', level: 1, weapon: 'smg', demoted: false });
    expect(mode.loadoutOf('a')?.primary).toBe('smg');
    expect(mode.loadoutOf('b')?.primary).toBe('m4a1');
    expect(mode.scores()[0]).toMatchObject({ id: 'a', kills: K, score: K });
  });

  it("a melee kill knocks the victim back a gun's worth of kills; falls and suicides move nobody", () => {
    const mode = gungame();
    kills(mode, 'b', 'c', K + 1);
    const out = mode.onEvents([killed('a', 'b', 'melee')], ctx());
    expect(out).toContainEqual<ModeEvent>({ type: 'level', player: 'b', level: 0, weapon: 'm4a1', demoted: true });
    expect(progressOf(mode, 'b')).toBe(1);
    expect(progressOf(mode, 'a')).toBe(1);
    mode.onEvents([killed(null, 'a', 'fall'), killed('c', 'c')], ctx());
    expect(progressOf(mode, 'a')).toBe(1);
    expect(progressOf(mode, 'c')).toBe(0);
    // Nobody drops below the start.
    mode.onEvents([killed('b', 'b'), killed('a', 'b', 'melee')], ctx());
    expect(progressOf(mode, 'b')).toBe(0);
  });

  it('finishing the last gun wins, and nothing scores after', () => {
    const mode = gungame();
    kills(mode, 'a', 'b', mode.killLimit - 1);
    expect(mode.loadoutOf('a')?.primary).toBe('pistol');
    expect(mode.result(ctx())).toBeNull();
    mode.onEvents([killed('a', 'c')], ctx());
    expect(mode.result(ctx())).toEqual({ winner: 'a', winnerName: 'a', draw: false, reason: 'killLimit' });
    expect(progressOf(mode, 'a')).toBe(mode.killLimit);
    expect(kills(mode, 'b', 'c', K).some((e) => e.type === 'level')).toBe(false);
  });

  it('at the time limit the furthest up the ladder wins, then more kills, then fewer deaths, and a full tie is a draw', () => {
    const ahead = gungame(60);
    ahead.onEvents([killed('b', 'a'), killed('b', 'a'), killed('a', 'b', 'melee'), killed('c', 'a')], ctx());
    // b: 0 up the ladder with 2 kills; a and c: 1 with 1 kill each, but a died three times.
    expect(ahead.result(ctx(60))).toMatchObject({ winner: 'c', draw: false, reason: 'timeLimit' });
    const level = gungame(60);
    expect(level.result(ctx(60))).toMatchObject({ winner: null, draw: true });
  });

  it('a player back from a drop keeps their place on the ladder', () => {
    const mode = gungame();
    kills(mode, 'a', 'b', K + 2);
    const row = mode.scores().find((s) => s.id === 'a')!;
    mode.leave('a');
    mode.rejoin(row);
    expect(progressOf(mode, 'a')).toBe(K + 2);
    expect(mode.loadoutOf('a')?.primary).toBe('smg');
  });
});

describe('gun game on the server', () => {
  const LANE: readonly SpawnPoint[] = [
    { position: [0, 0, 0], yaw: 0 },
    { position: [0, 0, -12], yaw: Math.PI },
    { position: [30, 0, -30], yaw: Math.PI },
  ];

  function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
    return names.map((n) => {
      const c = m.join(n);
      for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
      expect(c.client.status).toBe('joined');
      return c;
    });
  }

  /** `shooter` fires at `victim` until the server reports a kill, up to 5 s. */
  function kill(m: NetworkedMatch, shooter: NetworkedClient, victim: NetworkedClient): boolean {
    let aim = { yaw: 0, pitch: 0 };
    for (let i = 0; i < ticks(5); i++) {
      const me = shooter.client.self;
      const seen = shooter.client.others().find((p) => p.id === victim.client.id);
      if (!me || !seen) {
        m.step();
        continue;
      }
      const centre = zoneCentre(seen, 'upperTorso');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      const out = m.step({ [shooter.name]: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) });
      if (out.events.some((e) => e.type === 'kill' && e.victim === victim.client.id)) return true;
    }
    return false;
  }

  function weaponOf(m: NetworkedMatch, c: NetworkedClient) {
    return m.server.latest.players.find((p) => p.id === c.client.id)!;
  }

  it('hands everyone the ladder gun whatever they picked, and re-arms a killer on the spot', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: LANE, mode: 'gungame' });
    const a = m.join('a', { loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag' } });
    for (let i = 0; i < ticks(3) && !a.latest?.self; i++) m.step();
    const [b] = joinAll(m, 'b');
    expect(weaponOf(m, a).loadout).toEqual({ primary: 'm4a1', secondary: 'm4a1', grenade: null });
    expect(weaponOf(m, a).grenades).toBe(0);
    // The last kill on the M4A1 moves a on to the SMG, in hand at once.
    for (let k = 1; k <= GUN_GAME_KILLS_PER_GUN; k++) {
      for (let i = 0; i < ticks(5) && !weaponOf(m, b!).alive; i++) m.step();
      expect(kill(m, a, b!)).toBe(true);
      m.step();
      expect(weaponOf(m, a).weapon.id).toBe(k < GUN_GAME_KILLS_PER_GUN ? 'm4a1' : 'smg');
    }
    expect(weaponOf(m, a).alive).toBe(true);
    expect(m.server.mode.scores().find((s) => s.id === a.client.id)).toMatchObject({ kills: GUN_GAME_KILLS_PER_GUN, score: GUN_GAME_KILLS_PER_GUN });
  });
});
