import type { Plugin } from 'vite';
import { buildReleases } from './releases.ts';

/**
 * The in-game changelog as a module, `virtual:changelog`, read from git when
 * the build (or the dev server) starts. The menu imports it only when the
 * Changelog opens, so it never weighs on the first screen.
 */
export function changelog(): Plugin {
  const id = 'virtual:changelog';
  let root = process.cwd();
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
      return `export default ${JSON.stringify(buildReleases(root))};`;
    },
  };
}
