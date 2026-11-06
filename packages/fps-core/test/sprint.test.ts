import { describe, expect, it } from 'vitest';
import { Button, STATS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { decodeClient } from '../src/net/protocol';
import { expectStat, hold, measuredSpeed, soloMatch, ticks } from './support/movement';

const { movement } = STATS;

const sprint = usercmd({ forward: 1, buttons: ['Sprint'] });
/** Bit 8 of the buttons: tactical sprint once, reserved now. */
const RESERVED = 1 << 8;

describe('sprint', () => {
  it('sprints forward at the sprint speed', () => {
    const outputs = hold(soloMatch(), ticks(2), sprint);

    expectStat(measuredSpeed(outputs), movement.sprintSpeed, 'sprint speed');
    expect(outputs.at(-1)?.movement).toBe('sprint');
  });

  it('does not sprint while aiming down sights or moving backwards', () => {
    const ads = hold(soloMatch(), ticks(1), usercmd({ forward: 1, buttons: ['Sprint', 'Ads'] }));
    const back = hold(soloMatch(), ticks(1), usercmd({ forward: -1, buttons: ['Sprint'] }));

    expect(ads.at(-1)?.movement).toBe('walk');
    expect(back.at(-1)?.movement).toBe('walk');
  });
});

describe('one sprint speed', () => {
  it('has no faster sprint and no stamina: a long sprint stays at the sprint speed', () => {
    const outputs = hold(soloMatch(), ticks(8), sprint);

    expectStat(measuredSpeed(outputs.slice(ticks(1))), movement.sprintSpeed, 'sprint speed after 1 s');
    expectStat(measuredSpeed(outputs.slice(ticks(6))), movement.sprintSpeed, 'sprint speed after 6 s');
    expect(outputs.slice(ticks(1)).every((p) => p.movement === 'sprint')).toBe(true);
  });

  it('ignores bit 8, the reserved one: setting it moves no faster than a plain sprint', () => {
    const plain = hold(soloMatch(), ticks(4), sprint);
    const withBit = hold(soloMatch(), ticks(4), { ...sprint, buttons: sprint.buttons | RESERVED });

    expect(withBit.map((p) => p.position)).toEqual(plain.map((p) => p.position));
    expect(withBit.map((p) => p.movement)).toEqual(plain.map((p) => p.movement));
  });

  it('is masked off by the server: a usercmd from the wire loses bit 8 and keeps the rest', () => {
    const wire = JSON.stringify({ t: 'cmds', cmds: [{ seq: 1, cmd: { buttons: Button.Sprint | Button.Fire | RESERVED, forward: 1, right: 0, yaw: 0, pitch: 0, firePresses: [] } }] });

    const decoded = decodeClient(wire);

    expect(decoded?.t).toBe('cmds');
    const buttons = decoded?.t === 'cmds' ? decoded.cmds[0]!.cmd.buttons : -1;
    expect(buttons & RESERVED).toBe(0);
    expect(buttons).toBe(Button.Sprint | Button.Fire);
  });
});
