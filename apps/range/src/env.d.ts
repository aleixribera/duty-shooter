interface ImportMetaEnv {
  /**
   * The game server's public address, for a copy of the page built without
   * one (GitHub Pages). Set from a repository variable at build time, so the
   * address is never committed.
   */
  readonly VITE_LOBBY_URL?: string;
  /** The release (`git describe`), shown on the main menu; set by the container and Pages builds. */
  readonly VITE_VERSION?: string;
}

/** The menu's Changelog, newest first (changelog/plugin.ts). */
declare module 'virtual:changelog' {
  const releases: readonly { readonly version: string; readonly date: string; readonly title: string }[];
  export default releases;
}
