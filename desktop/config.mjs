// The shell's decisions, kept free of Electron so they can be tested with
// plain `node --test`: which address to open, and which links stay in the window.

/** The client alone on GitHub Pages: Bot Match and Practice Range without the server. */
export const PAGES_URL = 'https://aleixribera.github.io/duty-shooter/';

/** `--url=<address>` from the command line, if given. */
export function urlFlag(argv) {
  for (const arg of argv) if (arg.startsWith('--url=')) return arg.slice('--url='.length);
  return null;
}

/**
 * The addresses to try, in order: the `--url` flag, then the live lobby baked
 * in at build time, then the Pages copy. Empty and repeated entries are dropped.
 */
export function candidates({ flag, baked }) {
  const urls = [];
  for (const url of [flag, baked, PAGES_URL]) {
    const normal = normalize(url);
    if (normal && !urls.includes(normal)) urls.push(normal);
  }
  return urls;
}

/** `url` as an http(s) address ending in a slash, or null if it isn't one. */
export function normalize(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.href;
}

/**
 * Whether a navigation to `target` stays in the game window: any page on the
 * origin of one of the game's addresses (so the Pages copy's lobby link opens
 * the lobby in place). Everything else goes to the default browser.
 */
export function staysInApp(target, urls) {
  let origin;
  try {
    origin = new URL(target).origin;
  } catch {
    return false;
  }
  return urls.some((url) => new URL(url).origin === origin);
}

/** Whether a link may be handed to the default browser: http(s) only. */
export function opensExternally(target) {
  try {
    const { protocol } = new URL(target);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The game's own address behind `url`. The lobby address may be the arcade
 * portal, which lists its games at `/api/live`; this game's `play_url` there
 * wins. Anything else (the game itself, the Pages copy, no answer) is kept.
 */
export async function resolveGame(url, { fetch = globalThis.fetch, timeoutMs = 3000 } = {}) {
  try {
    const response = await fetch(new URL('api/live', url), { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!response.ok) return url;
    const { projects } = await response.json();
    return normalize(projects?.find((p) => p.id === 'duty-shooter')?.play_url) ?? url;
  } catch {
    return url;
  }
}

/** The first of `urls` whose page answers within `timeoutMs`, or null. */
export async function firstReachable(urls, { fetch = globalThis.fetch, timeoutMs = 4000 } = {}) {
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      if (response.ok) return url;
    } catch {
      // Down, offline or too slow: try the next one.
    }
  }
  return null;
}
