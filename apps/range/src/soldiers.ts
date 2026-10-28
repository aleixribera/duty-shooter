import { PlayersView, buildM4A1, createRenderer } from '@duty-shooter/fps-client';
import { STATS, WEAPON_IDS, createWorld, isShellReload, type PlayerOutput, type WeaponId } from '@duty-shooter/fps-core';
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';

/**
 * The dev soldier sheet (soldiers.html, `npm run dev` only): the third-person
 * soldier in each look (rows: free-for-all, blue, orange) holding one weapon
 * through the poses and actions the game uses (columns), drawn by the game's
 * own PlayersView. `?weapon=<id>` picks the weapon, `?view=front|side|back`
 * turns the soldiers, `?rows=0,2` and `?cols=0,3` (indices) pick some of
 * them, and `?t=<s>` holds every clip at one moment for screenshots.
 */

type State = {
  readonly stance?: PlayerOutput['stance'];
  readonly movement?: PlayerOutput['movement'];
  readonly speed?: number;
  readonly pitch?: number;
  readonly eyeHeight?: number;
  readonly ads?: number;
  readonly action?: PlayerOutput['weapon']['action'];
  readonly reload?: 'tactical' | 'empty';
  readonly grenade?: PlayerOutput['grenade'];
};

interface Column {
  readonly name: string;
  readonly duration: number;
  state(t: number): State;
}

function columns(id: WeaponId): Column[] {
  const row = STATS.weapons[id];
  const r = row.reload;
  const reload = isShellReload(r) ? r.start.value + 3 * r.perShell.value : r.tacticalDuration.value;
  const crouch = STATS.stance.crouchEyeHeight.value;
  return [
    { name: 'Idle', duration: 2, state: () => ({}) },
    { name: 'Aim', duration: 2, state: () => ({ ads: 1 }) },
    { name: 'Look up', duration: 2, state: () => ({ ads: 1, pitch: 0.7 }) },
    { name: 'Walk', duration: 2, state: () => ({ speed: 4 }) },
    { name: 'Sprint', duration: 2, state: () => ({ speed: 7, movement: 'sprint' }) },
    { name: 'Crouch aim', duration: 2, state: () => ({ stance: 'crouch', eyeHeight: crouch, ads: 1 }) },
    { name: 'Prone', duration: 2, state: () => ({ stance: 'prone', eyeHeight: 0.4, ads: 1 }) },
    { name: 'Reload', duration: reload, state: () => ({ action: 'reload', reload: 'tactical' }) },
    { name: 'Grenade', duration: 1.4, state: (t) => ({ action: 'grenade', grenade: t < 0.9 ? { phase: 'cook', time: t } : { phase: 'throw', time: t - 0.9 } }) },
  ];
}

const TEAMS = [0, 1, 2];
const SPACING = 1.7;
const ROW = 2.4;

function output(id: string, team: number, position: [number, number, number], yaw: number, weapon: WeaponId, s: State, t: number): PlayerOutput {
  const v = s.speed ?? 0;
  return {
    id, team, kind: 'player', alive: true, position, velocity: [-Math.sin(yaw) * v, 0, -Math.cos(yaw) * v], yaw, pitch: s.pitch ?? 0,
    movement: s.movement ?? 'walk', mantle: null, stance: s.stance ?? 'stand', eyeHeight: s.eyeHeight ?? 1.6, health: 100, landing: null,
    weapon: { id: weapon, slot: 0, action: s.action ?? 'ready', actionTime: t, reload: s.reload ?? null, ammo: 10, ads: s.ads ?? 0, spread: 0, canFire: true, shotIndex: 0, sway: [0, 0] },
    loadout: { primary: weapon, secondary: 'pistol' },
    grenades: 2,
    grenade: s.grenade ?? null,
  } as unknown as PlayerOutput;
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLElement;
const params = new URLSearchParams(location.search);
const weapon = (WEAPON_IDS as readonly string[]).includes(params.get('weapon') ?? '') ? (params.get('weapon') as WeaponId) : 'm4a1';
const yaw = ({ front: 0.4, side: Math.PI / 2, back: Math.PI + 0.4 } as Record<string, number>)[params.get('view') ?? 'front'] ?? 0.4;
const pick = (name: string) => params.get(name)?.split(',').map(Number) ?? null;
const hold = params.has('t') ? Number(params.get('t')) : null;

const { renderer } = await createRenderer(canvas, { forceWebGL: params.has('webgl') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new Scene();
scene.background = new Color(0x2a3038);
scene.add(new HemisphereLight(0xdfe8f5, 0x3a3328, 1.4));
const sun = new DirectionalLight(0xfff1dd, 2.6);
sun.position.set(4, 8, -6);
scene.add(sun);
const players = new PlayersView(scene, createWorld([]), () => buildM4A1({ detail: 'low' }).root);
await players.prepare();

const all = columns(weapon);
const cols = all.filter((_, i) => pick('cols')?.includes(i) ?? true);
const teams = TEAMS.filter((_, i) => pick('rows')?.includes(i) ?? true);
const width = (cols.length - 1) * SPACING;
const camera = new PerspectiveCamera(22, 1, 0.1, 200);
const centre = new Vector3(width / 2, (teams.length * ROW) / 2 - 0.3, 0);
// Far enough to frame the grid at 16:9 with a margin.
const span = Math.max(width + SPACING, ((teams.length * ROW) * 16) / 9);
camera.position.copy(centre).addScaledVector(new Vector3(0, 0.12, -1).normalize(), (span / 2 / Math.tan((22 * Math.PI) / 360)) / (16 / 9) * 1.05);
camera.lookAt(centre);
const resize = () => {
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

const frame = (time: number, dt: number) => {
  const list: PlayerOutput[] = [];
  teams.forEach((team, row) => {
    cols.forEach((col, i) => {
      const t = time % col.duration;
      list.push(output(`${row}-${i}`, team, [width - i * SPACING, (teams.length - 1 - row) * ROW, 0], yaw, weapon, col.state(t), t));
    });
  });
  players.update(list, dt, { teams: true, self: null, names: new Map() });
};

let time = 0;
if (hold !== null) {
  // Play up to the held moment so every eased pose has settled where it would be.
  for (; time < hold; time += 1 / 60) frame(time, 1 / 60);
}
let last = performance.now();
status.textContent = `Soldiers · ${STATS.weapons[weapon].traits.name} · ${cols.map((c) => c.name).join(' · ')}`;
document.body.dataset['soldiers'] = 'on';
await renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (hold === null) {
    time += dt;
    frame(time, dt);
  } else frame(hold, 0);
  renderer.render(scene, camera);
});
