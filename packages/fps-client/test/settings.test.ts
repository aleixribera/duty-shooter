import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT } from '@duty-shooter/fps-core';
import { DEFAULT_SETTINGS, SECTION_SETTINGS, atDefaults, newcomerName, parseSettings, restoreDefaults, settingsWithName, type Settings, type SettingsSection } from '../src/settings';
import { DEFAULT_CROSSHAIR } from '../src/hud/crosshair';

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

  it('remembers the loadout, and starts from the M4A1, the pistol and a frag otherwise', () => {
    expect(DEFAULT_SETTINGS.loadout).toEqual(DEFAULT_LOADOUT);
    expect(parseSettings({ name: 'x' }).loadout).toEqual(DEFAULT_LOADOUT);
    // A save from before tacticals (ticket 20) gets the default smoke and no perk; one that chose none keeps none.
    expect(parseSettings({ loadout: { primary: 'sniper', secondary: 'pistol', grenade: null } }).loadout).toEqual({ primary: 'sniper', secondary: 'pistol', grenade: null, tactical: 'smoke', perk: null });
    expect(parseSettings({ loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag', tactical: null, perk: 'softSoles' } }).loadout).toEqual({ primary: 'sniper', secondary: 'pistol', grenade: 'frag', tactical: null, perk: 'softSoles' });
    expect(parseSettings({ loadout: { primary: 'pistol', secondary: 'pistol', grenade: 'frag' } }).loadout).toEqual(DEFAULT_LOADOUT);
  });

  it('keeps values the player chose, before and after the new defaults', () => {
    expect(parseSettings({ sensitivity: 7.5, fov: 100 })).toMatchObject({ sensitivity: 7.5, fov: 100 });
    expect(parseSettings({ defaultsVersion: 2, sensitivity: 5, fov: 80 })).toMatchObject({ sensitivity: 5, fov: 80 });
  });

  // Next-level ticket 22: the Settings screen's sections brought a dozen new settings.
  it('gives a save from before the quality, crosshair and accessibility settings their defaults, and keeps the rest of it', () => {
    const old = parseSettings({ defaultsVersion: 2, sensitivity: 7, fov: 105, volume: 0.4, name: 'veteran', showFps: true, bindings: { jump: 'KeyJ' } });

    expect(old).toMatchObject({ sensitivity: 7, fov: 105, volume: 0.4, name: 'veteran', showFps: true });
    expect(old.bindings.jump).toBe('KeyJ');
    expect(old).toMatchObject({ fpsCap: 0, invertY: false, cameraMotion: 1, fovEffects: 1, colourVision: 'off', hudScale: 1, captions: true });
    expect(old.crosshair).toEqual(DEFAULT_CROSSHAIR);
  });

  // Next-level ticket 35: one picture. A save from the days of quality tiers loads, and its tier is forgotten.
  it('forgets the quality tier, Auto and dynamic resolution an old save carries', () => {
    const old = parseSettings({ defaultsVersion: 2, quality: 'low', autoTier: 'medium', autoAdapter: 'intel', dynamicResolution: true, fpsCap: 60 }) as unknown as Record<string, unknown>;
    expect(old['fpsCap']).toBe(60);
    for (const gone of ['quality', 'autoTier', 'autoAdapter', 'dynamicResolution']) expect(old, gone).not.toHaveProperty(gone);
  });

  it('keeps the new settings a player chose, and survives a round trip through storage', () => {
    const chosen: Partial<Settings> = { fpsCap: 60, invertY: true, cameraMotion: 0, fovEffects: 0.5, colourVision: 'protanopia', hudScale: 1.3, captions: false, crosshair: { shape: 'circle', size: 12, gap: 6, thickness: 3, colour: 'cyan', dot: false, dynamic: false } };
    const parsed = parseSettings({ defaultsVersion: 2, ...chosen });

    expect(parsed).toMatchObject(chosen);
    expect(parseSettings(JSON.parse(JSON.stringify({ ...parsed, defaultsVersion: 2 })))).toEqual(parsed);
  });

  it('drops what a hand-edited save gets wrong, one value at a time', () => {
    const broken = parseSettings({ fpsCap: 77, cameraMotion: 9, fovEffects: -1, colourVision: 'dog', hudScale: 4, captions: 'yes', crosshair: { shape: 'star', size: 900, gap: -3, thickness: 0, colour: 'pink', dot: 1 } });

    expect(broken).toMatchObject({ fpsCap: 0, cameraMotion: 1, fovEffects: 0, colourVision: 'off', hudScale: 1.3, captions: true });
    expect(broken.crosshair).toEqual({ shape: 'cross', size: 24, gap: 0, thickness: 1, colour: 'white', dot: true, dynamic: true });
    expect(parseSettings({ crosshair: 'none' }).crosshair).toEqual(DEFAULT_CROSSHAIR);
  });

  it('restores one section to its defaults and leaves the others alone', () => {
    const mine: Settings = { ...DEFAULT_SETTINGS, sensitivity: 3, invertY: true, fpsCap: 144, volume: 0.2, hudScale: 0.8, cameraMotion: 0, name: 'me' };

    const video = restoreDefaults(mine, 'video');
    expect(video).toMatchObject({ fpsCap: 0, sensitivity: 3, invertY: true, volume: 0.2, hudScale: 0.8, cameraMotion: 0, name: 'me' });
    expect(restoreDefaults(mine, 'mouse')).toMatchObject({ sensitivity: 10, invertY: false, fpsCap: 144 });
    expect(restoreDefaults(mine, 'accessibility')).toMatchObject({ cameraMotion: 1, hudScale: 0.8 });
    expect(atDefaults(mine, 'audio')).toBe(false);
    expect(atDefaults(restoreDefaults(mine, 'audio'), 'audio')).toBe(true);
  });

  it('puts every setting a player sets on the Settings screen in exactly one section', () => {
    const all = (Object.keys(SECTION_SETTINGS) as SettingsSection[]).flatMap((s) => SECTION_SETTINGS[s]);
    expect(new Set(all).size).toBe(all.length);
    // What is not on the screen: who you are, what you carry, and what the page remembers for itself.
    const elsewhere = ['name', 'loadout', 'builds', 'passphrase', 'firefoxTipShown'];
    for (const key of Object.keys(DEFAULT_SETTINGS)) if (!elsewhere.includes(key)) expect(all, key).toContain(key);
  });

  it('gives a browser with no name one to play under, and keeps a name it has', () => {
    // Play Online joins in one click under the menu's name: with none, a newcomer's click only lit the empty box (ticket 103).
    for (const r of [0, 0.5, 0.99999]) {
      const name = newcomerName(() => r);
      expect(name).toMatch(/^Player \d{4}$/);
      expect(parseSettings({ name }).name).toBe(name);
    }
    const named = settingsWithName(DEFAULT_SETTINGS, () => 0.25);
    expect(named.name).toBe('Player 3250');
    expect(settingsWithName({ ...DEFAULT_SETTINGS, name: '  ' }, () => 0).name).toBe('Player 1000');
    const mine = { ...DEFAULT_SETTINGS, name: 'Aleix' };
    expect(settingsWithName(mine)).toBe(mine);
  });
});
