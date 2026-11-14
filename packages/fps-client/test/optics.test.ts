import { readFile } from 'node:fs/promises';
import { WEAPON_IDS, slotsOf, type OpticId } from '@duty-shooter/fps-core';
import { Group, Mesh, Object3D, Quaternion, Raycaster, Vector3, type Material } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildM4A1 } from '../src/viewmodel/m4a1';
import { OPTICS, OPTIC_MOUNTS, mountOptic } from '../src/viewmodel/optics';
import { RETICLE_SHAPES } from '../src/customize';

/** A GLB with its textures left out: Node has no image decoder, and only the shapes and material names matter here. */
function untextured(bytes: Buffer): ArrayBuffer {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Record<string, unknown> & { materials?: Record<string, unknown>[] };
  delete json['images'];
  delete json['textures'];
  delete json['samplers'];
  for (const m of json.materials ?? []) {
    delete m['normalTexture'];
    delete m['occlusionTexture'];
    delete m['emissiveTexture'];
    const pbr = m['pbrMetallicRoughness'] as Record<string, unknown> | undefined;
    if (pbr) {
      delete pbr['baseColorTexture'];
      delete pbr['metallicRoughnessTexture'];
    }
  }
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const head = Buffer.alloc(20);
  const rest = bytes.subarray(20 + jsonLength);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + rest.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Uint8Array.from(Buffer.concat([head, Buffer.from(text, 'utf8'), rest])).buffer;
}

async function load(name: string): Promise<Object3D> {
  const bytes = await readFile(new URL(`../src/viewmodel/assets/${name}.glb`, import.meta.url));
  const scene = (await new GLTFLoader().parseAsync(untextured(bytes), '')).scene;
  scene.updateMatrixWorld(true);
  return scene;
}

/** What a ray from behind the optic, down gun -Z at (x, y), meets: each hit's finish (`lens.001` reads `lens`). */
function along(scene: Object3D, x: number, y: number): string[] {
  const ray = new Raycaster(new Vector3(x, y, 0.3), new Vector3(0, 0, -1), 0, 0.6);
  return ray.intersectObject(scene, true).map((h) => ((h.object as Mesh).material as Material).name.replace(/\.\d+$/, ''));
}

describe('rail optics (ticket 19)', () => {
  it('has a mount on every gun that takes an optic, and on no other', () => {
    const takes = WEAPON_IDS.filter((id) => slotsOf(id).includes('optic')).sort();
    expect(Object.keys(OPTIC_MOUNTS).sort()).toEqual(takes);
  });

  it.each(['reflex', 'prism'] as OpticId[])('the %s: the eye on its axis looks through open glass onto the reticle', async (optic) => {
    const scene = await load(optic);
    const axis = OPTICS[optic].axis;
    // Dead on the axis, the reticle's centre is the first thing in the way (through the glass, if it has one).
    const centre = along(scene, 0, axis).filter((f) => f !== 'lens');
    expect(centre[0]).toBe('red_insert');
    // Beside it, inside the window, nothing but glass: the view through is open.
    for (const [dx, dy] of [[0.006, 0], [-0.006, 0], [0, 0.005]]) {
      expect(along(scene, dx!, axis + dy!).filter((f) => f !== 'lens')).toEqual([]);
    }
  });

  it.each(['reflex', 'prism'] as OpticId[])('the %s: each reticle a player may pick is its own part, lit on the axis (PLAN item 7)', async (optic) => {
    const scene = await load(optic);
    const axis = OPTICS[optic].axis;
    for (const shape of RETICLE_SHAPES) {
      const alone = scene.clone();
      alone.updateMatrixWorld(true);
      expect(alone.getObjectByName(`reticle_${shape}`), shape).toBeTruthy();
      // The others taken out: this one alone holds the aim point.
      for (const other of RETICLE_SHAPES) if (other !== shape) alone.getObjectByName(`reticle_${other}`)?.removeFromParent();
      expect(along(alone, 0, axis).filter((f) => f !== 'lens')[0], shape).toBe('red_insert');
    }
  });

  it('an optic on a moving part sits at its mount while the part is at rest, and turns with it', () => {
    const gun = new Group();
    const cover = new Object3D();
    cover.name = 'cover';
    cover.position.set(0, 0.056, -0.128);
    cover.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
    gun.add(cover);
    const rest = { position: cover.position.clone(), quaternion: cover.quaternion.clone() };
    const node = mountOptic(gun, new Object3D(), 'reflex', { reflex: [0, 0.08, -0.01], prism: [0, 0.08, -0.01], on: 'cover' }, rest);
    gun.updateMatrixWorld(true);
    expect(node.parent).toBe(cover);
    const at = node.getWorldPosition(new Vector3());
    expect(at.distanceTo(new Vector3(0, 0.08, -0.01))).toBeLessThan(1e-9);
    expect(node.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())).toBeLessThan(1e-9);
    // The cover lifts: the optic leaves the rail with it.
    cover.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.4));
    gun.updateMatrixWorld(true);
    expect(node.getWorldPosition(new Vector3()).y).toBeGreaterThan(0.12);
  });

  // The Breacher has no irons to fold: its bead sits below the optic's sight line.
  it('the guns whose sights stand in the optic view fold them', async () => {
    for (const name of ['smg', 'lmg', 'burst']) expect((await load(name)).getObjectByName('irons'), name).toBeTruthy();
    const m4 = buildM4A1({ detail: 'high' });
    expect(m4.root.getObjectByName('frontSightPost')).toBeTruthy();
    m4.dispose();
  });
});
