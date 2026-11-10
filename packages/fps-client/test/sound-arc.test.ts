import { describe, expect, it } from 'vitest';
import { HEARTBEAT_FULL, Heartbeat, LOW_HEALTH, WORLD_OPEN_HZ, dangerCutoff, dangerLevel, heartbeatGap, heartbeatLevel, tinnitusStrength } from '../src/audio/danger';
import { DEFAULT_MIX, DUCK, DuckEnvelope, VOICE_DUCK_DB, busGain, dbToLinear, mergeMix, musicDuck, speechSeconds, speechVolume } from '../src/audio/mix';
import { BAR, FINAL_TEN, LAST_MINUTE, LOOP, MUSIC_SCENES, MenuArranger, MusicDirector, RISER_SECONDS, countdownAct, geigerTicks, matchScene, planScene, tension, type MatchMoment } from '../src/audio/music/scene';
import { BED_SECONDS, LOOPED, STEMS, renderStem } from '../src/audio/music/score';
import { SIREN_FALL_SECONDS, SIREN_HOLD_SECONDS, SIREN_OVERLAP, SIREN_RISE_SECONDS } from '../src/audio/countdown';
import { createRng } from '../src/audio/dsp';
import { busOf, distanceGain } from '../src/audio/system';
import { boltReleaseVoice, chargingHandleVoice, dryFireVoice, magInVoice, magOutVoice, weaponRaiseVoice } from '../src/audio/weapon';
import { CountdownSounds, geigerRate, sirenSpot } from '../src/countdown-sounds';
import { DEFAULT_SETTINGS, mixOf, parseSettings } from '../src/settings';
import { SR, hear } from './helpers/offline-audio';

/** A repeatable stand-in for Math.random. */
const seeded = (seed: number) => {
  const rng = createRng(seed);
  return () => rng.next();
};

describe('the mix', () => {
  it('multiplies the master into each bus, and holds every level to 0..1', () => {
    expect(busGain(DEFAULT_MIX, 'effects')).toBeCloseTo(0.8);
    expect(busGain(DEFAULT_MIX, 'music')).toBeCloseTo(0.56);
    expect(busGain({ ...DEFAULT_MIX, master: 0 }, 'ui')).toBe(0);
    const mix = mergeMix(DEFAULT_MIX, { music: 3, effects: -1, voice: Number.NaN, ui: 0.25 });
    expect(mix).toEqual({ master: 0.8, music: 1, effects: 0, voice: 1, ui: 0.25 });
    // The announcer is outside the graph: its two volumes reach it as one.
    expect(speechVolume({ ...DEFAULT_MIX, master: 0.5, voice: 0.5 })).toBeCloseTo(0.25);
    expect(speechVolume({ ...DEFAULT_MIX, voice: 0 })).toBe(0);
  });

  it('puts each sound on its bus: the world and your gun on effects, markers and medals on the UI', () => {
    expect(busOf('gunshot')).toBe('effects');
    expect(busOf('footstep')).toBe('effects');
    expect(busOf('hitMarker')).toBe('ui');
    expect(busOf('medal')).toBe('ui');
    // In your head rather than in the world, but not the interface's: they follow the effects volume.
    expect(busOf('heartbeat')).toBe('effects');
    expect(busOf('geigerTick')).toBe('effects');
    expect(busOf('damageTaken')).toBe('effects');
  });

  it('ducks the music under gunfire and blasts by how much of them reaches you, and under nothing else', () => {
    expect(musicDuck('gunshot', 1)).toEqual({ depth: 9, hold: 0.22 });
    expect(musicDuck('explosion', 1)!.depth).toBeGreaterThan(musicDuck('gunshot', 1)!.depth);
    expect(musicDuck('explosion', 1)!.hold).toBeGreaterThan(musicDuck('gunshot', 1)!.hold);
    const near = musicDuck('gunshot', distanceGain('gunshot', 15))!;
    expect(near.depth).toBeGreaterThan(3);
    expect(near.depth).toBeLessThan(9);
    // A rifle across the map leaves the music alone.
    expect(musicDuck('gunshot', distanceGain('gunshot', 150))).not.toBeNull();
    expect(musicDuck('gunshot', distanceGain('gunshot', 250))).toBeNull();
    expect(musicDuck('gunshot', distanceGain('gunshot', 400))).toBeNull();
    expect(musicDuck('footstep', 1)).toBeNull();
    expect(musicDuck('hitMarker', 1)).toBeNull();
  });

  it('holds the music down once through a burst, and lets it come back after', () => {
    const duck = new DuckEnvelope();
    const floor = dbToLinear(-9);
    expect(duck.valueAt(0)).toBe(1);
    // Ten rounds a tenth of a second apart: each lands before the last has let go.
    let last = { floor: 1, releaseAt: 0 };
    for (let k = 0; k < 10; k++) last = duck.trigger(k * 0.1, floor, 0.22);
    expect(last.floor).toBeCloseTo(floor);
    expect(last.releaseAt).toBeCloseTo(0.9 + 0.22);
    // Down within a few attack times, and still down between shots: no pumping.
    expect(duck.valueAt(5 * DUCK.attack)).toBeLessThan(floor + 0.01);
    for (let t = 0.1; t < 1.1; t += 0.05) expect(duck.valueAt(t)).toBeLessThan(floor + 0.01);
    // Back up after the last shot's hold: most of the way in a second, all of it in three.
    expect(duck.valueAt(1.12 + 1)).toBeGreaterThan(0.9);
    expect(duck.valueAt(1.12 + 3)).toBeGreaterThan(0.995);
    // A deeper duck landing inside a shallower one wins; a shallower one does not lift it.
    const deep = duck.trigger(10, dbToLinear(-14), 0.7);
    expect(duck.trigger(10.1, floor, 0.22)).toEqual({ floor: deep.floor, releaseAt: deep.releaseAt });
  });

  it('makes room for the announcer for about as long as the line takes to say', () => {
    expect(VOICE_DUCK_DB).toBeGreaterThan(3);
    expect(VOICE_DUCK_DB).toBeLessThan(9);
    expect(speechSeconds('Ring closing')).toBeGreaterThan(0.8);
    expect(speechSeconds('Ring closing')).toBeLessThan(1.6);
    expect(speechSeconds('10 squads left')).toBeGreaterThan(speechSeconds('Ring closing'));
    expect(speechSeconds('')).toBeLessThan(0.5);
  });
});

describe('the volume settings', () => {
  it('start from the default mix', () => {
    expect(mixOf(DEFAULT_SETTINGS)).toEqual(DEFAULT_MIX);
  });

  it('keep a save from before the mix: its one volume stays the master, each bus starts at its default', () => {
    const old = parseSettings({ defaultsVersion: 2, volume: 0.35, name: 'kept' });
    expect(old.name).toBe('kept');
    expect(mixOf(old)).toEqual({ ...DEFAULT_MIX, master: 0.35 });
    expect(mixOf(parseSettings({ volume: 0 })).master).toBe(0);
  });

  it('remember each bus, and drop what is malformed', () => {
    const s = parseSettings({ volume: 1, musicVolume: 0, effectsVolume: 0.5, voiceVolume: 0.25, uiVolume: 0.75 });
    expect(mixOf(s)).toEqual({ master: 1, music: 0, effects: 0.5, voice: 0.25, ui: 0.75 });
    const bad = parseSettings({ musicVolume: 7, effectsVolume: -2, voiceVolume: 'loud', uiVolume: null });
    expect(mixOf(bad)).toEqual({ ...DEFAULT_MIX, music: 1, effects: 0 });
  });
});

describe('the score', () => {
  const moment = (m: Partial<MatchMoment>): MatchMoment => ({ phase: 'playing', timeLeft: null, finalStage: false, won: null, ...m });

  it('knows the countdown from the clock: the last minute, then the final ten', () => {
    expect(countdownAct(null)).toBe('none');
    expect(countdownAct(75)).toBe('none');
    expect(countdownAct(LAST_MINUTE + 0.01)).toBe('none');
    expect(countdownAct(LAST_MINUTE)).toBe('lastMinute');
    expect(countdownAct(FINAL_TEN + 0.01)).toBe('lastMinute');
    expect(countdownAct(FINAL_TEN)).toBe('final10');
    expect(countdownAct(0.2)).toBe('final10');
    expect(countdownAct(0)).toBe('none');
    expect(countdownAct(-3)).toBe('none');
  });

  it('picks the scene a match calls for', () => {
    // Mostly silence: players need their ears.
    expect(matchScene(moment({ timeLeft: 300 }))).toBe('match');
    expect(matchScene(moment({ phase: null }))).toBe('match');
    expect(matchScene(moment({ timeLeft: 42 }))).toBe('lastMinute');
    expect(matchScene(moment({ timeLeft: 7 }))).toBe('final10');
    expect(matchScene(moment({ finalStage: true }))).toBe('finalStage');
    // The clock outranks the last Ring.
    expect(matchScene(moment({ finalStage: true, timeLeft: 30 }))).toBe('lastMinute');
    expect(matchScene(moment({ phase: 'lobby' }))).toBe('menu');
    expect(matchScene(moment({ phase: 'nuke', won: true }))).toBe('victory');
    expect(matchScene(moment({ phase: 'vote', won: false }))).toBe('defeat');
    // A draw, or a match only watched, ends without a sting.
    expect(matchScene(moment({ phase: 'nuke', won: null }))).toBe('match');
    // A result never plays over a match still being played.
    expect(matchScene(moment({ phase: 'playing', won: true }))).toBe('match');
  });

  it('changes scene once, however often it is asked', () => {
    const director = new MusicDirector();
    expect(director.scene).toBe('silence');
    expect(director.setScene('silence')).toBeNull();
    const menu = director.setScene('menu')!;
    expect(menu.plan.scene).toBe('menu');
    expect(menu.plan.arranged).toBe(true);
    expect(menu.plan.loops.map((l) => l.stem)).toEqual(['pad']);
    for (let frame = 0; frame < 5; frame++) expect(director.setScene('menu')).toBeNull();
    // The menu goes at its own pace; silence is quick.
    expect(director.setScene('match')!.fadeOut).toBeCloseTo(1.2);
    expect(director.setScene('lastMinute', 60)!.plan.loops[0]!.stem).toBe('bed');
    // The rise joins the bed already playing: nothing is let go, and it brings no bed of its own.
    expect(director.setScene('final10', 10)!).toMatchObject({ fadeOut: 0, plan: { joins: true, loops: [], shots: [{ stem: 'riser', offset: 0 }] } });
    expect(director.setScene('silence')!).toMatchObject({ fadeOut: 0.4, plan: { hush: true } });
    // A hidden page stopped everything: the same scene asked again starts afresh.
    director.setScene('menu');
    director.reset();
    expect(director.setScene('menu')).not.toBeNull();
  });

  it('plans each scene: stings for the endings, nothing for a match, the bed wound tighter as the clock runs', () => {
    for (const scene of MUSIC_SCENES) expect(planScene(scene).scene).toBe(scene);
    expect(planScene('match')).toMatchObject({ loops: [], shots: [], sting: null, hush: false });
    expect(planScene('victory').sting).toBe('victory');
    expect(planScene('defeat').sting).toBe('defeat');
    // Entered on time, the bed winds from rest to a semitone up over fifty seconds.
    const bed = planScene('lastMinute', 60).loops[0]!;
    expect(bed.rate).toBeCloseTo(1);
    expect(bed.rateTo).toBeCloseTo(Math.pow(2, 1 / 12));
    expect(bed.over).toBeCloseTo(50);
    expect(bed.cutoffTo!).toBeGreaterThan(bed.cutoff! * 4);
    // Entered late (a player joining at 0:35), it starts where it would have been by then.
    const late = planScene('lastMinute', 35).loops[0]!;
    expect(late.rate).toBeCloseTo(tension(35).rate);
    expect(late.rate).toBeGreaterThan(1);
    expect(late.over).toBeCloseTo(25);
    // The riser is cut to end with the match, wherever it is joined.
    expect(planScene('final10', 10).shots[0]).toMatchObject({ stem: 'riser', offset: 0 });
    // Joined cold, the rise has the bed under it, wound up.
    expect(planScene('final10', 4)).toMatchObject({ joins: false, loops: [{ stem: 'bed', rate: tension(FINAL_TEN).rate, cutoff: tension(FINAL_TEN).cutoff }] });
    expect(planScene('final10', 4).shots[0]!.offset).toBeCloseTo(RISER_SECONDS - 4);
    // The last Ring's bed is the countdown's, lower and darker, and stays put.
    const stage = planScene('finalStage').loops[0]!;
    expect(stage.stem).toBe('bed');
    expect(stage.rate).toBeLessThan(1);
    expect(stage.rateTo).toBeUndefined();
  });

  it('tightens steadily through the last minute', () => {
    let before = tension(60);
    for (let left = 59; left >= 10; left--) {
      const now = tension(left);
      expect(now.rate).toBeGreaterThan(before.rate);
      expect(now.cutoff).toBeGreaterThan(before.cutoff);
      before = now;
    }
    expect(tension(5)).toEqual(tension(10));
  });

  it('arranges the menu theme so the motif keeps returning without wearing out', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const arranger = new MenuArranger(seeded(seed));
      const cycles = Array.from({ length: 60 }, () => arranger.next());
      // The pad alone first, then the motif.
      expect(cycles[0]!.lead).toBeNull();
      expect(cycles[0]!.siren).toBeNull();
      expect(cycles[1]!.lead).toBe('leadA');
      let sinceMotif = 0;
      let run = 0;
      for (const [k, c] of cycles.entries()) {
        if (k === 0) continue;
        sinceMotif = c.lead === 'leadA' ? 0 : sinceMotif + 1;
        run = c.lead === 'leadA' ? run + 1 : 0;
        // Back within two cycles, never three times running.
        expect(sinceMotif).toBeLessThanOrEqual(2);
        expect(run).toBeLessThanOrEqual(2);
        if (c.siren !== null) expect([0, 4 * BAR]).toContain(c.siren);
        for (const tick of c.ticks) {
          expect(tick.at).toBeGreaterThanOrEqual(0);
          expect(tick.at).toBeLessThan(LOOP);
          expect(tick.level).toBeGreaterThan(0);
          expect(tick.level).toBeLessThanOrEqual(1);
        }
      }
      // All three colours are heard: the motif, its answer, and rests.
      expect(cycles.some((c) => c.lead === 'leadB')).toBe(true);
      expect(cycles.slice(1).some((c) => c.lead === null)).toBe(true);
      expect(cycles.some((c) => c.siren !== null)).toBe(true);
    }
    // The counter chatters at about its rate, and warms up from nothing.
    const steady = geigerTicks(seeded(9), 0.55).length;
    expect(steady).toBeGreaterThan(8);
    expect(steady).toBeLessThan(45);
    const warming = geigerTicks(seeded(9), 0.55, true);
    expect(warming.length).toBeLessThan(steady);
    expect(warming.filter((t) => t.at < LOOP / 4).length).toBeLessThanOrEqual(warming.filter((t) => t.at >= (3 * LOOP) / 4).length);
  });

  it('renders every stem clean, and its loops closing on themselves', () => {
    const sr = 12000;
    for (const stem of STEMS) {
      const channels = renderStem(stem, sr);
      expect(channels.length).toBeGreaterThanOrEqual(1);
      for (const data of channels) {
        let peak = 0;
        let sum = 0;
        let step = 0;
        let finite = true;
        for (let i = 0; i < data.length; i++) {
          const v = data[i]!;
          if (!Number.isFinite(v)) finite = false;
          peak = Math.max(peak, Math.abs(v));
          sum += v;
          if (i > 0) step = Math.max(step, Math.abs(v - data[i - 1]!));
        }
        expect(finite, stem).toBe(true);
        expect(peak, stem).toBeGreaterThan(0.05);
        expect(peak, stem).toBeLessThanOrEqual(1);
        // No DC offset to thump when it starts or stops.
        expect(Math.abs(sum / data.length), stem).toBeLessThan(0.005);
        if (LOOPED.includes(stem)) {
          expect(data.length, stem).toBe(Math.round((stem === 'pad' ? LOOP : BED_SECONDS) * sr));
          // The jump from the last sample back to the first is no bigger than the steps inside the loop: no click at the seam.
          expect(Math.abs(data[0]! - data[data.length - 1]!), stem).toBeLessThanOrEqual(step);
        } else {
          // A one-shot starts and ends at rest.
          expect(Math.abs(data[0]!), stem).toBeLessThan(0.02);
          expect(Math.abs(data[data.length - 1]!), stem).toBeLessThan(0.02);
        }
      }
    }
  });
});

describe('nearly dead', () => {
  it('begins under 30 health and is deepest at 5', () => {
    expect(LOW_HEALTH).toBe(30);
    expect(dangerLevel(100)).toBe(0);
    expect(dangerLevel(30)).toBe(0);
    expect(dangerLevel(17.5)).toBeCloseTo(0.5);
    expect(dangerLevel(5)).toBe(1);
    expect(dangerLevel(1)).toBe(1);
    // Dead, or nobody to be: nothing.
    expect(dangerLevel(0)).toBe(0);
    expect(dangerLevel(null)).toBe(0);
  });

  it('closes a low-pass over the world as health drops, and opens it again on the way back up', () => {
    expect(dangerCutoff(100)).toBe(WORLD_OPEN_HZ);
    expect(dangerCutoff(30)).toBe(WORLD_OPEN_HZ);
    expect(dangerCutoff(null)).toBe(WORLD_OPEN_HZ);
    expect(dangerCutoff(29.99)).toBeGreaterThan(8500);
    expect(dangerCutoff(29.99)).toBeLessThanOrEqual(9000);
    expect(dangerCutoff(5)).toBeCloseTo(1100);
    for (let h = 29; h >= 5; h--) expect(dangerCutoff(h)).toBeLessThan(dangerCutoff(h + 0.5));
  });

  it('beats a heart that quickens from 66 a minute to 140, and fills out', () => {
    expect(60 / heartbeatGap(29.9)).toBeGreaterThan(64);
    expect(60 / heartbeatGap(29.9)).toBeLessThan(68);
    expect(60 / heartbeatGap(5)).toBeCloseTo(140, 0);
    for (let h = 29; h >= 5; h--) expect(heartbeatGap(h)).toBeLessThan(heartbeatGap(h + 1));
    expect(heartbeatLevel(29)).toBeLessThan(heartbeatLevel(10));
    expect(heartbeatLevel(5)).toBeCloseTo(HEARTBEAT_FULL);
  });

  it('times the beats: none above 30, the first at once, then one after another at the health they are at', () => {
    const heart = new Heartbeat();
    const beats: number[] = [];
    let health: number | null = 80;
    for (let frame = 0; frame < 60 * 30; frame++) {
      const clock = frame / 60;
      if (clock >= 2) health = 25;
      if (clock >= 12) health = 6;
      if (clock >= 20) health = 55;
      for (const b of heart.update(health, clock)) {
        expect(b.when).toBeGreaterThanOrEqual(0);
        expect(b.when).toBeLessThan(0.2);
        expect(b.intensity).toBeCloseTo(heartbeatLevel(health!));
        beats.push(clock + b.when);
      }
    }
    expect(beats[0]).toBeCloseTo(2, 1);
    expect(beats.at(-1)!).toBeLessThan(20.5);
    const gaps = (from: number, to: number) => beats.filter((t) => t >= from && t < to).map((t, k, list) => (k === 0 ? null : t - list[k - 1]!)).filter((g): g is number => g !== null);
    for (const gap of gaps(3, 12)) expect(gap).toBeCloseTo(heartbeatGap(25), 5);
    for (const gap of gaps(13, 20)) expect(gap).toBeCloseTo(heartbeatGap(6), 5);
    expect(gaps(13, 20).length).toBeGreaterThan(gaps(3, 10).length);
    // Hurt again after healing, the heart starts on the hit, not where it left off.
    expect(heart.update(20, 40)[0]!.when).toBe(0);
  });

  it('rings the ears after a close blast that hurt: by nearness and by damage, not at all past 9 m', () => {
    expect(tinnitusStrength(0, 90)).toBe(1);
    expect(tinnitusStrength(2, 60)).toBeGreaterThan(tinnitusStrength(6, 60));
    expect(tinnitusStrength(3, 60)).toBeGreaterThan(tinnitusStrength(3, 10));
    expect(tinnitusStrength(3, 10)).toBeGreaterThan(0);
    expect(tinnitusStrength(9, 40)).toBe(0);
    expect(tinnitusStrength(20, 40)).toBe(0);
    expect(tinnitusStrength(1, 0)).toBe(0);
  });
});

describe('the countdown', () => {
  it('ticks faster and faster: a slow chatter through the last minute, a buzz through the final ten', () => {
    expect(geigerRate(75)).toBe(0);
    expect(geigerRate(60)).toBeCloseTo(0.5);
    expect(geigerRate(10.001)).toBeCloseTo(3, 1);
    expect(geigerRate(10)).toBeCloseTo(5);
    expect(geigerRate(0.001)).toBeCloseTo(30, 0);
    expect(geigerRate(0)).toBe(0);
    for (let left = 59; left > 0; left--) expect(geigerRate(left)).toBeGreaterThan(geigerRate(left + 1));
  });

  /** A match's last 75 s at 60 frames a second, and 10 s after it; each cue with the clock it sounds at. */
  const run = (endsAt: number | null = null) => {
    const sounds = new CountdownSounds(seeded(11));
    const at: [number, number, number] = [-200, 22, -260];
    const cues: { event: string; time: number; left: number; position: readonly number[] | undefined; cut: readonly string[] | undefined }[] = [];
    for (let frame = 0; frame < 60 * 85; frame++) {
      const clock = 100 + frame / 60;
      const left = 75 - frame / 60;
      const timeLeft = endsAt !== null && left <= endsAt ? null : left > 0 ? left : null;
      for (const c of sounds.update(timeLeft, clock, at)) {
        const when = c.params.when ?? 0;
        expect(when).toBeGreaterThanOrEqual(0);
        cues.push({ event: c.event, time: clock + when - 100, left: left - when, position: c.params.position, cut: c.cut });
      }
    }
    return { cues, sounds };
  };

  it('winds a siren up at the map’s edge as the last minute begins, holds it to the end, and winds it down', () => {
    const { cues, sounds } = run();
    const siren = cues.filter((c) => c.event.startsWith('countdownSiren'));
    // Silent until a minute is left.
    expect(cues.every((c) => c.left <= LAST_MINUTE + 0.02)).toBe(true);
    expect(siren[0]!.event).toBe('countdownSirenRise');
    expect(siren[0]!.left).toBeCloseTo(60, 1);
    expect(siren.filter((c) => c.event === 'countdownSirenRise')).toHaveLength(1);
    expect(siren.every((c) => c.position?.[0] === -200 && c.position?.[2] === -260)).toBe(true);
    // The held note is laid end over end with no gap: each segment starts before the one before it is over.
    const holds = siren.filter((c) => c.event === 'countdownSirenHold');
    expect(holds[0]!.time - siren[0]!.time).toBeCloseTo(SIREN_RISE_SECONDS - SIREN_OVERLAP, 5);
    for (let k = 1; k < holds.length; k++) expect(holds[k]!.time - holds[k - 1]!.time).toBeCloseTo(SIREN_HOLD_SECONDS - SIREN_OVERLAP, 5);
    expect(holds.at(-1)!.left).toBeLessThan(SIREN_HOLD_SECONDS);
    // One wind-down as the clock runs out, the held note fading under it, and then quiet.
    const falls = siren.filter((c) => c.event === 'countdownSirenFall');
    expect(falls).toHaveLength(1);
    expect(siren.at(-1)!.event).toBe('countdownSirenFall');
    expect(falls[0]!.left).toBeCloseTo(0, 1);
    expect(falls[0]!.cut).toEqual(['countdownSirenRise', 'countdownSirenHold']);
    expect(siren.filter((c) => c.cut)).toHaveLength(1);
    expect(SIREN_FALL_SECONDS).toBeGreaterThan(3);
    expect(sounds.wailing).toBe(false);
  });

  it('runs the counter up to the last second and stops with the clock', () => {
    const { cues } = run();
    const ticks = cues.filter((c) => c.event === 'geigerTick');
    const between = (hi: number, lo: number) => ticks.filter((c) => c.left <= hi && c.left > lo).length;
    expect(ticks.every((c) => c.left > 0 && c.left <= LAST_MINUTE + 0.02)).toBe(true);
    // About the rate asked for: a handful in the first ten seconds, hundreds in the last.
    expect(between(60, 50)).toBeGreaterThan(1);
    expect(between(60, 50)).toBeLessThan(20);
    expect(between(20, 10)).toBeGreaterThan(between(60, 50));
    expect(between(10, 0)).toBeGreaterThan(between(20, 10) * 3);
    expect(between(10, 0)).toBeGreaterThan(90);
    expect(between(10, 0)).toBeLessThan(220);
    expect(between(2, 0)).toBeGreaterThan(between(10, 8));
    // Never two on top of each other, never a rhythm: the gaps differ.
    const gaps = ticks.slice(1).map((c, k) => c.time - ticks[k]!.time);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(new Set(gaps.map((g) => g.toFixed(3))).size).toBeGreaterThan(gaps.length / 4);
    for (const c of ticks) expect(c.position).toBeUndefined();
  });

  it('winds the siren down at once when the match ends early', () => {
    const { cues, sounds } = run(30);
    const last = cues.at(-1)!;
    expect(last.event).toBe('countdownSirenFall');
    expect(last.left).toBeCloseTo(30, 1);
    expect(cues.filter((c) => c.event === 'countdownSirenFall')).toHaveLength(1);
    expect(cues.every((c) => c.event === 'countdownSirenFall' || c.left >= 30 - SIREN_HOLD_SECONDS)).toBe(true);
    expect(sounds.wailing).toBe(false);
  });

  it('goes quiet with no wind-down when the match is left, and says so once', () => {
    const sounds = new CountdownSounds(seeded(5));
    const at: [number, number, number] = [0, 22, 0];
    expect(sounds.hush(false)).toBe(false);
    for (let frame = 0; frame < 600; frame++) sounds.update(40 - frame / 60, 100 + frame / 60, at);
    expect(sounds.wailing).toBe(true);
    expect(sounds.hush(false)).toBe(true);
    expect(sounds.hush(false)).toBe(false);
    expect(sounds.wailing).toBe(false);
    // Nothing more comes of it: no wind-down over the menu.
    expect(sounds.update(null, 111, at)).toEqual([]);
  });

  it('holds while the clock stands still, and takes the held note up again with no second wind-up', () => {
    const sounds = new CountdownSounds(seeded(5));
    const at: [number, number, number] = [0, 22, 0];
    for (let frame = 0; frame < 900; frame++) sounds.update(40 - frame / 60, 100 + frame / 60, at);
    // Paused at 25 s left, for a minute of the page's clock.
    expect(sounds.hush(true)).toBe(true);
    for (let frame = 0; frame < 3600; frame++) expect(sounds.hush(true)).toBe(false);
    const back = sounds.update(25, 175, at);
    expect(back.map((c) => c.event).filter((e) => e.startsWith('countdownSiren'))).toEqual(['countdownSirenHold']);
    expect(back.find((c) => c.event === 'countdownSirenHold')!.params.when).toBe(0);
    // And the clock running out after that still winds it down, once.
    const end = sounds.update(null, 176, at);
    expect(end.map((c) => c.event)).toEqual(['countdownSirenFall']);
  });

  it('stands the siren beyond the north-west edge of what is built, whatever lies far off', () => {
    const box = (x: number, z: number) => ({ min: [x - 2, 0, z - 2] as [number, number, number], max: [x + 2, 4, z + 2] as [number, number, number] });
    const town = Array.from({ length: 100 }, (_, k) => box(-50 + (k % 10) * 11, -50 + Math.floor(k / 10) * 11));
    const spot = sirenSpot(town);
    expect(spot[0]).toBeLessThan(-80);
    expect(spot[2]).toBeLessThan(-100);
    expect(spot[1]).toBeGreaterThan(10);
    // Far enough to be "the town's siren", near enough to be heard.
    const reach = Math.hypot(spot[0], spot[2]);
    expect(reach).toBeGreaterThan(100);
    expect(reach).toBeLessThan(260);
    // A backdrop two kilometres out moves it no more than a few metres.
    const withFar = sirenSpot([...town, box(2000, 2000)]);
    expect(Math.hypot(withFar[0] - spot[0], withFar[2] - spot[2])).toBeLessThan(15);
    expect(sirenSpot([])[1]).toBeGreaterThan(10);
  });
});

describe('each gun’s handling', () => {
  /** How bright a rendered sound is: zero crossings a second, a stand-in for its spectral centroid. */
  const brightness = (data: Float32Array) => {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) if (data[i]! >= 0 !== data[i - 1]! >= 0) crossings++;
    return crossings / (data.length / SR);
  };
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const bright = (voice: ReturnType<typeof magInVoice>, event: 'reloadMagIn' | 'reloadMagOut' | 'dryFire' | 'weaponRaise' | 'reloadBoltRelease' | 'reloadChargingHandle', weapon: 'm4a1' | 'smg' | 'shotgun' | 'sniper' | 'pistol') =>
    median(Array.from({ length: 6 }, () => brightness(hear(voice, event, { local: true, weapon }, null))));

  it('is its own: a pistol’s magazine is over sooner and brighter than a rifle’s, the .308’s box longer and lower', () => {
    for (const [voice, event] of [[magInVoice(), 'reloadMagIn'], [magOutVoice(), 'reloadMagOut']] as const) {
      const length = (weapon: 'm4a1' | 'smg' | 'sniper' | 'pistol') => voice.lengthOf!({ local: true, weapon });
      expect(length('pistol')).toBeLessThan(length('smg'));
      expect(length('smg')).toBeLessThan(length('m4a1'));
      expect(length('m4a1')).toBeLessThan(length('sniper'));
      expect(length('sniper')).toBeLessThanOrEqual(voice.duration!);
      expect(bright(voice, event, 'pistol')).toBeGreaterThan(bright(voice, event, 'm4a1'));
      expect(bright(voice, event, 'sniper')).toBeLessThan(bright(voice, event, 'm4a1'));
    }
  });

  it('closes each action its own way: a slide is lighter than a carrier, a side handle quicker than a charging handle', () => {
    const release = boltReleaseVoice();
    expect(release.lengthOf!({ local: true, weapon: 'pistol' })).toBeLessThan(release.lengthOf!({ local: true, weapon: 'm4a1' }));
    expect(bright(release, 'reloadBoltRelease', 'pistol')).toBeGreaterThan(bright(release, 'reloadBoltRelease', 'm4a1'));
    const handle = chargingHandleVoice();
    expect(handle.lengthOf!({ local: true, weapon: 'smg' })).toBeLessThan(handle.lengthOf!({ local: true, weapon: 'm4a1' }));
    expect(bright(handle, 'reloadChargingHandle', 'smg')).toBeGreaterThan(bright(handle, 'reloadChargingHandle', 'm4a1'));
  });

  it('raises and dry-fires by weight: the pistol quickest and brightest, the long guns slowest and lowest', () => {
    const raise = weaponRaiseVoice();
    const length = (weapon: 'm4a1' | 'smg' | 'shotgun' | 'sniper' | 'pistol') => raise.lengthOf!({ local: true, weapon });
    expect(length('pistol')).toBeLessThan(length('smg'));
    expect(length('smg')).toBeLessThan(length('m4a1'));
    expect(length('m4a1')).toBeLessThan(length('shotgun'));
    expect(length('shotgun')).toBeLessThan(length('sniper'));
    expect(bright(raise, 'weaponRaise', 'sniper')).toBeLessThan(bright(raise, 'weaponRaise', 'smg'));
    const dry = dryFireVoice();
    expect(dry.lengthOf!({ local: true, weapon: 'pistol' })).toBeLessThan(dry.lengthOf!({ local: true, weapon: 'm4a1' }));
    expect(dry.lengthOf!({ local: true, weapon: 'm4a1' })).toBeLessThan(dry.lengthOf!({ local: true, weapon: 'sniper' }));
    expect(bright(dry, 'dryFire', 'shotgun')).toBeLessThan(bright(dry, 'dryFire', 'smg'));
  });

  it('falls back on the rifle’s for a gun with no take of its own, and when no gun is named', () => {
    const out = magOutVoice();
    expect(out.lengthOf!({ local: true, weapon: 'shotgun' })).toBe(out.lengthOf!({ local: true, weapon: 'm4a1' }));
    expect(out.lengthOf!({ local: true })).toBe(out.lengthOf!({ local: true, weapon: 'm4a1' }));
    expect(hear(out, 'reloadMagOut', { local: true, weapon: 'shotgun' }, null).some((v) => v !== 0)).toBe(true);
    // Someone else's reload is the same object, heard from where they stand.
    expect(hear(out, 'reloadMagOut', { weapon: 'pistol' }, 8).some((v) => v !== 0)).toBe(true);
  });
});
