import { HINT_IDS, NO_HINTS_SEEN, type HintId, type HintMemory } from './hints';

/**
 * What this browser has learned of the first-match hints (`hints.ts`), kept
 * in local storage beside the settings and the Profile. One memory for the
 * page: the game writes it as hints are followed, and Settings clears it
 * ("Show the hints again"), which the game sees at its next frame.
 */
const KEY = 'duty-shooter.hints.v1';

/** Reads a stored memory, dropping anything that is not one: a damaged save means the hints show again, never a crash. */
export function parseHintMemory(raw: unknown): HintMemory {
  if (typeof raw !== 'object' || raw === null) return NO_HINTS_SEEN;
  const r = raw as { done?: unknown; shown?: unknown };
  const known = (v: unknown): v is HintId => HINT_IDS.includes(v as HintId);
  const done = Array.isArray(r.done) ? [...new Set(r.done.filter(known))] : [];
  const shown: Partial<Record<HintId, number>> = {};
  if (typeof r.shown === 'object' && r.shown !== null) {
    for (const [k, v] of Object.entries(r.shown)) if (known(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) shown[k] = Math.floor(v);
  }
  return { done, shown };
}

let memory: HintMemory | null = null;
/** Counts the clears, so a game that holds a state built on the old memory knows to start over. */
let cleared = 0;

export function hintMemory(): HintMemory {
  if (memory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    memory = raw ? parseHintMemory(JSON.parse(raw)) : NO_HINTS_SEEN;
  } catch {
    // Storage blocked or the save unreadable: the hints show again.
    memory = NO_HINTS_SEEN;
  }
  return memory;
}

export function saveHintMemory(next: HintMemory): void {
  memory = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: remembered for this visit only.
  }
}

/** Settings' "Show the hints again": everything is forgotten. */
export function clearHintMemory(): void {
  cleared++;
  saveHintMemory(NO_HINTS_SEEN);
}

/** How many times the memory was cleared this visit. */
export function hintMemoryCleared(): number {
  return cleared;
}

/** Whether there is anything to forget: the Settings row says so. */
export function hintsSeen(): boolean {
  const m = hintMemory();
  return m.done.length > 0 || Object.keys(m.shown).length > 0;
}
