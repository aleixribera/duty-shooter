import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useSoldierModel } from '../../src/soldier';

/** Reads the soldier GLB from disk for the soldiers built in Node, where the client's fetch can't reach it. */
export async function loadTestSoldier(): Promise<void> {
  const bytes = await readFile(new URL('../../src/assets/soldier.glb', import.meta.url));
  useSoldierModel((await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '')).scene);
}
