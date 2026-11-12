// Dumps a map's spots, fly-through and play area: node probe.mjs <map>
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
const map = process.argv[2] ?? 'survival-town';
const chrome = await launchChrome();
try {
  await chrome.navigate(`http://localhost:5173/?nolock&map=${map}`);
  await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.map', 180_000);
  await sleep(2000);
  console.log(await chrome.evaluate(`JSON.stringify({ name: duty.map.name, playArea: duty.map.playArea, spots: duty.map.referenceSpots, fly: duty.map.flyThrough, overview: duty.map.overview, ending: duty.map.endingShot ?? duty.map.ending ?? null, keys: Object.keys(duty.map), dummies: duty.map.dummies, sign: duty.map.populationSign, siren: duty.map.nuke?.siren, train: duty.map.train ? { ...duty.map.train, shot: duty.map.train.shot } : null })`));
} finally { await chrome.close(); }
