import type { Plugin } from 'vite';
import { buildReleases, type Release } from './releases.ts';

/** The releases as a file of the build, beside index.html: the home server's Arcade page reads it from the container. */
export const CHANGELOG_ASSET = 'changelog.json';

/**
 * The in-game changelog as a module, `virtual:changelog`, read from git when
 * the build (or the dev server) starts. The menu imports it only when the
 * Changelog opens, so it never weighs on the first screen. A build also
 * writes the same list as `changelog.json`, for the Arcade.
 */
export function changelog(): Plugin {
  const id = 'virtual:changelog';
  let root = process.cwd();
  let releases: Release[] | null = null;
  const read = () => (releases ??= buildReleases(root));
  return {
    name: 'duty-changelog',
    configResolved(config) {
      root = config.root;
    },
    resolveId(source) {
      return source === id ? `\0${id}` : null;
    },
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      return `export default ${JSON.stringify(read())};`;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: CHANGELOG_ASSET, source: JSON.stringify(read()) });
    },
  };
}
