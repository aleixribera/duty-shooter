/**
 * Deterministic pseudo-randomness for the simulation. Values are pure
 * functions of their inputs, so client prediction and the server agree
 * without sharing generator state.
 */

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mixes integers into a uniform value in [0, 1). */
export function noise(...inputs: readonly number[]): number {
  let h = 0x9e3779b9;
  for (const input of inputs) {
    h = Math.imul(h ^ (input | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}
