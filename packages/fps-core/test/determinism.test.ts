import { describe, expect, it } from 'vitest';
import { slotWeapons } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, usercmd, type CmdScript } from '@duty-shooter/fps-core/harness';

const solids = [
  box({ min: [-20, -1, -20], max: [20, 0, 20], material: 'concrete' }),
  box({ min: [2, 0, -6], max: [4, 1, -4], material: 'wood' }),
  box({ min: [-5, 0, -10], max: [5, 3, -9], material: 'metal' }),
];

const players = [
  { id: 'a', team: 1, position: [0, 0, 0] as const },
  { id: 'b', team: 2, position: [3, 0, -8] as const, yaw: Math.PI },
];

/** A busy script: every axis, button and fire timestamp varies over time. */
const script: CmdScript = (tick) => ({
  a: usercmd({
    forward: tick % 90 < 45 ? 1 : -1,
    right: Math.sin(tick / 7),
    yaw: tick * 0.013,
    pitch: Math.cos(tick / 11) * 0.4,
    buttons: [...(tick % 30 < 15 ? (['Sprint'] as const) : []), ...(tick % 60 > 50 ? (['Jump'] as const) : [])],
    firePresses: tick % 10 === 0 ? [0.25, 0.75] : [],
  }),
  ...(tick % 4 === 0 ? {} : {
    b: usercmd({
      forward: 0.5,
      right: -1,
      yaw: Math.PI - tick * 0.02,
      pitch: -0.1,
      buttons: tick % 120 < 60 ? ['Crouch', 'Ads'] : ['Fire'],
    }),
  }),
});

describe('determinism', () => {
  it('produces identical outputs when the same usercmd script runs twice', () => {
    const first = createHeadlessMatch({ solids, players }).run(600, script);
    const second = createHeadlessMatch({ solids, players }).run(600, script);

    expect(second).toEqual(first);
  });

  it('stays identical with every weapon, switching, reloading and firing', () => {
    for (const primary of slotWeapons('primary')) {
      const armed = players.map((p) => ({ ...p, loadout: { primary, secondary: 'pistol' as const, grenade: 'frag' as const } }));
      const busy: CmdScript = (tick) => {
        const cmds = script(tick);
        const switching = tick % 150 === 75 ? ['SwitchWeapon' as const] : [];
        const reloading = tick % 200 === 199 ? ['Reload' as const] : [];
        const cooking = tick > 100 && tick < 140 ? ['Grenade' as const] : [];
        return { ...cmds, a: usercmd({ ...cmds['a'], buttons: [...switching, ...reloading, ...cooking, ...(tick % 120 < 50 ? (['Ads'] as const) : [])] }) };
      };
      const first = createHeadlessMatch({ solids, players: armed }).run(600, busy);
      const second = createHeadlessMatch({ solids, players: armed }).run(600, busy);

      expect(second, primary).toEqual(first);
      expect(first.some((o) => o.events.some((e) => e.type === 'shot' && e.weapon === primary)), primary).toBe(true);
      expect(first.some((o) => o.events.some((e) => e.type === 'explosion')), primary).toBe(true);
    }
  });

  it('produces different outputs for a different script, so the comparison above is meaningful', () => {
    const first = createHeadlessMatch({ solids, players }).run(600, script);
    const other = createHeadlessMatch({ solids, players }).run(600, (tick) => ({
      ...script(tick),
      a: usercmd({ yaw: -tick * 0.013 }),
    }));

    expect(other).not.toEqual(first);
  });
});
