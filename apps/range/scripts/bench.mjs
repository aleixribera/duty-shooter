// Runs the browser benchmark without a person at the keyboard: opens the page
// with ?bench in Chrome at 1920 x 1080 (vsync off, so frame times show what
// the GPU can do), waits for the report and prints it as JSON.
//
//   node apps/range/scripts/bench.mjs [map] [base url] [--tier=low|medium|high|ultra] [--dynres]
//   node apps/range/scripts/bench.mjs survival-town http://localhost:5173/
//
// The flight is drawn at High with the render scale fixed, as before the game
// had tiers; `--tier` draws another, `--dynres` lets dynamic resolution move
// the scale (the report then says where it settled).
import { launchChrome } from './chrome.mjs';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const map = args[0] ?? 'survival-town';
const base = args[1] ?? 'http://localhost:5173/';
const tier = flags.find((f) => f.startsWith('--tier='))?.slice('--tier='.length);
const chrome = await launchChrome();
try {
  const url = new URL(base);
  url.searchParams.set('bench', '');
  url.searchParams.set('map', map);
  if (tier) url.searchParams.set('tier', tier);
  if (flags.includes('--dynres')) url.searchParams.set('dynres', '');
  await chrome.navigate(url.toString());
  const report = await chrome.waitFor("document.body.dataset.benchmark === 'done' ? JSON.stringify(globalThis.duty?.benchmark) : null", 15 * 60_000, 2000);
  if (!report) throw new Error('The benchmark did not finish in 15 minutes');
  console.log(JSON.stringify({ ...JSON.parse(report), browser: 'Chrome (headless)', consoleErrors: chrome.errors }, null, 1));
} finally {
  await chrome.close();
}
