import { Viewmodel, createRenderer, type ViewmodelState } from '@duty-shooter/fps-client';
import { STATS } from '@duty-shooter/fps-core';
import { Color, PMREMGenerator } from 'three/webgpu';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** One clip of the viewer's loop: a name, how long it plays and the state it feeds the viewmodel at time t. */
interface Clip {
  readonly name: string;
  readonly duration: number;
  state(t: number): Partial<ViewmodelState>;
  /** Shots fired at these times. */
  readonly shots?: readonly number[];
}

const W = STATS.weapon;
const shotInterval = 60 / W.fireRate.value;
const burst = Array.from({ length: 12 }, (_, i) => 0.2 + i * shotInterval);

const CLIPS: readonly Clip[] = [
  { name: 'Idle', duration: 2, state: () => ({}) },
  { name: 'Fire (hip)', duration: 1.6, state: () => ({}), shots: burst },
  { name: 'ADS in, fire, out', duration: 2.6, state: (t) => ({ ads: t < 0.3 ? t / W.adsTime.value : t > 2.1 ? Math.max(0, 1 - (t - 2.1) / W.adsTime.value) : 1 }), shots: burst.map((s) => s + 0.5) },
  { name: 'Tactical reload', duration: W.tacticalReloadDuration.value + 0.4, state: (t) => ({ action: t < W.tacticalReloadDuration.value ? 'reload' : 'ready', reload: 'tactical', actionTime: t, ammo: 12 }) },
  { name: 'Empty reload (bolt release)', duration: W.emptyReloadDuration.value + 0.4, state: (t) => ({ action: t < W.emptyReloadDuration.value ? 'reload' : 'ready', reload: 'empty', actionTime: t, ammo: t < W.emptyReloadAddAmmo.value ? 0 : 30 }) },
  { name: 'Inspect', duration: W.inspectDuration.value + 0.3, state: (t) => ({ action: t < W.inspectDuration.value ? 'inspect' : 'ready', actionTime: t }) },
  { name: 'Draw', duration: W.drawTime.value + 0.6, state: (t) => ({ action: t < W.drawTime.value ? 'draw' : 'ready', actionTime: t }) },
  { name: 'Melee', duration: STATS.melee.duration.value + 0.5, state: (t) => ({ action: t < STATS.melee.duration.value ? 'melee' : 'ready', actionTime: t }) },
  { name: 'Walk', duration: 2.5, state: () => ({ movement: 'walk', speed: 4.6 }) },
  { name: 'Sprint', duration: 2.5, state: () => ({ movement: 'sprint', speed: 7.2 }) },
  { name: 'Tactical sprint', duration: 2.5, state: () => ({ movement: 'tacticalSprint', speed: 8.6 }) },
  { name: 'Sway (turning)', duration: 2.5, state: (t) => ({ lookDelta: { yaw: Math.sin(t * 4) * 0.02, pitch: Math.cos(t * 3) * 0.01 } }) },
];

const BASE: ViewmodelState = {
  action: 'ready',
  actionTime: 0,
  reload: null,
  ammo: 30,
  ads: 0,
  movement: 'walk',
  stance: 'stand',
  speed: 0,
  grounded: true,
  lookDelta: { yaw: 0, pitch: 0 },
  alive: true,
};

/** The dev viewer (`?viewer`): the first-person M4A1 and arms cycling every animation. */
export async function startViewer(canvas: HTMLCanvasElement, status: HTMLElement, forceWebGL: boolean): Promise<void> {
  const { renderer } = await createRenderer(canvas, { forceWebGL });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const env = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const vm = new Viewmodel(env);
  vm.scene.background = new Color(0x2a3038);
  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    vm.resize(canvas.clientWidth / canvas.clientHeight);
  };
  window.addEventListener('resize', resize);
  resize();
  let clipIndex = 0;
  let clipTime = 0;
  let last = performance.now();
  let fired = 0;
  const params = new URLSearchParams(location.search);
  const only = params.get('clip');
  if (only !== null) clipIndex = Math.max(0, CLIPS.findIndex((c) => c.name.toLowerCase().startsWith(only.toLowerCase())));
  document.body.dataset['viewer'] = 'on';
  await renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clipTime += dt;
    let clip = CLIPS[clipIndex] as Clip;
    if (clipTime >= clip.duration) {
      clipTime = 0;
      fired = 0;
      if (only === null) clipIndex = (clipIndex + 1) % CLIPS.length;
      clip = CLIPS[clipIndex] as Clip;
    }
    const shots = clip.shots ?? [];
    while (fired < shots.length && (shots[fired] ?? Infinity) <= clipTime) {
      vm.fire();
      fired += 1;
    }
    vm.update({ ...BASE, ...clip.state(clipTime) }, dt, (49 * Math.PI) / 180);
    status.textContent = `Viewer · ${clip.name} · ${clipTime.toFixed(2)} s`;
    document.body.dataset['clip'] = clip.name;
    renderer.render(vm.scene, vm.camera);
  });
}
