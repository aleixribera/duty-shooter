import { describe, expect, it } from 'vitest';
import type { Score } from '@duty-shooter/fps-core';
import { boardHtml, type HudState } from '../src/hud/hud';

const score = (id: string, team: number, bot: boolean) => ({ id, name: id, team, kills: 0, deaths: 0, assists: 0, score: 0, bot }) as unknown as Score;
const state = (pings: Record<string, number>) =>
  ({ scores: [score('me', 1, false), score('a', 1, true), score('b', 2, true)], pings, selfId: 'me', match: { status: { mode: 'tdm', teamScores: null, killLimit: 75 } } }) as unknown as HudState;

describe('the scoreboard’s ping column', () => {
  it('is left out when nobody has a ping, as against bots', () => {
    expect(boardHtml(state({}))).not.toContain('Ping');
  });

  it('shows when anyone has one, with a dash for those who don’t', () => {
    const html = boardHtml(state({ me: 42 }));
    expect(html).toContain('<th>Ping</th>');
    expect(html).toContain('>42<');
    expect(html).toContain('class="ping">–<');
  });
});

describe('the scoreboard’s lead column', () => {
  const row = (id: string, kills: number, score: number) => ({ id, name: id, team: 1, kills, deaths: 0, assists: 0, score, bot: true }) as unknown as Score;
  const board = (mode: string) =>
    boardHtml({ scores: [row('a', 9, 900), row('b', 8, 1200)], pings: {}, selfId: 'a', match: { status: { mode, teamScores: null, killLimit: 30 } } } as unknown as HudState);
  const firstStat = (html: string) => /<th>Player<\/th>(<th>.*?<\/th>)/.exec(html)?.[1] ?? '';

  it('is Kills, first and in bold, in a free-for-all, which ranks by kills', () => {
    const html = board('ffa');
    expect(firstStat(html)).toContain('Kills');
    expect(html).toContain('<td class="lead">9</td><td>900</td>');
  });

  it.each(['tdm', 'battle-royale'])('is Score in %s, which ranks by Score', (mode) => {
    const html = board(mode);
    expect(firstStat(html)).toBe('<th>Score</th>');
    expect(html).toContain('<td class="lead">1,200</td><td>8</td>');
  });
});
