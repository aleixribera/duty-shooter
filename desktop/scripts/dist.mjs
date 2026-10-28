// Builds the Windows installer, dist/Duty-Shooter-Setup.exe, versioned after
// the repository's latest release tag (VERSION overrides it).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'electron-builder';

execFileSync(process.execPath, [fileURLToPath(new URL('./bake-url.mjs', import.meta.url))], { stdio: 'inherit' });

const tag = process.env.VERSION || execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim();
const version = tag.replace(/^v/, '');
console.log(`version: ${version}`);

await build({
  win: ['nsis'],
  publish: 'never',
  config: {
    appId: 'com.aleixribera.dutyshooter',
    productName: 'Duty Shooter',
    copyright: 'Aleix Ribera',
    extraMetadata: { version },
    files: ['main.mjs', 'config.mjs', 'config.json', 'offline.html', 'build/icon.png', 'package.json'],
    directories: { output: 'dist', buildResources: 'build' },
    win: { icon: 'build/icon.ico', target: 'nsis' },
    nsis: {
      // A per-user install: no admin prompt, Start menu and desktop shortcuts, an uninstaller.
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Duty Shooter',
      runAfterFinish: true,
      artifactName: 'Duty-Shooter-Setup.${ext}',
    },
  },
});
