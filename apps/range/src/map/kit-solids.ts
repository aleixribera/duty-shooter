// Written by tools/map/fit-solids.mjs from the models' GLBs: don't edit, rerun it.

/** A box of a kit model's solid, in the model's unit frame (x and z across, y up): its middle and size. */
export interface KitBox {
  readonly c: readonly [number, number, number];
  readonly s: readonly [number, number, number];
}

/** The boxes each kit model's solid is made of, every one inside its mesh (ticket 63). */
export const KIT_SOLIDS: Readonly<Record<string, readonly KitBox[]>> = {
  'rock-a': [
    { c: [-0.02, 0.453, 0.01], s: [0.84, 1.0205, 0.86] },
    { c: [-0.01, 0.3697, -0.02], s: [0.96, 0.852, 0.94] },
  ],
  'rock-b': [
    { c: [0, 0.3904, -0.02], s: [0.98, 0.8936, 0.82] },
    { c: [-0.21, 0.4302, 0.03], s: [0.56, 0.9711, 0.92] },
    { c: [0.2, 0.3901, -0.05], s: [0.58, 0.893, 0.88] },
    { c: [-0.2, 0.4569, -0.03], s: [0.42, 1.0287, 0.64] },
  ],
  'rock-strata': [
    { c: [0.005, 0.4193, -0.015], s: [0.91, 0.9525, 0.91] },
    { c: [0.015, 0.4614, 0], s: [0.81, 1.0383, 0.82] },
    { c: [0.01, 0.3199, -0.005], s: [0.96, 0.752, 0.93] },
  ],
  'pine-trunk': [
    { c: [0, 0.4736, 0], s: [0.52, 0.9473, 0.44] },
    { c: [0, 0.4714, 0], s: [0.28, 0.9427, 0.68] },
    { c: [0, 0.255, 0], s: [0.76, 0.5099, 0.36] },
    { c: [0, 0.255, 0], s: [0.36, 0.5099, 0.76] },
  ],
  'broadleaf-trunk': [
    { c: [0, 0.5, 0.005], s: [0.52, 1, 0.45] },
    { c: [0.02, 0.4951, -0.01], s: [0.32, 0.9902, 0.66] },
    { c: [-0.01, 0.5, 0.02], s: [0.66, 1, 0.32] },
    { c: [0.01, 0.4548, -0.01], s: [0.32, 0.9096, 0.68] },
  ],
};
