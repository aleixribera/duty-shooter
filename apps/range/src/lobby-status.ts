import type { Lobby, LobbyInfo } from '@duty-shooter/fps-client/ui';

/** Where the page keeps its seat token. */
export const SEAT_KEY = 'duty-shooter.seat';

/** The Battle Royale process's lobby status, which the server holding the page answers for it (ADR 0009). */
export const ROYALE_STATUS = '/royale/status';

/** Whether this page remembers a seat from an earlier connection. */
export function hasSeat(): boolean {
  try {
    return localStorage.getItem(SEAT_KEY) !== null;
  } catch {
    return false;
  }
}

/** The lobby status, a second time if the first try fails: one lost request is not a server that is down. */
export async function lobbyStatus(path = '/status'): Promise<LobbyInfo | null> {
  return (await askLobbyStatus(path)) ?? (await askLobbyStatus(path));
}

/** The lobby status endpoint (map, mode, players, capacity, phase), or null if it does not answer. */
async function askLobbyStatus(path: string): Promise<LobbyInfo | null> {
  try {
    // A slow page (a busy main thread) still gets its answer; a server that is down fails fast anyway.
    const res = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as LobbyInfo) : null;
  } catch {
    return null;
  }
}

/**
 * Where online play is: the game server that served this page (it answers
 * /healthz), else the server's address baked into a copy built without one
 * (GitHub Pages), else nowhere. `askServer` is false in dev unless `?online`
 * looks for a server behind Vite's proxy.
 */
export async function findLobby(askServer: boolean): Promise<Lobby | null> {
  if (askServer) {
    try {
      const res = await fetch('/healthz', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      const health = res.ok && res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as { status?: unknown; public?: unknown }) : null;
      if (health?.status === 'ok') return { kind: 'server', public: health.public === true, status: await lobbyStatus() };
    } catch {
      // No game server behind this page.
    }
  }
  const url = import.meta.env.VITE_LOBBY_URL;
  return url ? { kind: 'link', url } : null;
}

/** A private lobby's code from a link (`?lobby=`), as the server reads it (upper case), or null for none or one that can't be a code. */
export function privateLobbyCode(asked: string | null): string | null {
  return asked !== null && /^[A-Za-z0-9]{4,12}$/.test(asked) ? asked.toUpperCase() : null;
}

/** Letters and digits nobody misreads when a code is read out: no 0/O, 1/I/L. */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A new private lobby's code: six of them, at random. */
export function newLobbyCode(): string {
  const picks = crypto.getRandomValues(new Uint8Array(6));
  return [...picks].map((n) => CODE_LETTERS[n % CODE_LETTERS.length]).join('');
}
