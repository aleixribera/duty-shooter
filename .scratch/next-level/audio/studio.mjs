// Renders what the game's sound system would play, offline, in headless (and muted) Chrome:
// the real system (buses, ducking, reverbs, panner, master chain) on an OfflineAudioContext at
// 48 kHz, from a static page of the dev server so nobody's hot reload interrupts it.
//
//   const studio = await openStudio();
//   const { channels, state } = await studio.render({ seconds: 3, steps: [{ at: 0, do: 'play', event: 'gunshot', params: { local: true } }] });
//
// A spec: { seconds, bare?, mix?, seed?, steps: [{ at, do, ... }], countdown?: { from, sirenAt } }
//   do: 'play' (event, params)   'scene' (scene, timeLeft)   'sting' (sting)   'health' (health)
//       'tinnitus' (strength)    'voice' (seconds)           'mix' (mix)       'listener' (position, forward)
// `bare` leaves out the master's compressor, limiter and clipper. `seed` makes Math.random repeatable.
import { fileURLToPath } from 'node:url';
import { launchChrome } from '../../../apps/range/scripts/chrome.mjs';
import { RATE } from './metrics.mjs';

const base = process.env.BASE ?? 'http://localhost:5173/textures/asphalt.webp';
const client = fileURLToPath(new URL('../../../packages/fps-client/src/', import.meta.url)).replace(/\\/g, '/');

const page = async (client, spec, rate) => {
  const { createSoundSystem } = await import(`/@fs/${client}audio/system.ts`);
  const random = Math.random;
  if (spec.seed !== undefined) {
    let s = (spec.seed * 2654435761) >>> 0 || 1;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  try {
    const ctx = new OfflineAudioContext(2, Math.round(rate * spec.seconds), rate);
    const sys = createSoundSystem({ context: ctx, bareMaster: spec.bare === true, mix: spec.mix ?? {} });
    sys.setListener([0, 1.6, 0], [0, 0, -1], [0, 1, 0]);
    const act = (step) => {
      if (step.do === 'play') sys.play(step.event, step.params ?? {});
      else if (step.do === 'scene') sys.music.setScene(step.scene, step.timeLeft ?? null);
      else if (step.do === 'sting') sys.music.sting(step.sting);
      else if (step.do === 'health') sys.setHealth(step.health);
      else if (step.do === 'tinnitus') sys.tinnitus(step.strength);
      else if (step.do === 'voice') sys.duckForVoice(step.seconds);
      else if (step.do === 'mix') sys.setMix(step.mix);
      else if (step.do === 'listener') sys.setListener(step.position, step.forward ?? [0, 0, -1], [0, 1, 0]);
      else throw new Error(`unknown step ${step.do}`);
    };
    const later = new Map();
    for (const step of spec.steps ?? []) {
      const frame = Math.round((step.at * rate) / 128) * 128;
      // A sound can be asked for ahead of time: no need to stop the render for it.
      if (step.do === 'play' && frame > 0) sys.play(step.event, { ...(step.params ?? {}), when: step.at });
      else if (frame <= 0) act(step);
      else later.set(frame, [...(later.get(frame) ?? []), step]);
    }
    for (const [frame, steps] of later) {
      void ctx.suspend(frame / rate).then(() => {
        for (const step of steps) act(step);
        void ctx.resume();
      });
    }
    let cues = 0;
    if (spec.countdown) {
      // The countdown's cues as the game would call for them, a frame at a time, laid down by their time.
      const { CountdownSounds } = await import(`/@fs/${client}countdown-sounds.ts`);
      const sounds = new CountdownSounds();
      for (let clock = 0; clock < spec.seconds; clock += 1 / 60) {
        const left = spec.countdown.from - clock;
        for (const cue of sounds.update(left > 0 ? left : null, clock, spec.countdown.sirenAt)) {
          // `only`: just the siren's cues, or just the counter's.
          if (spec.countdown.only && !cue.event.startsWith(spec.countdown.only)) continue;
          sys.play(cue.event, { ...cue.params, when: clock + (cue.params.when ?? 0) });
          cues++;
        }
      }
    }
    const t0 = performance.now();
    const out = await ctx.startRendering();
    globalThis.__render = [out.getChannelData(0), out.getChannelData(1)];
    const state = sys.state;
    return { length: out.length, renderMs: performance.now() - t0, cues, state: JSON.parse(JSON.stringify(state)), log: sys.log.map((l) => l.event), played: sys.log.map((l) => ({ event: l.event, at: l.time + (l.params.when ?? 0) })) };
  } finally {
    Math.random = random;
  }
};

const chunk = (channel, from, to) => {
  const bytes = new Uint8Array(globalThis.__render[channel].buffer, from * 4, (to - from) * 4);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** A page call that never answers (a stuck render) fails the run instead of hanging it. */
const within = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, fail) => {
      const t = setTimeout(() => fail(new Error(`${what}: no answer in ${ms / 1000} s`)), ms);
      t.unref?.();
    }),
  ]);

export async function openStudio() {
  let chrome;
  // A fresh page has the sound system's modules to fetch before its first render; after that a render is quick.
  let fresh = true;
  const open = async () => {
    fresh = true;
    chrome = await launchChrome();
    await chrome.navigate(base);
    await chrome.waitFor('location.protocol === "http:" && document.readyState === "complete"', 30_000);
  };
  await open();
  const fail = (what) => {
    throw new Error(`${what}:\n${chrome.errors.join('\n')}`);
  };
  return {
    get chrome() {
      return chrome;
    },
    client,
    /** Runs `fn(client, ...args)` in the page (a function; its source is sent over). */
    async run(fn, ...args) {
      const out = await chrome.evaluate(`(${fn})(${[client, ...args].map((a) => JSON.stringify(a)).join(', ')})`);
      if (out === undefined) fail('page call failed');
      return out;
    },
    async render(spec) {
      // An offline render now and then never comes back (seen with suspend and resume): a fresh browser, and again.
      let info;
      for (let attempt = 1; ; attempt++) {
        try {
          info = await within(chrome.evaluate(`(${page})(${JSON.stringify(client)}, ${JSON.stringify(spec)}, ${RATE})`), (fresh ? 60_000 : 15_000) + spec.seconds * 2000, 'render');
          fresh = false;
          break;
        } catch (error) {
          if (attempt === 3) throw new Error(`${error.message}: ${chrome.errors.join(' | ')}`);
          console.error(`(render stuck, attempt ${attempt}: ${chrome.errors.slice(-2).join(' | ') || 'no page errors'}; restarting the browser)`);
          await chrome.close();
          await open();
        }
      }
      if (!info) fail(`render failed (${JSON.stringify(spec).slice(0, 200)})`);
      const channels = [];
      const step = 1_000_000;
      for (let c = 0; c < 2; c++) {
        const data = new Float32Array(info.length);
        for (let from = 0; from < info.length; from += step) {
          const to = Math.min(info.length, from + step);
          const b64 = await chrome.evaluate(`(${chunk})(${c}, ${from}, ${to})`);
          if (!b64) fail('reading the render back failed');
          const bytes = Buffer.from(b64, 'base64');
          data.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)), from);
        }
        channels.push(data);
      }
      return { channels, ...info };
    },
    close: () => chrome.close(),
  };
}
