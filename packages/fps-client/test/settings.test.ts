import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('settings', () => {
  it('defaults to sensitivity 10, controller sensitivity 12 and a 90 degree FOV', () => {
    expect(DEFAULT_SETTINGS.sensitivity).toBe(10);
    expect(DEFAULT_SETTINGS.padSensitivityX).toBe(12);
    expect(DEFAULT_SETTINGS.padSensitivityY).toBe(12);
    expect(DEFAULT_SETTINGS.fov).toBe(90);
  });

  it('moves a save from before the new defaults off the old defaults', () => {
    const old = parseSettings({ sensitivity: 5, padSensitivityX: 6, padSensitivityY: 6, fov: 80, name: 'kept' });

    expect(old.sensitivity).toBe(10);
    expect(old.padSensitivityX).toBe(12);
    expect(old.padSensitivityY).toBe(12);
    expect(old.fov).toBe(90);
    expect(old.name).toBe('kept');
  });

  it('keeps values the player chose, before and after the new defaults', () => {
    expect(parseSettings({ sensitivity: 7.5, fov: 100 })).toMatchObject({ sensitivity: 7.5, fov: 100 });
    expect(parseSettings({ defaultsVersion: 2, sensitivity: 5, fov: 80 })).toMatchObject({ sensitivity: 5, fov: 80 });
  });
});
