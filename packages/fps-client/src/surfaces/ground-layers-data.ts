// Written by tools/textures/ground.py: don't edit by hand.

/** One layer of the ground's photo strips: what it is, the metres one tile covers, and its mean colour (linear). */
export interface GroundLayer {
  readonly name: string;
  readonly metres: number;
  readonly mean: readonly [number, number, number];
}

/** Pixels a side of one layer. */
export const GROUND_LAYER_SIZE = 512;

export const GROUND_LAYERS: readonly GroundLayer[] = [
  { name: 'meadow', metres: 2.0, mean: [0.3176, 0.2337, 0.1044] }, // Poly Haven leafy_grass, CC0, Charlotte Baglioni
  { name: 'beach', metres: 5.0, mean: [0.2258, 0.1726, 0.1086] }, // Poly Haven coast_sand_01, CC0, Rob Tuytel
  { name: 'dust', metres: 2.5, mean: [0.2895, 0.1599, 0.0745] }, // Poly Haven gravelly_sand, CC0, Dario Barresi
  { name: 'rock', metres: 3.0, mean: [0.1412, 0.0961, 0.0718] }, // Poly Haven dry_riverbed_rock, CC0, Amal Kumar
  { name: 'snow', metres: 3.0, mean: [0.3788, 0.3784, 0.3884] }, // Poly Haven snow_02, CC0, Rob Tuytel
  { name: 'ice', metres: 2.5, mean: [0.3632, 0.355, 0.3374] }, // Poly Haven snow_03, CC0, Rob Tuytel
  { name: 'jungle', metres: 1.6, mean: [0.1363, 0.0971, 0.0357] }, // Poly Haven brown_mud_leaves_01, CC0, Rob Tuytel
  { name: 'ash', metres: 1.6, mean: [0.1463, 0.1079, 0.0768] }, // Poly Haven burned_ground_01, CC0, Rob Tuytel
  { name: 'asphalt', metres: 2.1, mean: [0.1006, 0.0801, 0.0621] }, // Poly Haven asphalt_01, CC0, Dario Barresi, Charlotte Baglioni
  { name: 'dock', metres: 2.0, mean: [0.4859, 0.4672, 0.338] }, // Poly Haven rough_concrete, CC0, Dimitrios Savva
  { name: 'ballast', metres: 2.9, mean: [0.1954, 0.1546, 0.1086] }, // Poly Haven river_small_rocks, CC0, Rob Tuytel, Rico Cilliers
  { name: 'bed', metres: 2.0, mean: [0.2295, 0.1619, 0.0976] }, // Poly Haven dry_river_pebbles, CC0, Amal Kumar
  { name: 'cliff', metres: 9.0, mean: [0.2122, 0.0913, 0.0337] }, // Poly Haven cliff_side, CC0, James Ray Cock, Jenelle van Heerden, Dario Barresi
  { name: 'slab', metres: 4.0, mean: [0.079, 0.0581, 0.0372] }, // Poly Haven concrete_floor_damaged_01, CC0, Rob Tuytel
  { name: 'wall', metres: 2.5, mean: [0.1078, 0.0831, 0.0615] }, // Poly Haven concrete_wall_006, CC0, Dario Barresi, Charlotte Baglioni
  { name: 'steel', metres: 1.5, mean: [0.4128, 0.2885, 0.1367] }, // Poly Haven rusty_metal_02, CC0, Rob Tuytel
  { name: 'boulder', metres: 1.8, mean: [0.3993, 0.3383, 0.2716] }, // Poly Haven rock_boulder_dry, CC0, Dimitrios Savva, Rico Cilliers
  { name: 'moss', metres: 3.0, mean: [0.1635, 0.1564, 0.1016] }, // Poly Haven mossy_rock, CC0, Rob Tuytel
];
