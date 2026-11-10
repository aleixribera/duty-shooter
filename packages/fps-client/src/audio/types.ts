import type { Material, MuzzleId, WeaponId } from '@duty-shooter/fps-core';
import type { MixLevels } from './mix';
import type { Music, MusicState } from './music/player';
import type { Speech, SpeechState } from './speech';
export type SoundEventName =
  | 'gunshot' // a gun firing (params.weapon, the M4A1 when absent). params.local=true for your own gun (non-positional, full detail)
  | 'dryFire'
  | 'footstep' // params.material, params.movement, params.wading
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
  | 'pumpRack' // a shotgun's pump worked back and forward
  | 'boltOpen' // a bolt lifted and drawn back
  | 'boltClose' // a bolt run home and locked
  | 'shellInsert' // one shell pushed into a shotgun's tube
  | 'coverOpen' // a belt-fed gun's feed cover unlatched and lifted
  | 'coverShut' // the feed cover slapped shut on the belt
  | 'cylinderOpen' // a revolver's cylinder swung out and its six cases struck out
  | 'cylinderLoad' // six rounds dropped in off a speedloader
  | 'cylinderShut' // the cylinder pushed shut
  | 'grenadePin' // a frag's pin pulled
  | 'grenadeThrow' // the spoon flying off and the throw
  | 'grenadeBounce' // a frag landing or bouncing (params.intensity)
  | 'explosion' // a frag going off
  | 'smokePop' // a smoke canister popping and hissing out its cloud
  | 'flashBang' // a flash going off: a hard bright crack
  | 'impact' // bullet hitting a surface: params.material
  | 'casing' // shell casing bounce: params.material
  | 'bulletCrack' // supersonic crack of a bullet passing near the listener
  | 'hitMarker'
  | 'killMarker'
  | 'headshotMarker'
  | 'headshotKill' // the kill confirm for a kill through the head (not placed in the world)
  | 'medal' // a Medal earned (not placed in the world)
  | 'rankUp' // a Rank crossed, on the end screen (not placed in the world)
  | 'challengeDone' // a daily Challenge completed, on the end screen (not placed in the world)
  | 'damageTaken'
  | 'pain' // a soldier's grunt as a hit lands (params.local for your own; intensity: how hard the hit)
  | 'death' // the breath a soldier lets go as they die
  | 'nukeSiren' // the town's air-raid siren before the end-of-match nuke
  | 'nukeBlast' // the nuke's blast, from ground zero (arrives after the flash, by distance)
  | 'ambientWind' // the map's wind bed, all round you (intensity: 1 outdoors, lower indoors)
  | 'ambientBirds' // a distant bird, from a perch
  | 'ambientCreak' // a sign creaking on its chains (intensity: how hard the wind is pushing it)
  | 'ambientRadio' // one segment of the radio playing in a house
  | 'ambientHorn' // a train's horn far out on the plain
  | 'ambientCouplings' // wagons being shunted somewhere out of sight
  | 'ambientHum' // one segment of a sodium lamp's hum
  | 'trainHorn' // the end-of-match freight train's horn
  | 'trainRumble' // one segment of the train going by, from its nearest point (intensity: 1 at the locos, 0 down the wagons)
  | 'trainClack' // one bogie of the train over the rail joint nearest the listener
  | 'chargeKey' // one key of the charge's keypad, tapped as it is planted (intensity picks the key)
  | 'chargeArmed' // the charge armed
  | 'chargeBeep' // one beep of the charge's fuse
  | 'chargeTool' // the defuser's tools at work (intensity picks snip or screw)
  | 'chargeDisarmed' // the charge disarmed
  | 'ringHum' // one segment of the Ring's hum, from the point of the wall nearest the listener
  | 'ringCrackle' // a discharge along the Ring near the listener
  | 'ringShift' // the warning as the Ring starts to close (not placed in the world)
  | 'ping' // a squadmate marked a place or a thing (not placed in the world)
  | 'pingEnemy' // a squadmate marked an enemy (not placed in the world)
  | 'trapBirds' // birds flushing out of a canopy as someone runs past (a sound trap)
  | 'trapMetal' // loose sheet metal rattling as someone runs past (a sound trap)
  | 'trapGravel' // loose gravel sliding as someone runs past (a sound trap)
  | 'prepDrone' // one segment of the Preparation's drone (intensity: how near the drop; not placed in the world)
  | 'heartbeat' // one beat of a heart: the Preparation's, and your own under 30 health (intensity: how hard; not placed in the world)
  | 'countdownSirenRise' // the last minute's air-raid siren winding up, far off at the map's edge
  | 'countdownSirenHold' // one segment of that siren held at its top note
  | 'countdownSirenFall' // the siren winding down as the clock runs out
  | 'geigerTick'; // one tick of the counter that chatters through the last minute (not placed in the world)

/** Every world material has its own footsteps, impacts and casing bounces. */
export type SurfaceMaterial = Material;

export interface SoundParams {
  readonly position?: readonly [number, number, number]; // world metres; omitted = non-positional (UI / your own body)
  readonly local?: boolean; // the sound is made by the listener's own body/gun
  readonly material?: SurfaceMaterial;
  readonly movement?: 'walk' | 'sprint' | 'crouch' | 'prone';
  readonly wading?: boolean; // a footstep in water, whatever the ground under it
  readonly intensity?: number; // 0..1
  readonly quieter?: number; // a gain (0..1] on top of everything: Soft Soles' footsteps carry half as far at 0.5
  readonly environment?: 'outdoor' | 'indoor'; // reverb tail choice; default outdoor
  readonly muffled?: boolean; // walls between the source and the listener: dulled and quieter
  readonly when?: number; // seconds from now (>= 0) for sub-frame scheduling, default 0
  readonly weapon?: WeaponId; // which gun a gunshot is, or whose action a reload, bolt or draw is (the M4A1 when absent)
  readonly muzzle?: MuzzleId; // a gunshot's muzzle device: a suppressor dulls it and carries half as far, a compensator is harsher and carries farther
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
  /** The mix's volumes (each 0..1): the master, and one each for music, effects, the announcer's voice and the UI. */
  setMix(mix: Partial<MixLevels>): void;
  /** The score: which scene the game is in, and its stings. */
  readonly music: Music;
  /** The recorded voice: a line said by its id, on the voice bus, with everything else ducked under it. */
  readonly speech: Speech;
  /**
   * The local player's health each frame (null: none, or dead). Under 30 the heart is heard,
   * quicker as health drops, and the world goes dull behind a low-pass; both lift as it comes back.
   */
  setHealth(health: number | null): void;
  /**
   * A blast close enough to hurt: the ears ring for a second and a half and the world drops
   * away under it, then comes back. `strength` 0..1 (see tinnitusStrength).
   */
  tinnitus(strength: number, seconds?: number): void;
  /** The announcer is saying a line `seconds` long: everything but the UI makes room for it. */
  duckForVoice(seconds: number): void;
  /** Fades out, over `fade` s (a click's length unless given), every voice of `events` that is sounding or waiting to. */
  stop(events: readonly SoundEventName[], fade?: number): void;
  /** What the system is doing right now, for scripts and debugging. */
  readonly state: SoundState;
  /** Every play() call, newest last, capped at the last 200, for tests and debugging. Logged even before unlock. */
  readonly log: readonly SoundLogEntry[];
}

/** A snapshot of the sound system. */
export interface SoundState {
  readonly unlocked: boolean;
  /** Voices sounding now, the most there have been at once, and the cap they are held under. */
  readonly voices: number;
  readonly peakVoices: number;
  readonly voiceCap: number;
  readonly mix: MixLevels;
  /** Where each duck stands (1: not ducked): the music under gunfire, and everything but the UI under the announcer. */
  readonly musicDuck: number;
  readonly voiceDuck: number;
  /** The low-pass over the world (Hz; 20000 when open) and the health it follows (null above 30). */
  readonly worldCutoff: number;
  readonly lowHealth: number | null;
  /** Times the ears have rung. */
  readonly tinnitus: number;
  readonly music: MusicState;
  readonly speech: SpeechState;
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
  /** How long this one play rings for (s), when it is shorter than `duration`: a voice's longest layer needn't hold every play's slot. */
  lengthOf?(params: VoiceParams): number;
  /** Precompute anything expensive (buffers) for this context ahead of the first play. */
  warm?(ctx: BaseAudioContext): void;
  /** The same work as warm(), split into small slices the sound system runs between frames. */
  warmTasks?(ctx: BaseAudioContext): Array<() => void>;
}
