import { describe, expect, it } from 'vitest';
import type { ChargeState, PlayerId, Vec3 } from '@duty-shooter/fps-core';
import { DEFUSE_TIME, FUSE_TIME, PLANT_TIME } from '@duty-shooter/fps-core/modes';
import { ChargeSounds, beepInterval, type ChargeCue } from '../src/charge-sounds';

const SITE: Vec3 = [21, 3, -10];
const PLANTER: Vec3 = [21.4, 3, -10.2];
const DEFUSER: Vec3 = [20.6, 3, -9.8];
const where = (id: PlayerId): Vec3 | null => (id === 'a' ? PLANTER : id === 'd' ? DEFUSER : null);

const base: ChargeState = { kind: 'charge', round: 1, attackers: 1, phase: 'live', remaining: 60, carrier: 'a', dropped: null, planted: null, action: null, outcome: null };

/** Runs `sounds` at 60 fps over a script of states (each from its start time), returning each cue with the time it plays at. */
function run(sounds: ChargeSounds, script: readonly { from: number; state: (t: number) => ChargeState | null }[], until: number): (ChargeCue & { at: number })[] {
  const out: (ChargeCue & { at: number })[] = [];
  for (let f = 0; f <= until * 60; f++) {
    const now = f / 60;
    const step = [...script].reverse().find((s) => now >= s.from)!;
    for (const c of sounds.update(step.state(now - step.from), now, where)) out.push({ ...c, at: now + (c.params.when ?? 0) });
  }
  return out;
}

const planting = (t: number): ChargeState => ({ ...base, action: { player: 'a', kind: 'plant', progress: Math.min(1, t / PLANT_TIME) } });
const planted = (t: number): ChargeState => ({ ...base, phase: 'planted', carrier: null, remaining: FUSE_TIME - t, planted: { site: 'B', position: SITE } });
const defusing = (since: number) => (t: number): ChargeState => ({ ...planted(since + t), action: { player: 'd', kind: 'defuse', progress: Math.min(1, t / DEFUSE_TIME) } });
const defused: ChargeState = { ...base, phase: 'over', carrier: null, remaining: 5, outcome: { winner: 2, reason: 'defused' } };

describe('the charge beeping', () => {
  it('beeps once a second at the plant, quickening to about ten a second at the end', () => {
    expect(beepInterval(FUSE_TIME)).toBeCloseTo(1, 1);
    expect(beepInterval(0)).toBeCloseTo(0.1, 2);
    for (let r = FUSE_TIME; r > 0.5; r -= 0.5) expect(beepInterval(r - 0.5)).toBeLessThan(beepInterval(r));
  });

  it('beeps from the charge all through the fuse, each gap shorter than the last', () => {
    const beeps = run(new ChargeSounds(), [{ from: 0, state: planted }], FUSE_TIME - 0.05).filter((c) => c.event === 'chargeBeep');
    expect(beeps.every((c) => c.params.position === SITE)).toBe(true);
    for (let i = 2; i < beeps.length; i++) expect(beeps[i]!.at - beeps[i - 1]!.at).toBeLessThanOrEqual(beeps[i - 1]!.at - beeps[i - 2]!.at + 1e-6);
    // About the fuse over the average gap: a hundred or so.
    expect(beeps.length).toBeGreaterThan(80);
    expect(beeps.length).toBeLessThan(160);
  });
});

describe('planting and defusing', () => {
  it('taps the keypad while the charge is planted, and chirps once it is armed', () => {
    const cues = run(new ChargeSounds(), [{ from: 0, state: planting }, { from: PLANT_TIME, state: planted }], PLANT_TIME + 1);
    const keys = cues.filter((c) => c.event === 'chargeKey');
    expect(keys.length).toBeGreaterThanOrEqual(PLANT_TIME / 0.5);
    expect(keys.every((c) => c.params.position === PLANTER && c.at < PLANT_TIME + 0.15)).toBe(true);
    const armed = cues.filter((c) => c.event === 'chargeArmed');
    expect(armed).toHaveLength(1);
    expect(armed[0]!.params.position).toBe(SITE);
    expect(armed[0]!.at).toBeCloseTo(PLANT_TIME, 1);
  });

  it('stops tapping when the plant is let go', () => {
    const cues = run(new ChargeSounds(), [{ from: 0, state: planting }, { from: 1.5, state: () => base }], 4);
    expect(cues.some((c) => c.event === 'chargeKey')).toBe(true);
    expect(cues.filter((c) => c.event === 'chargeKey').every((c) => c.at < 1.5 + 0.2)).toBe(true);
    expect(cues.some((c) => c.event === 'chargeArmed' || c.event === 'chargeBeep')).toBe(false);
  });

  it('clicks the tools while it is defused, falls silent and sounds disarmed', () => {
    const cues = run(new ChargeSounds(), [{ from: 0, state: planted }, { from: 10, state: defusing(10) }, { from: 10 + DEFUSE_TIME, state: () => defused }], 10 + DEFUSE_TIME + 3);
    const tools = cues.filter((c) => c.event === 'chargeTool');
    expect(tools.length).toBeGreaterThanOrEqual(DEFUSE_TIME / 0.9);
    expect(tools.every((c) => c.params.position === DEFUSER && c.at >= 10 && c.at < 10 + DEFUSE_TIME + 0.15)).toBe(true);
    const disarmed = cues.filter((c) => c.event === 'chargeDisarmed');
    expect(disarmed).toHaveLength(1);
    expect(disarmed[0]!.params.position).toBe(SITE);
    expect(cues.filter((c) => c.event === 'chargeBeep').every((c) => c.at < 10 + DEFUSE_TIME + 0.2)).toBe(true);
  });

  it('is silent outside Charge and between rounds', () => {
    expect(run(new ChargeSounds(), [{ from: 0, state: () => null }], 5)).toHaveLength(0);
    expect(run(new ChargeSounds(), [{ from: 0, state: () => base }], 5)).toHaveLength(0);
  });
});
