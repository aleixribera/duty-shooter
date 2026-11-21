// A player standing still at spawn is found (the soak and its history: support/still-player.ts). Station Nine's
// pairs; the other maps' are in still-player-maps.soak.test.ts, so the two files run side by side.
import { stillPlayerSoak } from './support/still-player';

stillPlayerSoak([
  ['station-nine', 'gungame'],
  ['station-nine', 'ffa'],
]);
