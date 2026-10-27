/**
 * The reference file for Survival Town: public measurements of the original
 * 2010 map's layout, each with its source and tolerance class. The map
 * exposes its own value for every entry (`measurements` on the map
 * definition) and the map tests compare the two.
 *
 * How the numbers were taken:
 *
 * - **No measured dimensions of the 2010 map are public.** No wiki,
 *   community or press page found gives house, window, fence or vehicle
 *   sizes. Nothing here comes from the game's files, and nothing is
 *   captured in game (the owner doesn't own the game).
 * - **The layout is read from the in-game mini-map** as published on the
 *   Call of Duty wiki (MINIMAP). It is a 512 x 512 px overhead render with a
 *   white outline around the playable area. Positions were read from its
 *   pixels, ±1 px.
 * - **Scale: 0.25 m per mini-map pixel**, from two independent estimates
 *   that agree:
 *   1. The playable area inside the white outline is about 47,000 px².
 *      Drift0r's community estimate of the playable area is about 2,972 m²
 *      (AREA). Together they give 0.251 m/px.
 *   2. The school bus is about 48.6 px long. Full-size conventional school
 *      buses of the era are about 11 to 12 m, which gives 0.23 to 0.25 m/px.
 *      The bus's length is then recorded as read (12.2 m), not assumed.
 * - **Player scale is the game's own**: eye height 1.524 m (60 units) and
 *   hull height 1.778 m (70 units), as in the stats file. Doors are sized for
 *   that hull: a little over the US standard 80 in (2.03 m) door height
 *   (DOORS), 2.15 m, clears a 1.778 m hull with room for a jump through.
 *
 * Assumptions, recorded as the spec requires:
 *
 * - The map is mirror symmetric about the street's axis (the wiki: "nearly
 *   symmetrical", two houses facing each other). The north half is measured
 *   (its outline is crisper on the mini-map) and the south half mirrors it.
 *   The vehicles are placed as read and are not mirrored.
 * - Roofs on the mini-map include their eaves. Walls are taken as 0.4 m
 *   inside the roof outline (a typical eave overhang).
 * - Wall thickness is 0.2 m outside and 0.12 m inside: frame walls with
 *   siding or plaster.
 * - Storey heights (3.0 m ground floor, 2.6 m upper floor) are typical of
 *   the period, and fit the original's split between a single-storey and a
 *   two-storey section seen on the mini-map's roofs.
 * - Interior layouts follow the wiki's description: the upper floor is
 *   reached by stairs inside, by outdoor stairs from the yard to a back deck,
 *   and through the main front window by climbing a planter and the porch
 *   roof. Room layouts beyond that are the map's own.
 * - Doors are 1.15 m wide instead of the 36 in (0.91 m) exterior or 32 in
 *   (0.81 m) interior standard: the 0.76 m player hull snags on the frames
 *   of standard doors unless it walks dead centre. Where accuracy and
 *   playability conflict, playability wins.
 *
 * Coordinates: metres, x east, y up, z south. The origin is the centre of
 * the cul-de-sac, on the street's axis; the north house belongs to team 1.
 */

/** ±15 cm for doors, windows, cover heights and wall positions; ±30 cm for everything else. */
export type ToleranceClass = 'structural' | 'other';

export const TOLERANCE: Readonly<Record<ToleranceClass, number>> = { structural: 0.15, other: 0.3 };

export interface ReferenceMeasurement {
  readonly id: string;
  readonly description: string;
  /** Metres. */
  readonly value: number;
  readonly tolerance: ToleranceClass;
  /** Keys of SOURCES, and how the value was derived from them. */
  readonly source: string;
}

export const SOURCES = {
  MINIMAP: 'Call of Duty wiki, "Nuketown" (Black Ops), mini-map image Map_Nuketown_BO.jpg, 512 x 512 px: https://callofduty.fandom.com/wiki/Nuketown_(map)',
  WIKI: 'Call of Duty wiki, "Nuketown" (Black Ops), Overview: https://callofduty.fandom.com/wiki/Nuketown_(map)',
  WIKIPEDIA: 'Wikipedia, "Nuketown": https://en.wikipedia.org/wiki/Nuketown',
  AREA: 'Drift0r\'s map size estimate, as reported in coverage of Blackout\'s size (playable area about 2,972 m²); see https://kotaku.com/youtuber-drift0r-calculated-the-possible-size-of-call-o-1826225926',
  DOORS: 'Bob Vila, "Standard door sizes": passage doors 80 in (2.03 m) tall: https://www.bobvila.com/articles/standard-size-for-doors',
} as const;

/** Mini-map pixels to metres. */
export const MINIMAP_SCALE = 0.25;
/** The mini-map pixel at the world origin (the cul-de-sac centre, on the street's axis). */
export const MINIMAP_ORIGIN = [279, 260] as const;

const px = (n: number) => n * MINIMAP_SCALE;

export const REFERENCE: readonly ReferenceMeasurement[] = [
  {
    id: 'house.width',
    description: 'House and garage together, west wall to east wall, outside faces',
    value: px(305 - 209) - 0.8,
    tolerance: 'structural',
    source: 'MINIMAP: north house roof outline x 209..305 px (96 px), less a 0.4 m eave each side',
  },
  {
    id: 'house.depth',
    description: 'Main house, front wall to back wall, outside faces',
    value: px(206 - 131) - 0.8,
    tolerance: 'structural',
    source: 'MINIMAP: main roof outline y 131..206 px (75 px), less a 0.4 m eave each side',
  },
  {
    id: 'garage.depth',
    description: 'Garage block, front wall to back wall, outside faces',
    value: px(212 - 148) - 0.8,
    tolerance: 'structural',
    source: 'MINIMAP: garage roof outline y 148..212 px (64 px), less a 0.4 m eave each side',
  },
  {
    id: 'house.frontGap',
    description: 'North house front wall to south house front wall, across the cul-de-sac',
    value: 2 * (px(260 - 206) + 0.4),
    tolerance: 'structural',
    source: 'MINIMAP: main roof front edge 54 px from the street axis, plus the 0.4 m eave; mirrored for the south house',
  },
  {
    id: 'door.height',
    description: 'Exterior door opening height above the floor',
    value: 2.03,
    tolerance: 'structural',
    source: 'DOORS: 80 in standard door height',
  },
  {
    id: 'culdesac.radius',
    description: 'Radius of the cul-de-sac turning circle',
    value: px(35),
    tolerance: 'other',
    source: 'MINIMAP: inner turning circle about 70 px across',
  },
  {
    id: 'street.width',
    description: 'Width of the playable street opening at the east end',
    value: px(294 - 226),
    tolerance: 'other',
    source: 'MINIMAP: outline at the street end y 226..294 px',
  },
  {
    id: 'map.northExtent',
    description: 'Street axis to the north end of the playable area',
    value: px(260 - 54),
    tolerance: 'other',
    source: 'MINIMAP: outline north tip at y 54 px',
  },
  {
    id: 'map.westExtent',
    description: 'Cul-de-sac centre to the west end of the playable area',
    value: px(279 - 179),
    tolerance: 'other',
    source: 'MINIMAP: outline west extreme at x 179 px (north back yard)',
  },
  {
    id: 'map.eastExtent',
    description: 'Cul-de-sac centre to the playable street end',
    value: px(359 - 279),
    tolerance: 'other',
    source: 'MINIMAP: outline east end at x 359 px',
  },
  {
    id: 'bus.length',
    description: 'School bus, bumper to bumper',
    value: 12.2,
    tolerance: 'other',
    source: 'MINIMAP: bus 48.6 px long at 0.25 m/px (see the scale note)',
  },
];
