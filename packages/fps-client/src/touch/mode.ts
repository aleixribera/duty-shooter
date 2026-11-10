/**
 * Whether the player is on a touchscreen right now: the last input was a
 * touch. A laptop with a touchscreen and a mouse switches both ways, so this
 * follows the input itself (Pointer Events say what made them) and never the
 * user agent. The page carries it as the `ds-touch` class on <html>, which is
 * what swaps key hints for touch ones and lays the HUD out round the thumbs.
 *
 * No three.js and no game: the menus use it before the engine has loaded.
 */

/** An input the page saw, as far as the mode cares. */
export type InputSeen =
  | { readonly kind: 'pointer'; readonly pointerType: string; readonly down: boolean }
  /** A key, and whether it was typed into a text field (an on-screen keyboard types there). */
  | { readonly kind: 'key'; readonly typing: boolean }
  | { readonly kind: 'pad' };

/**
 * The mode after an input. A finger or a pen on the glass turns it on (a
 * press, not a hover); a mouse that moves or presses, a key outside a text
 * field, or a controller turns it off.
 */
export function nextTouchMode(on: boolean, seen: InputSeen): boolean {
  if (seen.kind === 'pad') return false;
  if (seen.kind === 'key') return seen.typing ? on : false;
  if (seen.pointerType === 'touch' || seen.pointerType === 'pen') return seen.down ? true : on;
  if (seen.pointerType === 'mouse') return false;
  return on;
}

let mode = false;
let installed = false;
const listeners = new Set<(on: boolean) => void>();

/** True while the last input was a touch. */
export function touchMode(): boolean {
  return mode;
}

/** Calls `fn` whenever the mode changes; returns how to stop. */
export function onTouchMode(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Sets the mode outright: what an input just seen says, or a test. */
export function setTouchMode(on: boolean): void {
  if (on === mode) return;
  mode = on;
  (globalThis.document as Document | undefined)?.documentElement?.classList.toggle('ds-touch', on);
  for (const fn of [...listeners]) fn(on);
}

/** Tells the mode about an input seen elsewhere (the controller is read by polling, not events). */
export function inputSeen(seen: InputSeen): void {
  setTouchMode(nextTouchMode(mode, seen));
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true;
}

/**
 * Starts following the page's input. Capturing listeners, so the mode is
 * right before anything else handles the same event; safe to call again.
 */
export function installTouchMode(): void {
  const doc = globalThis.document as Document | undefined;
  if (installed || !doc || typeof doc.addEventListener !== 'function') return;
  installed = true;
  const pointer = (down: boolean) => (e: Event) => inputSeen({ kind: 'pointer', pointerType: (e as PointerEvent).pointerType, down });
  doc.addEventListener('pointerdown', pointer(true), true);
  // A mouse that reports a move without moving (a window coming forward under it) is not in use.
  doc.addEventListener('pointermove', (e) => ((e as PointerEvent).movementX !== 0 || (e as PointerEvent).movementY !== 0) && pointer(false)(e), true);
  doc.addEventListener('keydown', (e) => inputSeen({ kind: 'key', typing: typing(e.target) }), true);
}
