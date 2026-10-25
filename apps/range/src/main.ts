import { createRenderer } from '@duty-shooter/fps-client';
import { TICK_RATE } from '@duty-shooter/fps-core';
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const status = document.querySelector<HTMLElement>('#status');
if (!canvas || !status) throw new Error('index.html is missing #view or #status');

const forceWebGL = new URLSearchParams(location.search).has('webgl');
const { renderer, backend } = await createRenderer(canvas, { forceWebGL });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Placeholder scene proving the build pipeline; the graybox map arrives in ticket 03.
const scene = new Scene();
scene.background = new Color(0x1b1f24);
scene.add(new HemisphereLight(0xdde4ee, 0x30343a, 1.2));
const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(5, 10, 4);
scene.add(sun);
scene.add(new GridHelper(40, 40, 0x6b7380, 0x3a4048));
const crate = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x8a9099, roughness: 0.7 }));
crate.position.set(0, 0.5, -4);
scene.add(crate);

const camera = new PerspectiveCamera(80, 1, 0.05, 500);
camera.position.set(0, 1.6, 0);

function resize(): void {
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

status.textContent = `Renderer: ${backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (fallback)'} · sim ${TICK_RATE} Hz`;
document.body.dataset['backend'] = backend;

await renderer.setAnimationLoop((time) => {
  crate.rotation.y = time / 1000;
  renderer.render(scene, camera);
});
