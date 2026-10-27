// Prints how loud every sound is, for balancing the mix: each voice is
// rendered offline in headless Chrome (dry path scaled by the distance law,
// plus its reverb send), and its peak and loudest 50 ms RMS are given in dBFS.
//
//   node apps/range/scripts/sound-levels.mjs [base url]
import { fileURLToPath } from 'node:url';
import { launchChrome } from './chrome.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const audio = fileURLToPath(new URL('../../../packages/fps-client/src/audio/', import.meta.url)).replace(/\\/g, '/');

// [label, event, params, distances (null = not placed in the world)]
const FAR = [1, 5, 15, 40];
const CASES = [
  ['own gunshot', 'gunshot', { local: true }, [null]],
  ['remote gunshot', 'gunshot', {}, [5, 15, 40, 100]],
  ['remote gunshot indoors', 'gunshot', { environment: 'indoor' }, [5, 15]],
  ['bullet crack', 'bulletCrack', {}, [2, 5]],
  ['impact concrete', 'impact', { material: 'concrete' }, [2, 5, 15]],
  ['impact wood', 'impact', { material: 'wood' }, [2, 5, 15]],
  ['own footstep walk', 'footstep', { local: true, material: 'concrete', movement: 'walk' }, [null]],
  ['own footstep sprint', 'footstep', { local: true, material: 'concrete', movement: 'sprint' }, [null]],
  ['enemy footstep walk', 'footstep', { material: 'concrete', movement: 'walk' }, FAR],
  ['enemy footstep sprint', 'footstep', { material: 'concrete', movement: 'sprint' }, FAR],
  ['enemy footstep grass', 'footstep', { material: 'grass', movement: 'sprint' }, FAR],
  ['enemy footstep crouch', 'footstep', { material: 'concrete', movement: 'crouch' }, FAR],
  ['own jump', 'jump', { local: true }, [null]],
  ['own land', 'land', { local: true, intensity: 0.6 }, [null]],
  ['own slide', 'slide', { local: true, material: 'concrete' }, [null]],
  ['own mantle', 'mantle', { local: true }, [null]],
  ['enemy land', 'land', { intensity: 0.6 }, FAR],
  ['enemy slide', 'slide', { material: 'concrete' }, FAR],
  ['enemy mantle', 'mantle', {}, FAR],
  ['own crouch', 'crouch', { local: true }, [null]],
  ['own prone', 'prone', { local: true }, [null]],
  ['mag out', 'reloadMagOut', { local: true }, [null]],
  ['mag in', 'reloadMagIn', { local: true }, [null]],
  ['bolt release', 'reloadBoltRelease', { local: true }, [null]],
  ['charging handle', 'reloadChargingHandle', { local: true }, [null]],
  ['enemy mag in', 'reloadMagIn', {}, FAR],
  ['weapon raise', 'weaponRaise', { local: true }, [null]],
  ['ads in', 'adsIn', { local: true }, [null]],
  ['dry fire', 'dryFire', { local: true }, [null]],
  ['inspect', 'inspectRattle', { local: true }, [null]],
  ['melee swing', 'meleeSwing', { local: true }, [null]],
  ['melee hit', 'meleeHit', { local: true }, [null]],
  ['casing', 'casing', { material: 'concrete' }, [1.5]],
  ['hit marker', 'hitMarker', {}, [null]],
  ['headshot marker', 'headshotMarker', {}, [null]],
  ['kill marker', 'killMarker', {}, [null]],
  ['damage taken', 'damageTaken', {}, [null]],
  ['nuke siren', 'nukeSiren', {}, [40, 150]],
  ['nuke blast', 'nukeBlast', {}, [100, 300]],
  ['wind', 'ambientWind', { intensity: 1 }, [null]],
  ['bird', 'ambientBirds', {}, [15, 40]],
  ['sign creak', 'ambientCreak', { intensity: 1 }, [3, 10]],
  ['radio', 'ambientRadio', {}, [2, 6]],
];

const measure = async (audio, cases) => {
  const { createDefaultVoices } = await import(`/@fs/${audio}voices.ts`);
  const { distanceGain, mixLevel, reverbSend } = await import(`/@fs/${audio}system.ts`);
  const { kitFor } = await import(`/@fs/${audio}kit.ts`);
  const voices = createDefaultVoices();
  const rate = 48000;
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const rows = [];
  for (const [label, event, params, distances] of cases) {
    for (const distance of distances) {
      const seconds = event.startsWith('nuke') ? 8 : 3;
      const ctx = new OfflineAudioContext(2, rate * seconds, rate);
      const voice = voices[event];
      voice.warm?.(ctx);
      for (const task of voice.warmTasks?.(ctx) ?? []) task();
      const input = ctx.createGain();
      input.gain.value = mixLevel(event);
      const dry = ctx.createGain();
      dry.gain.value = distanceGain(event, distance);
      input.connect(dry).connect(ctx.destination);
      const send = reverbSend(event, params.environment ?? 'outdoor', distance);
      if (send > 0.001) {
        const conv = ctx.createConvolver();
        conv.normalize = false;
        conv.buffer = kitFor(ctx).impulseResponses()[params.environment ?? 'outdoor'];
        const g = ctx.createGain();
        g.gain.value = send;
        input.connect(g).connect(conv).connect(ctx.destination);
      }
      voice.play(ctx, input, distance === null ? params : { ...params, position: [distance, 0, 0], distance }, 0.01);
      const out = await ctx.startRendering();
      const l = out.getChannelData(0);
      const r = out.getChannelData(1);
      let peak = 0;
      let rms = 0;
      const win = Math.round(rate * 0.05);
      let sum = 0;
      for (let i = 0; i < l.length; i++) {
        const s = Math.max(Math.abs(l[i]), Math.abs(r[i]));
        peak = Math.max(peak, s);
        sum += (l[i] * l[i] + r[i] * r[i]) / 2;
        if (i >= win) sum -= (l[i - win] * l[i - win] + r[i - win] * r[i - win]) / 2;
        if (i >= win - 1) rms = Math.max(rms, Math.sqrt(Math.max(0, sum) / win));
      }
      rows.push({ label, distance, peak: db(peak), rms: db(rms) });
    }
  }
  return rows;
};

const chrome = await launchChrome();
try {
  await chrome.navigate(base);
  await chrome.waitFor('document.readyState === "complete"', 30_000);
  const rows = await chrome.evaluate(`(${measure})(${JSON.stringify(audio)}, ${JSON.stringify(CASES)})`);
  if (!rows) throw new Error(`Measuring failed:\n${chrome.errors.join('\n')}`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('sound', 26)}${pad('at', 8)}${pad('peak dB', 10)}loudest 50 ms dB`);
  for (const r of rows) console.log(`${pad(r.label, 26)}${pad(r.distance === null ? '-' : `${r.distance} m`, 8)}${pad(r.peak.toFixed(1), 10)}${r.rms.toFixed(1)}`);
  if (chrome.errors.length) console.log(`console errors:\n${chrome.errors.join('\n')}`);
} finally {
  await chrome.close();
}
