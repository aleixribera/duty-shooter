import { boltCloseVoice, boltOpenVoice, coverOpenVoice, coverShutVoice, cylinderLoadVoice, cylinderOpenVoice, cylinderShutVoice, explosionVoice, grenadeBounceVoice, grenadePinVoice, grenadeThrowVoice, pumpRackVoice, shellInsertVoice } from './arsenal';
import { crouchVoice, footstepVoice, jumpVoice, landVoice, mantleVoice, proneVoice, slideVoice } from './foley';
import { gunshotVoice } from './gunshot';
import { bulletCrackVoice, casingVoice, impactVoice } from './impacts';
import { nukeBlastVoice, nukeSirenVoice } from './nuke';
import { birdsVoice, couplingsVoice, creakVoice, hornVoice, humVoice, radioVoice, windVoice } from './ambience';
import { chargeArmedVoice, chargeBeepVoice, chargeDisarmedVoice, chargeKeyVoice, chargeToolVoice } from './charge';
import { geigerTickVoice, sirenFallVoice, sirenHoldVoice, sirenRiseVoice } from './countdown';
import { ringCrackleVoice, ringHumVoice, ringShiftVoice } from './ring';
import { heartbeatVoice, prepDroneVoice } from './preparation';
import { trapBirdsVoice, trapGravelVoice, trapMetalVoice } from './traps';
import { trainClackVoice, trainHornVoice, trainRumbleVoice } from './train';
import { playBuffer, jit } from './synth-voice';
import type { SoundEventName, SoundParams, Voice, VoiceExtras } from './types';
import { deathVoice, painVoice } from './soldier-voice';
import { challengeDoneVoice, damageTakenVoice, headshotKillVoice, headshotMarkerVoice, hitMarkerVoice, killMarkerVoice, medalVoice, pingEnemyVoice, pingVoice, rankUpVoice } from './ui';
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
    pumpRack: pumpRackVoice(),
    boltOpen: boltOpenVoice(),
    boltClose: boltCloseVoice(),
    shellInsert: shellInsertVoice(),
    coverOpen: coverOpenVoice(),
    coverShut: coverShutVoice(),
    cylinderOpen: cylinderOpenVoice(),
    cylinderLoad: cylinderLoadVoice(),
    cylinderShut: cylinderShutVoice(),
    grenadePin: grenadePinVoice(),
    grenadeThrow: grenadeThrowVoice(),
    grenadeBounce: grenadeBounceVoice(),
    explosion: explosionVoice(),
    impact: impactVoice(),
    casing: casingVoice(),
    bulletCrack: bulletCrackVoice(),
    hitMarker: hitMarkerVoice(),
    killMarker: killMarkerVoice(),
    headshotMarker: headshotMarkerVoice(),
    headshotKill: headshotKillVoice(),
    medal: medalVoice(),
    rankUp: rankUpVoice(),
    challengeDone: challengeDoneVoice(),
    damageTaken: damageTakenVoice(),
    pain: painVoice(),
    death: deathVoice(),
    nukeSiren: nukeSirenVoice(),
    nukeBlast: nukeBlastVoice(),
    ambientWind: windVoice(),
    ambientBirds: birdsVoice(),
    ambientCreak: creakVoice(),
    ambientRadio: radioVoice(),
    ambientHorn: hornVoice(),
    ambientCouplings: couplingsVoice(),
    ambientHum: humVoice(),
    trainHorn: trainHornVoice(),
    trainRumble: trainRumbleVoice(),
    trainClack: trainClackVoice(),
    chargeKey: chargeKeyVoice(),
    chargeArmed: chargeArmedVoice(),
    chargeBeep: chargeBeepVoice(),
    chargeTool: chargeToolVoice(),
    chargeDisarmed: chargeDisarmedVoice(),
    ringHum: ringHumVoice(),
    ringCrackle: ringCrackleVoice(),
    ringShift: ringShiftVoice(),
    ping: pingVoice(),
    pingEnemy: pingEnemyVoice(),
    trapBirds: trapBirdsVoice(),
    trapMetal: trapMetalVoice(),
    trapGravel: trapGravelVoice(),
    prepDrone: prepDroneVoice(),
    heartbeat: heartbeatVoice(),
    countdownSirenRise: sirenRiseVoice(),
    countdownSirenHold: sirenHoldVoice(),
    countdownSirenFall: sirenFallVoice(),
    geigerTick: geigerTickVoice(),
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
