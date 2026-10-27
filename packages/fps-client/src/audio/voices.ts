import { crouchVoice, footstepVoice, jumpVoice, landVoice, mantleVoice, proneVoice, slideVoice } from './foley';
import { gunshotVoice } from './gunshot';
import { bulletCrackVoice, casingVoice, impactVoice } from './impacts';
import { nukeBlastVoice, nukeSirenVoice } from './nuke';
import { birdsVoice, creakVoice, radioVoice, windVoice } from './ambience';
import { playBuffer, jit } from './synth-voice';
import type { SoundEventName, SoundParams, Voice, VoiceExtras } from './types';
import { damageTakenVoice, headshotMarkerVoice, hitMarkerVoice, killMarkerVoice } from './ui';
import {
  adsInVoice,
  adsOutVoice,
  boltReleaseVoice,
  chargingHandleVoice,
  dryFireVoice,
  inspectRattleVoice,
  magInVoice,
  magOutVoice,
  meleeHitVoice,
  meleeSwingVoice,
  weaponRaiseVoice,
} from './weapon';

/** The procedural voice for every event. */
export function createDefaultVoices(): Record<SoundEventName, Voice & VoiceExtras> {
  return {
    gunshot: gunshotVoice(),
    dryFire: dryFireVoice(),
    footstep: footstepVoice(),
    jump: jumpVoice(),
    land: landVoice(),
    slide: slideVoice(),
    mantle: mantleVoice(),
    prone: proneVoice(),
    crouch: crouchVoice(),
    reloadMagOut: magOutVoice(),
    reloadMagIn: magInVoice(),
    reloadBoltRelease: boltReleaseVoice(),
    reloadChargingHandle: chargingHandleVoice(),
    weaponRaise: weaponRaiseVoice(),
    inspectRattle: inspectRattleVoice(),
    adsIn: adsInVoice(),
    adsOut: adsOutVoice(),
    meleeSwing: meleeSwingVoice(),
    meleeHit: meleeHitVoice(),
    impact: impactVoice(),
    casing: casingVoice(),
    bulletCrack: bulletCrackVoice(),
    hitMarker: hitMarkerVoice(),
    killMarker: killMarkerVoice(),
    headshotMarker: headshotMarkerVoice(),
    damageTaken: damageTakenVoice(),
    nukeSiren: nukeSirenVoice(),
    nukeBlast: nukeBlastVoice(),
    ambientWind: windVoice(),
    ambientBirds: birdsVoice(),
    ambientCreak: creakVoice(),
    ambientRadio: radioVoice(),
  };
}

/** Helper for a later sample-based voice: plays an AudioBuffer with optional rate/gain randomisation. */
export function sampleVoice(buffer: AudioBuffer, options?: { gain?: number; rateJitter?: number }): Voice {
  const gain = options?.gain ?? 1;
  const rateJitter = Math.min(0.5, Math.max(0, options?.rateJitter ?? 0));
  const voice: Voice & VoiceExtras = {
    duration: buffer.duration / (1 - rateJitter),
    play(ctx: AudioContext, out: AudioNode, _params: SoundParams, startTime: number) {
      playBuffer(ctx, out, buffer, startTime, { gain, rate: 1 + jit(rateJitter) });
    },
  };
  return voice;
}
