import { describe, expect, it } from 'vitest';
import { INTERMISSION, type MatchStatus } from '@duty-shooter/fps-core';
import { Scene, Sprite } from 'three/webgpu';
import { DETONATION, Nuke, SHOCK_SPEED, nukeFrame, sinceMatchEnd } from '../src/nuke';

const status = (phase: MatchStatus['phase'], phaseEnds: number | null) => ({ phase, phaseEnds }) as MatchStatus;

describe('the nuke clock', () => {
  it('runs from the end of the match, through the nuke and the vote, and stops at the next match', () => {
    expect(sinceMatchEnd(status('playing', 600), 300)).toBeNull();
    expect(sinceMatchEnd(null, 300)).toBeNull();
    // The nuke phase ends 6 s after the match did.
    expect(sinceMatchEnd(status('nuke', 106), 101)).toBeCloseTo(1);
    // The vote ends 20 s after it.
    expect(sinceMatchEnd(status('vote', 120), 110)).toBeCloseTo(10);
    expect(INTERMISSION.nuke + INTERMISSION.vote).toBe(20);
  });

  it("runs on through a lobby's shorter scoreboard without a jump", () => {
    const lobby = (phase: MatchStatus['phase'], phaseEnds: number) => ({ phase, phaseEnds, lobby: {} }) as MatchStatus;
    // The match ended at 100: the nuke ends at 106, the scoreboard at 116.
    expect(sinceMatchEnd(lobby('nuke', 106), 105.9)).toBeCloseTo(5.9);
    expect(sinceMatchEnd(lobby('vote', 116), 106.1)).toBeCloseTo(6.1);
  });
});

describe('the nuke timeline', () => {
  it('sounds the siren before anything is seen', () => {
    const f = nukeFrame(DETONATION - 0.1, 450);
    expect(f.flash).toBe(0);
    expect(f.grade).toBe(0);
    expect(f.shake).toBe(0);
  });

  it('flashes white at detonation and lets the flash fade within two seconds', () => {
    expect(nukeFrame(DETONATION + 0.06, 450).flash).toBeGreaterThan(0.9);
    expect(nukeFrame(DETONATION + 2, 450).flash).toBeLessThan(0.05);
  });

  it('grades the picture from the detonation on, and keeps it graded through the vote', () => {
    expect(nukeFrame(DETONATION + 1.5, 450).grade).toBeGreaterThan(0.9);
    expect(nukeFrame(INTERMISSION.nuke + INTERMISSION.vote - 0.1, 450).grade).toBeGreaterThan(0.9);
  });

  it('shakes a player when the shock front reaches them, at the speed of sound', () => {
    for (const d of [100, 450, 600]) {
      const arrives = DETONATION + d / SHOCK_SPEED;
      expect(nukeFrame(arrives - 0.05, d).shake).toBe(0);
      expect(nukeFrame(arrives + 0.05, d).shake).toBeGreaterThan(0.5);
    }
    expect(SHOCK_SPEED).toBeCloseTo(343, 0);
  });
});

describe('the nuke in the world', () => {
  const groundZero = [420, 0, -160] as const;

  it('draws nothing outside the intermission, so the next match starts on the untouched map', () => {
    const scene = new Scene();
    const nuke = new Nuke(scene, groundZero);
    nuke.update(DETONATION + 2);
    expect(nuke.root.visible).toBe(true);
    nuke.update(null);
    expect(nuke.root.visible).toBe(false);
    nuke.dispose();
  });

  it('shows the cloud, the shock and the dust after the blast', () => {
    const scene = new Scene();
    const nuke = new Nuke(scene, groundZero);
    nuke.update(DETONATION + 3);
    const visible = (name: string) => {
      let found = false;
      nuke.root.traverseVisible((o) => {
        if (o.name === name) found = true;
      });
      return found;
    };
    expect(visible('cloud')).toBe(true);
    expect(visible('shock')).toBe(true);
    expect(visible('dust')).toBe(true);
    nuke.dispose();
  });

  it('never casts shadows or adds anything to collision', () => {
    const scene = new Scene();
    const nuke = new Nuke(scene, groundZero);
    nuke.update(DETONATION + 3);
    nuke.root.traverse((o) => expect(o.castShadow).toBe(false));
    nuke.dispose();
  });
});

describe('the nuke, disposed', () => {
  it("leaves three's shared sprite quad alone, so other sprites keep drawing", () => {
    const scene = new Scene();
    const other = new Sprite();
    let disposed = false;
    other.geometry.addEventListener('dispose', () => (disposed = true));
    new Nuke(scene, [420, 0, -160]).dispose();
    expect(disposed).toBe(false);
  });
});
