import { describe, expect, it } from 'vitest';
import { actionFor, DEFAULT_BINDINGS, rebind } from '../src/input/bindings';

describe('key bindings', () => {
  it('defaults to MW2019 bindings', () => {
    expect(actionFor(DEFAULT_BINDINGS, 'KeyW')).toBe('forward');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyS')).toBe('back');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyA')).toBe('left');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyD')).toBe('right');
    expect(actionFor(DEFAULT_BINDINGS, 'ShiftLeft')).toBe('sprint');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyC')).toBe('crouch');
    expect(actionFor(DEFAULT_BINDINGS, 'ControlLeft')).toBe('prone');
    expect(actionFor(DEFAULT_BINDINGS, 'Space')).toBe('jump');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyR')).toBe('reload');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyV')).toBe('melee');
    expect(actionFor(DEFAULT_BINDINGS, 'Mouse0')).toBe('fire');
    expect(actionFor(DEFAULT_BINDINGS, 'Mouse2')).toBe('ads');
    expect(actionFor(DEFAULT_BINDINGS, 'KeyQ')).toBeNull();
  });

  it('rebinds an action to a new input', () => {
    const bindings = rebind(DEFAULT_BINDINGS, 'crouch', 'KeyX');

    expect(actionFor(bindings, 'KeyX')).toBe('crouch');
    expect(actionFor(bindings, 'KeyC')).toBeNull();
    expect(actionFor(DEFAULT_BINDINGS, 'KeyC')).toBe('crouch');
  });

  it('takes the input away from the action that had it', () => {
    const bindings = rebind(DEFAULT_BINDINGS, 'jump', 'KeyC');

    expect(actionFor(bindings, 'KeyC')).toBe('jump');
    expect(bindings.crouch).toBeNull();
  });
});
