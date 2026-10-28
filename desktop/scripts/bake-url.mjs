// Writes the live lobby's address into config.json, which the shell opens
// first. It comes from DUTY_URL, or else the LOBBY_URL repository variable
// (through `gh`), so the address is never committed. With neither, an
// existing config.json is kept; without one the app opens the Pages copy.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../config.mjs';

const target = join(import.meta.dirname, '..', 'config.json');

function fromGh() {
  try {
    return execFileSync('gh', ['variable', 'get', 'LOBBY_URL'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const url = normalize(process.env.DUTY_URL || fromGh());
if (url) {
  writeFileSync(target, `${JSON.stringify({ url })}\n`);
  console.log(`lobby: ${url}`);
} else if (existsSync(target)) {
  console.log('lobby: no DUTY_URL or LOBBY_URL; keeping config.json');
} else {
  writeFileSync(target, `${JSON.stringify({ url: null })}\n`);
  console.warn('lobby: no DUTY_URL or LOBBY_URL; the app will open the Pages copy');
}
