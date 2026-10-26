// Runs the browser benchmark without a person at the keyboard: opens the page
// with ?bench in Chrome at 1920 x 1080 (vsync off, so frame times show what
// the GPU can do), waits for the report and prints it as JSON.
//
//   node apps/range/scripts/bench.mjs [map] [base url]
//   node apps/range/scripts/bench.mjs survival-town http://localhost:5173/
import { launchChrome } from './chrome.mjs';

const map = process.argv[2] ?? 'survival-town';
const base = process.argv[3] ?? 'http://localhost:5173/';
const chrome = await launchChrome();
try {
  const url = new URL(base);
  url.searchParams.set('bench', '');
  url.searchParams.set('map', map);
  await chrome.navigate(url.toString());
  const report = await chrome.waitFor("document.body.dataset.benchmark === 'done' ? JSON.stringify(globalThis.duty?.benchmark) : null", 15 * 60_000, 2000);
  if (!report) throw new Error('The benchmark did not finish in 15 minutes');
  console.log(JSON.stringify({ ...JSON.parse(report), browser: 'Chrome (headless)', consoleErrors: chrome.errors }, null, 1));
} finally {
  await chrome.close();
}
