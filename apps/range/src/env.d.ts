interface ImportMetaEnv {
  /**
   * The game server's public address, for a copy of the page built without
   * one (GitHub Pages). Set from a repository variable at build time, so the
   * address is never committed.
   */
  readonly VITE_LOBBY_URL?: string;
}
