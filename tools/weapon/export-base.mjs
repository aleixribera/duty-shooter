// Export the existing, metrically aligned M4 geometry for the Blender source scene.
// Run from the repository root with `node tools/weapon/export-base.mjs`.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { buildM4A1 } = await vite.ssrLoadModule('/packages/fps-client/src/viewmodel/m4a1.ts');
  const gun = buildM4A1({ detail: 'high' });
  const meshes = [];
  gun.root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    meshes.push({
      name: object.name,
      parent: object.parent.name,
      parentPosition: object.parent.position.toArray(),
      positions: Array.from(geometry.attributes.position.array),
      normals: Array.from(geometry.attributes.normal.array),
      indices: Array.from(geometry.index.array),
    });
  });
  await mkdir('node_modules/weapon-work', { recursive: true });
  await writeFile('node_modules/weapon-work/base.json', JSON.stringify(meshes));
  gun.dispose();
} finally {
  await vite.close();
}
