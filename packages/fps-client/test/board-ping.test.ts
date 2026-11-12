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
