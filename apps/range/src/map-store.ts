import type { BakeFile } from '@duty-shooter/fps-client/surfaces';
import type { NavGraph, Solid } from '@duty-shooter/fps-core';
import { buildMapById, mapSolids, type MapDefinition, type MapId } from './map/maps';

/** A map's definition and collision, built once, and how far its baked lighting has downloaded. */
export interface LoadedMap {
  readonly map: MapDefinition;
  readonly solids: Solid[];
  readonly bake: Promise<BakeFile | null>;
  /** How much of the lighting file is in (0 to 1), or null before its size is known. */
  readonly progress: number | null;
  /** The lighting is in (or there is none to wait for). */
  readonly ready: boolean;
}

/**
 * The page's maps: each built once when first asked for, its baked lighting
 * downloading from then on, and its bot routes worked out in a worker.
 */
export class MapStore {
  readonly #loaded = new Map<MapId, LoadedMap>();
  readonly #routes = new Map<MapId, Promise<NavGraph | null>>();
  readonly #loadBake: (url: string, progress: (fraction: number) => void) => Promise<BakeFile | null>;

  /** `loadBake` is the engine's, called only once a map is first loaded. */
  constructor(loadBake: (url: string, progress: (fraction: number) => void) => Promise<BakeFile | null>) {
    this.#loadBake = loadBake;
  }

  /** The map, built now if it hasn't been, with its lighting on its way. */
  load(id: MapId): LoadedMap {
    let entry = this.#loaded.get(id);
    if (!entry) {
      const map = buildMapById(id);
      const e: { -readonly [K in keyof LoadedMap]: LoadedMap[K] } = { map, solids: mapSolids(map), bake: Promise.resolve(null), progress: null, ready: false };
      // Ground isn't baked yet (ticket 10), so a map on terrain has no file to ask for.
      e.bake = map.terrain ? Promise.resolve(null) : this.#loadBake(`bake/${id}.bin`, (f) => (e.progress = f));
      // For the screenshot scripts: whether this map's lighting is in.
      void e.bake.then((file) => {
        e.ready = true;
        document.body.dataset['bake'] = file ? 'ready' : 'none';
      });
      entry = e;
      this.#loaded.set(id, entry);
    }
    return entry;
  }

  /** The map if it has been loaded, without loading it. */
  peek(id: MapId): LoadedMap | undefined {
    return this.#loaded.get(id);
  }

  /** The map's bot routes, from a worker; null if it could not, and the match builds them. */
  routes(id: MapId): Promise<NavGraph | null> {
    let found = this.#routes.get(id);
    if (!found) {
      found = new Promise((done) => {
        try {
          const worker = new Worker(new URL('./map/routes-worker.ts', import.meta.url), { type: 'module' });
          const finish = (graph: NavGraph | null) => {
            worker.terminate();
            done(graph);
          };
          worker.onmessage = (e: MessageEvent<NavGraph | null>) => finish(e.data);
          worker.onerror = () => finish(null);
          worker.postMessage(id);
        } catch {
          done(null);
        }
      });
      this.#routes.set(id, found);
    }
    return found;
  }
}
