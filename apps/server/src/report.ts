import { readFileSync } from 'node:fs';
import { formatPlayReport, playReport } from './play-report';

// The play report: `node server/report.mjs [events.jsonl]` in the container
// (EVENT_LOG by default), or `node dist/report.js <file>` in the repo.
const path = process.argv[2] ?? process.env['EVENT_LOG'];
if (!path) {
  console.error('Usage: node report.js <events.jsonl> (or set EVENT_LOG)');
  process.exit(1);
}
let log: string;
try {
  log = readFileSync(path, 'utf8');
} catch (error) {
  console.error(`Can't read ${path}: ${(error as Error).message}`);
  process.exit(1);
}
console.log(formatPlayReport(playReport(log)));
