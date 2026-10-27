import { Viewmodel, createRenderer, type ViewmodelState } from '@duty-shooter/fps-client';
import { STATS, WEAPON_IDS, isShellReload, type WeaponId } from '@duty-shooter/fps-core';
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

/** Every animation of weapon `id`, timed from its row. */
function clipsFor(id: WeaponId): readonly Clip[] {
  const row = STATS.weapons[id];
  const h = row.handling;
  const r = row.reload;
  const size = h.magazineSize.value;
  const auto = row.traits.fireMode === 'auto';
  const interval = auto ? 60 / h.fireRate.value : Math.max(60 / h.fireRate.value, h.cycleTime?.value ?? 0.25);
  const burst = Array.from({ length: auto ? 12 : 3 }, (_, i) => 0.2 + i * interval);
  const cycle = h.cycleTime?.value ?? 0;
  const ads = h.adsTime.value;
  const clips: Clip[] = [
    { name: 'Idle', duration: 2, state: () => ({}) },
    { name: 'Fire (hip)', duration: burst.at(-1)! + 0.6, state: () => ({}), shots: burst },
    { name: 'ADS in, fire, out', duration: burst.at(-1)! + 1.4, state: (t) => ({ ads: t < ads ? t / ads : t > burst.at(-1)! + 0.9 ? Math.max(0, 1 - (t - burst.at(-1)! - 0.9) / ads) : 1 }), shots: burst.map((s) => s + 0.5) },
  ];
  if (cycle > 0) clips.push({ name: 'Cycle (pump / bolt)', duration: cycle + 0.5, state: (t) => ({ action: t < cycle ? 'cycle' : 'ready', actionTime: t }), shots: [0] });
  if (isShellReload(r)) {
    // Three shells into a tube with three left, then from empty.
    const fill = (left: number) => (t: number) => Math.min(size, left + (t < r.start.value ? 0 : Math.floor((t - r.start.value) / r.perShell.value) + 1));
    const tactical = r.start.value + 2 * r.perShell.value + r.end.value;
    const empty = r.start.value + (size - 1) * r.perShell.value + r.chamber.value + r.end.value;
    clips.push({ name: 'Shell reload', duration: tactical + 0.4, state: (t) => ({ action: t < tactical ? 'reload' : 'ready', reload: 'tactical', actionTime: t, ammo: fill(size - 3)(t) }) });
    clips.push({ name: 'Empty shell reload', duration: empty + 0.4, state: (t) => ({ action: t < empty ? 'reload' : 'ready', reload: 'empty', actionTime: t, ammo: fill(0)(t) }) });
  } else {
    clips.push({ name: 'Tactical reload', duration: r.tacticalDuration.value + 0.4, state: (t) => ({ action: t < r.tacticalDuration.value ? 'reload' : 'ready', reload: 'tactical', actionTime: t, ammo: Math.floor(size / 2) }) });
    clips.push({ name: 'Empty reload', duration: r.emptyDuration.value + 0.4, state: (t) => ({ action: t < r.emptyDuration.value ? 'reload' : 'ready', reload: 'empty', actionTime: t, ammo: t < r.emptyAddAmmo.value ? 0 : size }) });
  }
  const g = STATS.grenade;
  clips.push(
    { name: 'Inspect', duration: STATS.weapon.inspectDuration.value + 0.3, state: (t) => ({ action: t < STATS.weapon.inspectDuration.value ? 'inspect' : 'ready', actionTime: t }) },
    { name: 'Holster', duration: h.holsterTime.value + 0.3, state: (t) => ({ action: t < h.holsterTime.value ? 'holster' : 'draw', actionTime: t < h.holsterTime.value ? t : 0 }) },
    { name: 'Draw', duration: h.drawTime.value + 0.6, state: (t) => ({ action: t < h.drawTime.value ? 'draw' : 'ready', actionTime: t }) },
    {
      name: 'Grenade (cook, throw)',
      duration: 1.2 + g.throwTime.value + 0.4,
      state: (t) => ({
        action: t < 1.2 + g.throwTime.value ? 'grenade' : 'ready',
        actionTime: t,
        grenade: t < 1.2 ? { phase: 'cook', time: t } : t < 1.2 + g.throwTime.value ? { phase: 'throw', time: t - 1.2 } : null,
      }),
    },
    { name: 'Melee', duration: STATS.melee.duration.value + 0.5, state: (t) => ({ action: t < STATS.melee.duration.value ? 'melee' : 'ready', actionTime: t }) },
    { name: 'Walk', duration: 2.5, state: () => ({ movement: 'walk', speed: 4.6 }) },
    { name: 'Sprint', duration: 2.5, state: () => ({ movement: 'sprint', speed: 7.2 }) },
    { name: 'Tactical sprint', duration: 2.5, state: () => ({ movement: 'tacticalSprint', speed: 8.6 }) },
    { name: 'Sway (turning)', duration: 2.5, state: (t) => ({ lookDelta: { yaw: Math.sin(t * 4) * 0.02, pitch: Math.cos(t * 3) * 0.01 } }) },
  );
  return clips;
}

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

/**
 * The dev viewer (`?viewer`): a first-person weapon and arms cycling every
 * animation. `&weapon=shotgun` picks the weapon, `&clip=reload` plays one
 * clip, and `&t=0.6` holds that clip at one moment (for screenshots).
 */
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
  const weapon = (WEAPON_IDS as readonly string[]).includes(params.get('weapon') ?? '') ? (params.get('weapon') as WeaponId) : 'm4a1';
  const CLIPS = clipsFor(weapon);
  const BASE_STATE: ViewmodelState = { ...BASE, weapon, ammo: STATS.weapons[weapon].handling.magazineSize.value };
  const hold = params.has('t') ? Number(params.get('t')) : null;
  const only = params.get('clip');
  if (only !== null) clipIndex = Math.max(0, CLIPS.findIndex((c) => c.name.toLowerCase().startsWith(only.toLowerCase())));
  document.body.dataset['viewer'] = 'on';
  await renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clipTime = hold ?? clipTime + dt;
    let clip = CLIPS[clipIndex] as Clip;
    if (hold === null && clipTime >= clip.duration) {
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
    vm.update({ ...BASE_STATE, ...clip.state(clipTime) }, dt, (49 * Math.PI) / 180);
    status.textContent = `Viewer · ${STATS.weapons[weapon].traits.name} · ${clip.name} · ${clipTime.toFixed(2)} s`;
    document.body.dataset['clip'] = clip.name;
    renderer.render(vm.scene, vm.camera);
  });
}
