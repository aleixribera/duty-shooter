import type { Vec3 } from '@duty-shooter/fps-core';
import { color, float, positionLocal, smoothstep, uv, vec4 } from 'three/tsl';
import { AdditiveBlending, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Sprite, SpriteNodeMaterial, type Object3D } from 'three/webgpu';
import type { SoundEventName, SoundParams } from './audio';
import { RUMBLE_OVERLAP, RUMBLE_SECONDS } from './audio/train';
import { loadMapModels } from './map-models';
import type { Finish, FreightTrain } from './surfaces';

/** One sound of the train to play now. */
export interface TrainCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
}

/** How far ahead (s) sounds are queued, so each starts on time between frames. */
const LOOKAHEAD = 0.1;
/** The rumble is heard while the train's nearest point is this close (m). */
const HEARD = 400;
/** The diesels drown the wagons this far back from the head (m). */
const LOCOS = 25;
/** A horn, a clack or a rumble segment missed by more than this (s) is not played late. */
const LATE = 1;

/** The x of the train's head `t` s after the match ended, or null while a match is on. */
export function trainHead(train: FreightTrain, t: number | null): number | null {
  return t === null ? null : train.start - train.speed * t;
}

/**
 * Schedules the train's sounds from the time since the match ended: the
 * horn from the head at its times, the roar from the train's nearest point
 * while it is near, the diesels' at the head, and a clack as each bogie
 * passes the listener, from the rail joint beside them. Feed it every
 * frame; null (a match on) resets it for the next match's end.
 */
export class TrainSounds {
  readonly #train: FreightTrain;
  /** The time last seen, the next rumble segment and how many horns and clacks have sounded (each in order). */
  #last: number | null = null;
  #rumble: number | null = null;
  #horns = 0;
  #clacks = 0;

  constructor(train: FreightTrain) {
    this.#train = train;
  }

  update(t: number | null, listener: Vec3): TrainCue[] {
    if (t === null || (this.#last !== null && t < this.#last - 0.5)) {
      this.#last = null;
      this.#rumble = null;
      this.#horns = 0;
      this.#clacks = 0;
      if (t === null) return [];
    }
    const train = this.#train;
    const first = this.#last === null;
    this.#last = t;
    const cues: TrainCue[] = [];
    const due = (at: number) => at <= t + LOOKAHEAD;
    // Someone joining part way through hears only what is still to come.
    const live = (at: number) => !first || at >= t - LATE;
    const when = (at: number) => Math.max(0, at - t);

    while (this.#horns < train.horns.length && due(train.horns[this.#horns]!)) {
      const at = train.horns[this.#horns++]!;
      if (live(at)) cues.push({ event: 'trainHorn', params: { position: [trainHead(train, at)!, 3.5, train.z], when: when(at) } });
    }

    // Bogie i is over the listener's x when the head is that far short of it.
    const lx = listener[0];
    const passes = (i: number) => (train.start - (lx - train.bogies[i]!)) / train.speed;
    while (this.#clacks < train.bogies.length && due(passes(this.#clacks))) {
      const at = passes(this.#clacks++);
      if (at >= 0 && live(at)) cues.push({ event: 'trainClack', params: { position: [lx, 0.3, train.z], when: when(at) } });
    }

    this.#rumble ??= Math.max(0, t);
    while (due(this.#rumble)) {
      const at = this.#rumble;
      this.#rumble += RUMBLE_SECONDS - RUMBLE_OVERLAP;
      const head = trainHead(train, at)!;
      const x = Math.min(Math.max(lx, head), head + train.length);
      if (Math.hypot(x - lx, train.z - listener[2]) > HEARD || !live(at)) continue;
      cues.push({ event: 'trainRumble', params: { position: [x, 2, train.z], intensity: x - head < LOCOS ? 1 : 0, when: when(at) } });
    }
    return cues;
  }
}

/** The pool of light the headlights throw on the ballast ahead: additive and unlit, brightest in the middle and soft to its edges. */
function pool(hex: number, strength: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const r = uv().sub(0.5).length().mul(2);
  m.colorNode = vec4(color(hex).mul(strength), smoothstep(float(1), float(0), r).pow(2));
  return m;
}

/**
 * Switchyard's end-of-match freight train, drawn only: the locos and
 * wagons (the map's models, loaded once), the lead loco's headlights with
 * their beams and the pool of light they throw down the line. Driven by
 * the time since the match ended, so everyone sees it in the same place;
 * nothing collides with it. Hidden while a match is on.
 */
export class Train {
  readonly root = new Group();
  readonly #train: FreightTrain;

  constructor(parent: Object3D, train: FreightTrain, finishes: Readonly<Record<string, Finish>>) {
    this.#train = train;
    this.root.name = 'train';
    this.root.visible = false;
    this.root.position.set(train.start, 0, train.z);
    void loadMapModels(train.models, finishes).then((models) => this.root.add(models));

    const lamps = new Group();
    for (const [x, y, z] of train.headlights) {
      const flare = new Sprite(new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const core = uv().sub(0.5).length().mul(2);
      (flare.material as SpriteNodeMaterial).colorNode = vec4(color(0xfff1d0).mul(6), smoothstep(float(1), float(0), core).pow(3));
      flare.position.set(x - 0.05, y, z);
      flare.scale.setScalar(1.6);
      lamps.add(flare);
    }
    // One beam down the line from between the lamps, fading with distance, kept off the ground (the pool below lights that).
    const [hx, hy] = train.headlights[0] ?? [0, 2.4, 0];
    const beamLength = 45;
    const beam = new Mesh(new ConeGeometry(1.8, beamLength, 24, 1, true), (() => {
      const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      // The cone's tip is at +y: brightest there, gone by its base.
      const along = positionLocal.y.div(beamLength).add(0.5);
      m.colorNode = vec4(color(0xffe6b8).mul(0.35), along.pow(2.5).mul(0.25));
      return m;
    })());
    beam.rotation.z = Math.PI / 2;
    beam.position.set(hx - beamLength / 2, hy - 0.2, 0);
    const ground = new Mesh(new PlaneGeometry(30, 6), pool(0xffd9a0, 0.4));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(hx - 18, 0.32, 0);
    lamps.add(beam, ground);
    lamps.traverse((o) => {
      o.renderOrder = 6;
      o.frustumCulled = false;
    });
    this.root.add(lamps);
    parent.add(this.root);
  }

  /** Shows the train `t` s after the match ended; null hides it. */
  update(t: number | null): void {
    const head = trainHead(this.#train, t);
    // Out of sight once its tail is a kilometre down the line.
    this.root.visible = head !== null && head + this.#train.length > -1000 && head < 1000;
    if (head !== null) this.root.position.x = head;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
      if (mesh.isMesh || (o as Sprite).isSprite) (mesh.material as MeshBasicNodeMaterial).dispose();
    });
    this.root.removeFromParent();
  }
}
