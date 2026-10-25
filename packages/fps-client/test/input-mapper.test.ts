import { describe, expect, it } from 'vitest';
import { isPressed, STATS, type ButtonName, type UserCmd } from '@duty-shooter/fps-core';
import { DEFAULT_BINDINGS, rebind } from '../src/input/bindings';
import { InputMapper, type InputModes } from '../src/input/input-mapper';

const VIEW = { yaw: 0.5, pitch: -0.25 };
const TAP_WINDOW = STATS.input.doubleTapWindow.value;

function mapper(modes: Partial<InputModes> = {}) {
  return new InputMapper({ bindings: DEFAULT_BINDINGS, crouch: 'hold', ads: 'hold', ...modes });
}

function held(cmd: UserCmd): ButtonName[] {
  const names: ButtonName[] = ['Fire', 'Ads', 'Sprint', 'TacticalSprint', 'Crouch', 'Prone', 'Jump', 'Reload', 'Melee'];
  return names.filter((name) => isPressed(cmd, name));
}

/** Presses and releases a key at `time`. */
function tap(input: InputMapper, code: string, time: number) {
  input.press(code, time);
  input.release(code, time + 0.05);
}

describe('input mapper', () => {
  it('turns movement keys into axes and carries the view angles', () => {
    const input = mapper();
    input.press('KeyW', 0);
    input.press('KeyD', 0);

    expect(input.usercmd(VIEW)).toMatchObject({ forward: 1, right: 1, yaw: 0.5, pitch: -0.25, buttons: 0 });

    input.press('KeyS', 0);
    input.press('KeyA', 0);
    expect(input.usercmd(VIEW)).toMatchObject({ forward: 0, right: 0 });
  });

  it('maps the action keys and mouse buttons to usercmd buttons', () => {
    const input = mapper();
    for (const code of ['Space', 'KeyR', 'KeyV', 'Mouse0', 'Mouse2']) input.press(code, 0);

    expect(held(input.usercmd(VIEW))).toEqual(['Fire', 'Ads', 'Jump', 'Reload', 'Melee']);
  });

  it('follows rebinding and ignores unbound inputs', () => {
    const input = new InputMapper({ bindings: rebind(DEFAULT_BINDINGS, 'jump', 'KeyF'), crouch: 'hold', ads: 'hold' });
    input.press('Space', 0);
    input.press('KeyQ', 0);
    expect(held(input.usercmd(VIEW))).toEqual([]);

    input.press('KeyF', 0);
    expect(held(input.usercmd(VIEW))).toEqual(['Jump']);
  });

  describe('sprint', () => {
    it('keeps sprinting after a sprint tap until forward is released', () => {
      const input = mapper();
      input.press('KeyW', 0);
      tap(input, 'ShiftLeft', 0.1);

      expect(held(input.usercmd(VIEW))).toEqual(['Sprint']);

      input.release('KeyW', 2);
      input.press('KeyW', 2.1);
      expect(held(input.usercmd(VIEW))).toEqual([]);
    });

    it('starts a tactical sprint on a double-tap of sprint', () => {
      const input = mapper();
      input.press('KeyW', 0);
      tap(input, 'ShiftLeft', 0.1);
      tap(input, 'ShiftLeft', 0.1 + TAP_WINDOW * 0.8);

      expect(held(input.usercmd(VIEW))).toEqual(['Sprint', 'TacticalSprint']);

      input.release('KeyW', 3);
      expect(held(input.usercmd(VIEW))).toEqual([]);
    });

    it('does not tactical sprint when the taps are too far apart', () => {
      const input = mapper();
      input.press('KeyW', 0);
      tap(input, 'ShiftLeft', 0.1);
      tap(input, 'ShiftLeft', 0.1 + TAP_WINDOW * 1.2);

      expect(held(input.usercmd(VIEW))).toEqual(['Sprint']);
    });
  });

  describe('crouch', () => {
    it('holds crouch while the key is down in hold mode', () => {
      const input = mapper({ crouch: 'hold' });
      input.press('KeyC', 0);
      expect(held(input.usercmd(VIEW))).toEqual(['Crouch']);

      input.release('KeyC', 1);
      expect(held(input.usercmd(VIEW))).toEqual([]);
    });

    it('toggles crouch on each press in toggle mode', () => {
      const input = mapper({ crouch: 'toggle' });
      tap(input, 'KeyC', 0);
      expect(held(input.usercmd(VIEW))).toEqual(['Crouch']);

      tap(input, 'KeyC', 1);
      expect(held(input.usercmd(VIEW))).toEqual([]);
    });

    it('stands up from a toggled crouch when sprint is pressed', () => {
      const input = mapper({ crouch: 'toggle' });
      input.press('KeyW', 0);
      tap(input, 'KeyC', 0);
      tap(input, 'ShiftLeft', 1);

      expect(held(input.usercmd(VIEW))).toEqual(['Sprint']);
    });
  });

  describe('prone', () => {
    it('toggles prone on each press', () => {
      const input = mapper();
      tap(input, 'ControlLeft', 0);
      expect(held(input.usercmd(VIEW))).toEqual(['Prone']);

      tap(input, 'ControlLeft', 1);
      expect(held(input.usercmd(VIEW))).toEqual([]);
    });

    it('gets up from prone on jump, and goes to crouch on crouch', () => {
      const input = mapper({ crouch: 'toggle' });
      tap(input, 'ControlLeft', 0);
      tap(input, 'Space', 1);
      expect(held(input.usercmd(VIEW))).toEqual([]);

      tap(input, 'ControlLeft', 2);
      tap(input, 'KeyC', 3);
      expect(held(input.usercmd(VIEW))).toEqual(['Crouch']);
    });

    it('does not jump on the press that gets up from prone or a toggled crouch', () => {
      const input = mapper({ crouch: 'toggle' });
      tap(input, 'ControlLeft', 0);
      input.press('Space', 1);
      expect(held(input.usercmd(VIEW))).toEqual([]);
      input.release('Space', 1.1);

      tap(input, 'KeyC', 2);
      input.press('Space', 3);
      expect(held(input.usercmd(VIEW))).toEqual([]);
      input.release('Space', 3.1);

      input.press('Space', 4);
      expect(held(input.usercmd(VIEW))).toEqual(['Jump']);
    });
  });

  describe('aim down sights', () => {
    it('holds ADS in hold mode and toggles it in toggle mode', () => {
      const hold = mapper({ ads: 'hold' });
      tap(hold, 'Mouse2', 0);
      expect(held(hold.usercmd(VIEW))).toEqual([]);

      const toggle = mapper({ ads: 'toggle' });
      tap(toggle, 'Mouse2', 0);
      expect(held(toggle.usercmd(VIEW))).toEqual(['Ads']);
      tap(toggle, 'Mouse2', 1);
      expect(held(toggle.usercmd(VIEW))).toEqual([]);
    });
  });

  it('drops every held input on releaseAll (focus loss, pause)', () => {
    const input = mapper();
    input.press('KeyW', 0);
    input.press('ShiftLeft', 0);
    input.press('Space', 0);
    input.releaseAll();

    expect(input.usercmd(VIEW)).toMatchObject({ forward: 0, right: 0, buttons: 0 });
  });
});
