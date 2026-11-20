import { describe, expect, it } from 'vitest';
import { ROYALE_STATUS, serverWebSocketUrl } from '../src/lobby-status';

describe('lobby endpoints under root and subpath mounts', () => {
  it('resolves Play Online, private lobby and Battle Royale WebSockets at the root', () => {
    expect(serverWebSocketUrl('ws', 'https://example.ts.net:10000/')).toBe('wss://example.ts.net:10000/ws');
    expect(serverWebSocketUrl('ws?lobby=ABC123', 'https://example.ts.net:10000/?lobby=ABC123')).toBe('wss://example.ts.net:10000/ws?lobby=ABC123');
    expect(serverWebSocketUrl('royale/ws', 'https://example.ts.net:10000/')).toBe('wss://example.ts.net:10000/royale/ws');
    expect(serverWebSocketUrl('ws', 'http://localhost:5173/?online')).toBe('ws://localhost:5173/ws');
  });

  it('resolves Play Online, private lobby and Battle Royale WebSockets behind a subpath proxy', () => {
    expect(serverWebSocketUrl('ws', 'https://example.ts.net/duty/')).toBe('wss://example.ts.net/duty/ws');
    expect(serverWebSocketUrl('ws?lobby=ABC123', 'https://example.ts.net/duty/?lobby=ABC123')).toBe('wss://example.ts.net/duty/ws?lobby=ABC123');
    expect(serverWebSocketUrl('royale/ws', 'https://example.ts.net/duty/')).toBe('wss://example.ts.net/duty/royale/ws');
  });

  it('uses a relative path for Battle Royale status so subpath proxies forward it', () => {
    expect(ROYALE_STATUS).toBe('royale/status');
    expect(new URL(ROYALE_STATUS, 'https://example.ts.net/duty/').href).toBe('https://example.ts.net/duty/royale/status');
    expect(new URL(ROYALE_STATUS, 'https://example.ts.net:10000/').href).toBe('https://example.ts.net:10000/royale/status');
  });
});
