// A player standing still at spawn is found (the soak and its history: support/still-player.ts), on Switchyard and
// Survival Town; Station Nine's pairs are in still-player.soak.test.ts.
import { stillPlayerSoak } from './support/still-player';

stillPlayerSoak([
  ['switchyard', 'gungame'],
  ['survival-town', 'ffa'],
]);
