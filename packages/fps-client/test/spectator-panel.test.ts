import { describe, expect, it } from 'vitest';
import { spectatorPanelHtml, spectatorNotice, type SpectatorPanelState } from '../src/hud/spectator-panel';

const state = (over: Partial<SpectatorPanelState> = {}): SpectatorPanelState => ({
  name: 'Mate',
  bot: false,
  health: 74.4,
  downed: false,
  kills: 3,
  group: 'Squad',
  mates: [
    { name: 'Ada', state: 'out' },
    { name: 'Bo', state: 'downed' },
  ],
  index: 2,
  of: 5,
  view: 'follow',
  notice: null,
  keys: { prev: 'RMB', next: 'LMB', view: 'Space' },
  ...over,
});

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the spectator panel (ticket 32)', () => {
  it('says who you watch, their health and kills, and their Squad', () => {
    const t = text(spectatorPanelHtml(state()));
    expect(t).toContain('Watching');
    expect(t).toContain('Mate');
    expect(t).toContain('74');
    expect(t).toMatch(/3\s+Kills/);
    expect(t).toContain('Squad');
    expect(t).toMatch(/Ada\s+Out/);
    expect(t).toMatch(/Bo\s+Downed/);
    expect(t).toContain('2 / 5');
  });

  it('says one kill in the singular, and when you are back beside "Watching" (ticket 110)', () => {
    expect(text(spectatorPanelHtml(state({ kills: 1 })))).toMatch(/\b1\s+Kill\s+Squad/);
    expect(text(spectatorPanelHtml(state({ back: 'Back next round' })))).toMatch(/Watching\s+2 \/ 5\s+Back next round/);
    expect(text(spectatorPanelHtml(state()))).not.toContain('Back next round');
  });

  it('marks a bot, and a Downed player by word as well as colour', () => {
    const t = text(spectatorPanelHtml(state({ bot: true, downed: true, health: 30 })));
    expect(t).toContain('Bot');
    expect(t).toContain('Downed');
    expect(spectatorPanelHtml(state({ downed: true }))).toContain('downed');
  });

  it('shows the keys to step and to change the view, naming what the view key does', () => {
    const follow = text(spectatorPanelHtml(state()));
    expect(follow).toMatch(/RMB\s+Previous/);
    expect(follow).toMatch(/LMB\s+Next/);
    expect(follow).toMatch(/Space\s+Their view/);
    expect(text(spectatorPanelHtml(state({ view: 'eyes' })))).toMatch(/Space\s+Follow/);
  });

  it('with only one to watch, leaves out the stepping keys', () => {
    const t = text(spectatorPanelHtml(state({ index: 1, of: 1 })));
    expect(t).not.toContain('Previous');
    expect(t).not.toContain('Next');
  });

  it('says who put the last one out when it moves on', () => {
    expect(spectatorNotice('Bo', 'Carl')).toMatch(/^Bo\b.*\bCarl\b/);
    expect(spectatorNotice('Bo', null)).toMatch(/^Bo\b/);
    expect(spectatorNotice('Bo', null)).not.toContain('Carl');
    expect(text(spectatorPanelHtml(state({ notice: 'Bo was eliminated by Carl' })))).toContain('Bo was eliminated by Carl');
  });

  it('escapes names', () => {
    expect(spectatorPanelHtml(state({ name: '<b>x' }))).not.toContain('<b>x');
  });
});
