import { describe, expect, it } from 'vitest';
import { botMatchSides, type LobbySeat } from '../src/ui/model';

const you: LobbySeat = { number: 1, id: 'you', name: 'You', ping: null, host: true, you: true, bot: false };
const bots = (n: number): LobbySeat[] => Array.from({ length: n }, (_, i) => ({ number: i + 2, id: null, name: 'Bot', ping: null, host: false, you: false, bot: true }));
const sizes = ([blue, orange]: readonly [readonly LobbySeat[], readonly LobbySeat[]]) => [blue.length, orange.length];

describe('a Bot Match’s two sides', () => {
  it('puts you on Blue with three bots against four, in a 4v4', () => {
    const [blue, orange] = botMatchSides([you, ...bots(7)], false);
    expect(blue[0]).toBe(you);
    expect(sizes([blue, orange])).toEqual([4, 4]);
    expect(orange.every((s) => s.bot)).toBe(true);
  });

  it('gives Blue the larger half on an odd count', () => {
    expect(sizes(botMatchSides([you, ...bots(4)], false))).toEqual([3, 2]);
  });

  it('puts every bot on Orange in humans vs bots', () => {
    expect(sizes(botMatchSides([you, ...bots(5)], true))).toEqual([1, 5]);
  });
});
