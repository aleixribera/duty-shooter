import { describe, expect, it } from 'vitest';
import { cardPrompt, roundCardUp, type HudState } from '../src/hud/hud';

const at = (over: object) => ({ message: null, prompt: 'F  Loadout', charge: null, ...over }) as unknown as HudState;
const match = (countdown: number | null, mode = 'tdm', phase = 'playing') => ({ status: { phase, mode }, countdown });

describe('the loadout prompt during the countdown', () => {
  it('goes in the round card while the countdown runs, not under the crosshair', () => {
    const s = at({ match: match(3) });
    expect(roundCardUp(s)).toBe(true);
    expect(cardPrompt(s)).toContain('F  Loadout');
  });

  it('stands on its own once the countdown is over, and in a Battle Royale', () => {
    expect(roundCardUp(at({ match: match(0) }))).toBe(false);
    expect(roundCardUp(at({ match: match(null) }))).toBe(false);
    expect(roundCardUp(at({ match: match(3, 'battle-royale') }))).toBe(false);
    expect(roundCardUp(at({ match: null }))).toBe(false);
  });

  it('goes in the card during a Charge freeze only', () => {
    expect(roundCardUp(at({ match: match(null, 'charge'), charge: { state: { phase: 'freeze' } } }))).toBe(true);
    expect(roundCardUp(at({ match: match(null, 'charge'), charge: { state: { phase: 'live' } } }))).toBe(false);
  });

  it('adds nothing to the card without a prompt, or under a message', () => {
    expect(cardPrompt(at({ match: match(3), prompt: null }))).toBe('');
    expect(cardPrompt(at({ match: match(3), message: 'Connecting' }))).toBe('');
  });
});
