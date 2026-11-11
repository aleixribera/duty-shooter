import { describe, expect, it } from 'vitest';
import { INTERMISSION, type BattleRoyaleState, type ChargeState, type MatchStatus, type PlayerOutput, type Score } from '@duty-shooter/fps-core';
import { chargeHudState, matchCardState, royaleHudState, type ChargeHudContext, type MatchCardContext, type RoyaleHudContext } from '../src/hud/hud-state';

const score = (id: string, team: number, over: object = {}) => ({ id, name: id, team, kills: 0, score: 0, bot: false, ...over }) as unknown as Score;
const player = (id: string, team: number, at: [number, number], over: object = {}) =>
  ({ id, team, kind: 'player', alive: true, downed: null, health: 100, position: [at[0], 0, at[1]], ...over }) as unknown as PlayerOutput;
const NAMES: Record<string, string> = { me: 'Me', mate: 'Mate', pal: 'Pal', foe: 'Foe' };

const royale = (over: Partial<BattleRoyaleState> = {}): BattleRoyaleState => ({
  kind: 'battle-royale',
  squadSize: 3,
  stage: 1,
  circle: { x: 0, z: 0, radius: 300 },
  next: { x: 0, z: 0, radius: 200 },
  shrinkAt: 100,
  shrinkEnd: 150,
  damage: 1,
  alive: 30,
  squads: 10,
  ...over,
});

function royaleCtx(over: Partial<RoyaleHudContext> = {}): RoyaleHudContext {
  return {
    state: royale(),
    selfId: 'me',
    scores: [score('me', 1, { kills: 2 }), score('mate', 1), score('pal', 1), score('foe', 2)],
    nameOf: (id) => NAMES[id] ?? id,
    serverTime: 50,
    self: player('me', 1, [10, 20]),
    watched: null,
    others: [player('mate', 1, [30, 40]), player('pal', 1, [0, 0], { alive: false }), player('foe', 2, [5, 5])],
    forward: [0, 0, -1],
    islandBounds: null,
    mapKey: 'M',
    menuKey: 'Esc',
    mapOpen: false,
    pings: [],
    attacker: null,
    ...over,
  };
}

describe('the Battle Royale HUD', () => {
  it('shows your living Squad on the map from where you stand, and your own kills', () => {
    const hud = royaleHudState(royaleCtx());
    expect(hud.at).toEqual({ x: 10, z: 20 });
    expect(hud.mates.map((m) => m.name)).toEqual(['Mate']);
    expect(hud.kills).toBe(2);
    expect(hud.out).toBe(false);
    expect(hud.seated).toBe(true);
    expect(hud.card).toBeNull();
  });

  it('out of the fight, stands the view where the one you watch stands and leaves them off the mates', () => {
    const hud = royaleHudState(royaleCtx({ self: player('me', 1, [10, 20], { alive: false }), watched: player('mate', 1, [30, 40]) }));
    expect(hud.at).toEqual({ x: 30, z: 40 });
    expect(hud.watching).toBe('Mate');
    expect(hud.mates).toEqual([]);
    expect(hud.out).toBe(true);
  });

  it('knows a late arrival has no seat, and says who leads the kills', () => {
    const hud = royaleHudState(
      royaleCtx({ selfId: 'late', self: null, scores: [score('foe', 2, { kills: 4 })], state: royale({ leader: { id: 'foe', name: 'Foe', team: 2, kills: 4 } } as Partial<BattleRoyaleState>) }),
    );
    expect(hud.seated).toBe(false);
    expect(hud.out).toBe(true);
    expect(hud.leader).toEqual({ name: 'Foe', kills: 4, you: false });
  });

  it('marks you carrying a Reboot Card only while you are alive with it', () => {
    const cards = [{ owner: 'pal', team: 1, carrier: 'me', position: [0, 0, 0], expires: 99 }] as unknown as BattleRoyaleState['cards'];
    expect(royaleHudState(royaleCtx({ state: royale({ cards } as Partial<BattleRoyaleState>) })).carrying).toBe(true);
    expect(royaleHudState(royaleCtx({ state: royale({ cards } as Partial<BattleRoyaleState>), self: player('me', 1, [0, 0], { alive: false }) })).carrying).toBe(false);
  });
});

const charge = (over: Partial<ChargeState> = {}): ChargeState => ({
  kind: 'charge',
  round: 1,
  attackers: 1,
  phase: 'live',
  remaining: 60,
  carrier: null,
  dropped: null,
  planted: null,
  action: null,
  outcome: null,
  ...over,
});

function chargeCtx(over: Partial<ChargeHudContext> = {}): ChargeHudContext {
  return {
    state: charge(),
    self: player('me', 1, [0, 0]),
    selfId: 'me',
    scores: [score('me', 1), score('mate', 1), score('foe', 2)],
    nameOf: (id) => NAMES[id] ?? id,
    others: [player('mate', 1, [1, 1]), player('foe', 2, [5, 5])],
    sites: [
      { id: 'A', min: [0, 0, 0], max: [4, 2, 4] },
      { id: 'B', min: [10, 0, 10], max: [14, 2, 14] },
    ] as unknown as ChargeHudContext['sites'],
    watching: null,
    project: () => ({ x: 1, y: 2, distance: 3 }),
    ...over,
  };
}

describe('the Charge bar', () => {
  it('marks both sites until the plant, then only the planted charge', () => {
    expect(chargeHudState(chargeCtx()).markers.map((m) => m.key)).toEqual(['site-A', 'site-B']);
    expect(chargeHudState(chargeCtx({ state: charge({ planted: { site: 'B', position: [12, 0, 12] } }) })).markers.map((m) => m.key)).toEqual(['planted']);
  });

  it('shows where a dropped charge lies to the attackers only', () => {
    const dropped = charge({ dropped: [3, 0, 3] });
    expect(chargeHudState(chargeCtx({ state: dropped })).markers.some((m) => m.kind === 'charge')).toBe(true);
    expect(chargeHudState(chargeCtx({ state: dropped, self: player('me', 2, [0, 0]) })).markers.some((m) => m.kind === 'charge')).toBe(false);
  });

  it('leaves out a marker the screen has no place for', () => {
    expect(chargeHudState(chargeCtx({ project: () => null })).markers).toEqual([]);
  });

  it('names you as "You" when you carry or act, and the one you watch', () => {
    const hud = chargeHudState(chargeCtx({ state: charge({ carrier: 'me', action: { player: 'mate', kind: 'plant', progress: 0.5 } }), watching: 'mate' }));
    expect(hud).toMatchObject({ attacking: true, carrier: 'You', carrying: true, actor: 'Mate', acting: false, spectating: 'Mate' });
  });
});

const match = (over: Partial<MatchStatus> = {}) => ({ mode: 'battle-royale', phase: 'nuke', phaseEnds: 110, lobby: null, result: null, ...over }) as unknown as MatchStatus;

function cardCtx(over: Partial<MatchCardContext> = {}): MatchCardContext {
  return {
    match: match(),
    selfId: 'me',
    scores: [score('me', 1, { kills: 3, score: 900, place: 2 }), score('foe', 2, { place: 1 })],
    serverTime: 100,
    victoryShowing: false,
    gain: null,
    card: (place, kills) => ({ place, kills }) as never,
    ...over,
  };
}

describe('the match card', () => {
  it('comes at the end of a Battle Royale, after the victory beat, for those with a seat', () => {
    const card = matchCardState(cardCtx())!;
    expect(card.card).toEqual({ place: { place: 2, of: 2 }, kills: 3 });
    expect(card.score).toBe(900);
    expect(matchCardState(cardCtx({ victoryShowing: true }))).toBeNull();
    expect(matchCardState(cardCtx({ selfId: 'late' }))).toBeNull();
    expect(matchCardState(cardCtx({ match: match({ phase: 'playing' }) }))).toBeNull();
    expect(matchCardState(cardCtx({ match: match({ mode: 'tdm' }) }))).toBeNull();
  });

  it('counts down to the next match, through the scoreboard after the Nuke', () => {
    expect(matchCardState(cardCtx())!.next).toBe(`Next match in ${10 + INTERMISSION.scoreboard} s`);
  });

  it('counts down to the lobby on a server with one, and waits for the vote phase only there', () => {
    const lobby = { id: 'l' } as unknown as MatchStatus['lobby'];
    expect(matchCardState(cardCtx({ match: match({ phase: 'vote', lobby, phaseEnds: 105 }) }))!.next).toBe('Back to the lobby in 5 s');
    expect(matchCardState(cardCtx({ match: match({ phase: 'vote' }) }))).toBeNull();
  });
});
