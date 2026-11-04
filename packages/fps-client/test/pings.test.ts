import { describe, expect, it } from 'vitest';
import type { BattleRoyaleState, PingEvent, Vec3 } from '@duty-shooter/fps-core';
import { PingBoard, WHEEL_DEAD, aimPing, pingCallout, wheelPick, type PingAim } from '../src/ui/pings';

const ping = (over: Partial<PingEvent>): PingEvent => ({ type: 'ping', id: 1, kind: 'go', player: 'a', team: 0, position: [0, 0, 0], target: null, until: 20, ...over });

describe('the ping wheel', () => {
  it('picks nothing inside its dead zone, and goes clockwise from up', () => {
    expect(wheelPick(0, 0)).toBeNull();
    expect(wheelPick(WHEEL_DEAD - 1, 0)).toBeNull();
    expect(wheelPick(0, -40)).toBe('enemy');
    expect(wheelPick(40, 0)).toBe('go');
    expect(wheelPick(0, 40)).toBe('defend');
    expect(wheelPick(-40, 0)).toBe('help');
    // Just short of the diagonal still reads as the nearer way.
    expect(wheelPick(30, -32)).toBe('enemy');
    expect(wheelPick(32, -30)).toBe('go');
  });
});

describe('the ping board', () => {
  it('holds each once, gives a seat one place at a time, and lets them run out', () => {
    const board = new PingBoard();
    expect(board.add(ping({ id: 1 }), 'Ann', false)).toBe(true);
    expect(board.add(ping({ id: 1 }), 'Ann', false)).toBe(false);
    board.add(ping({ id: 2, kind: 'enemy', until: 8 }), 'Ann', false);
    board.add(ping({ id: 3, kind: 'defend', position: [5, 0, 5] }), 'Ann', false);
    expect(board.live(0).map((m) => m.id)).toEqual([2, 3]);
    board.add(ping({ id: 4, player: 'b' }), 'Bo', false);
    expect(board.live(0).map((m) => m.id)).toEqual([2, 3, 4]);
    expect(board.live(10).map((m) => m.id)).toEqual([3, 4]);
    expect(board.live(20)).toEqual([]);
    board.add(ping({ id: 5, until: 99 }), 'Ann', false);
    board.clear();
    expect(board.live(0)).toEqual([]);
  });

  it('a feed line says who and where', () => {
    expect(pingCallout('enemy', 'Ann', 'C4')).toBe('Ann: Enemy spotted');
    expect(pingCallout('drop', 'You', 'C4')).toBe('You: Supply Drop in C4');
    expect(pingCallout('help', 'Bo', '')).toBe('Bo: Need help');
  });
});

describe('what a ping marks', () => {
  const eye: Vec3 = [0, 1.6, 0];
  const forward: Vec3 = [0, 0, -1];
  const aim = (over: Partial<PingAim>): PingAim => ({ eye, forward, hit: [0, 0, -30], enemies: [], royale: null, team: 0, ...over });
  const royale = {
    kind: 'battle-royale',
    drops: [{ stage: 1, position: [0.5, 0, -40], announce: 0, lands: 0 }],
    cards: [{ owner: 'x', team: 1, position: [0, 0, -30] }],
    beacons: [{ position: [60, 0, 0] }],
  } as unknown as BattleRoyaleState;

  it('a tap on an enemy marks them; off to the side, the ground', () => {
    const enemies = [{ id: 'e', at: [0.5, 1.2, -20] as Vec3 }];
    expect(aimPing(aim({ enemies }), null)).toEqual({ kind: 'enemy', at: [0.5, 1.2, -20], target: 'e' });
    expect(aimPing(aim({ enemies: [{ id: 'e', at: [10, 1.2, -20] }] }), null)).toEqual({ kind: 'go', at: [0, 0, -30] });
    // Behind a wall closer than them: not seen, so not marked.
    expect(aimPing(aim({ enemies, hit: [0, 1, -5] }), null)).toEqual({ kind: 'go', at: [0, 1, -5] });
  });

  it('a tap near a crate marks the crate; a Card only of your own side', () => {
    expect(aimPing(aim({ royale, hit: [0, 0, -42] }), null)).toEqual({ kind: 'drop', at: [0.5, 0, -40] });
    const aside = { ...royale, drops: [{ stage: 1, position: [20, 0, -40], announce: 0, lands: 0 }] } as unknown as BattleRoyaleState;
    expect(aimPing(aim({ royale: aside, team: 1 }), null)).toEqual({ kind: 'card', at: [0, 0, -30] });
    expect(aimPing(aim({ royale: aside, team: 0 }), null)).toEqual({ kind: 'go', at: [0, 0, -30] });
  });

  it('the wheel marks its choice where the crosshair is; the sky marks nothing', () => {
    expect(aimPing(aim({ royale }), 'defend')).toEqual({ kind: 'defend', at: [0, 0, -30] });
    expect(aimPing(aim({ hit: null }), null)).toBeNull();
    expect(aimPing(aim({ hit: null }), 'help')).toBeNull();
  });
});
