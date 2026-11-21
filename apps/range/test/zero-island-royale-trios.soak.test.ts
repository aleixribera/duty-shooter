// A whole Battle Royale match in Squads of 3, played out by bots (support/royale-matches.ts).
import { island } from './support/royale';
import { royaleMatchSoak } from './support/royale-matches';

royaleMatchSoak(island(), 3);
