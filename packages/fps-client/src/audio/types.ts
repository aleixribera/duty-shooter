export type SoundEventName =
  | 'gunshot' // the M4A1 firing. params.local=true for your own gun (non-positional, full detail)
  | 'dryFire'
  | 'footstep' // params.material, params.movement
  | 'jump'
  | 'land' // land: params.intensity 0..1 (fall height scaled)
  | 'slide'
  | 'mantle'
  | 'prone'
  | 'crouch'
  | 'reloadMagOut'
  | 'reloadMagIn'
  | 'reloadBoltRelease'
  | 'reloadChargingHandle'
  | 'weaponRaise'
  | 'inspectRattle'
  | 'adsIn'
  | 'adsOut'
  | 'meleeSwing'
  | 'meleeHit'
  | 'impact' // bullet hitting a surface: params.material
  | 'casing' // shell casing bounce: params.material
  | 'bulletCrack' // supersonic crack of a bullet passing near the listener
  | 'hitMarker'
  | 'killMarker'
  | 'headshotMarker'
  | 'damageTaken';

export type SurfaceMaterial = 'concrete' | 'metal' | 'wood' | 'dirt' | 'grass' | 'glass' | 'plaster';

export interface SoundParams {
  readonly position?: readonly [number, number, number]; // world metres; omitted = non-positional (UI / your own body)
  readonly local?: boolean; // the sound is made by the listener's own body/gun
  readonly material?: SurfaceMaterial;
  readonly movement?: 'walk' | 'sprint' | 'tacticalSprint' | 'crouch' | 'prone';
  readonly intensity?: number; // 0..1
  readonly environment?: 'outdoor' | 'indoor'; // reverb tail choice; default outdoor
  readonly when?: number; // seconds from now (>= 0) for sub-frame scheduling, default 0
}

/** One synthesized or sampled sound. Swapping a voice for a recorded sample means registering a different Voice. */
export interface Voice {
  play(ctx: AudioContext, out: AudioNode, params: SoundParams, startTime: number): void;
}

export interface SoundLogEntry {
  readonly event: SoundEventName;
  readonly params: SoundParams;
  readonly time: number;
}

export interface SoundSystem {
  /** Must be called from a user gesture (click/keydown) to start the AudioContext; safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  play(event: SoundEventName, params?: SoundParams): void;
  /** Listener pose each frame: position, forward (unit) and up (unit) in world space. */
  setListener(
    position: readonly [number, number, number],
    forward: readonly [number, number, number],
    up: readonly [number, number, number],
  ): void;
  /** Replace the voice for an event (e.g. a recorded sample later). */
  register(event: SoundEventName, voice: Voice): void;
  setVolume(master: number): void;
  /** Every play() call, newest last, capped at the last 200, for tests and debugging. Logged even before unlock. */
  readonly log: readonly SoundLogEntry[];
}

/**
 * What the sound system actually hands a voice: the caller's params plus the source-to-listener
 * distance it computed (metres; absent for non-positional sounds). Voices that don't care (e.g. a
 * recorded sample) simply ignore it.
 */
export interface VoiceParams extends SoundParams {
  readonly distance?: number;
}

/** Optional extras a voice may expose; the sound system uses them when present. */
export interface VoiceExtras {
  /** Longest the voice can ring for, in seconds (used to free the routing nodes behind it). */
  readonly duration?: number;
  /** Precompute anything expensive (buffers) for this context ahead of the first play. */
  warm?(ctx: BaseAudioContext): void;
  /** The same work as warm(), split into small slices the sound system runs between frames. */
  warmTasks?(ctx: BaseAudioContext): Array<() => void>;
}
