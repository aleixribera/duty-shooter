# The rifle reads as a dark-grey gun, not a black cut-out

Status: resolved

Release: v2.184.0

Spec: `../spec.md`

Left over from ticket 37 (`37-gun-in-shade.md`): even in full sun on Survival Town, the M4A1's receiver was a black silhouette. Its side measured 2 of 255 and its handguard 5, with the rail's top the only part that read (23). The lights weren't the cause, the finish was. The anodised receiver had an albedo of 0.036 and was 80% metallic, so it took almost no diffuse light, only its highlights. The polymer was 0.03, and the steel, magazine and nitride were the same near-black.

## Comments

**v2.184.0.** The black finishes are now a dark grey, as black guns read in the shooters this game is measured against. The values are in `makeMaterials` / `makeLowMaterials` in `m4a1.ts`:

| Finish | Albedo | Metalness |
| --- | --- | --- |
| Anodised (a dyed oxide coat over aluminium) | 0.036 → 0.075 | 0.8 → 0.3 |
| Steel | 0.058 → 0.09 | 0.55 → 0.45 |
| Polymer | 0.03 → 0.05 | unchanged |
| Magazine | 0.062 → 0.085 | 0.6 → 0.45 |
| Nitride | 0.05 → 0.07 | 0.85 → 0.6 |

The worn edges, roughness and the low-detail twins follow the same values.

Measured with `../gun-shade/shade.mjs` at the same two spots as ticket 37 and `../gun-shade/patches.py`, which takes the mean sRGB of fixed patches on the gun. The before and after screens are in `../gun-finish/`, with side-by-side crops in `after/*-pair.jpg`.

| Patch | Sun before | Sun after | Shade before | Shade after |
| --- | --- | --- | --- | --- |
| Receiver side | 2.0 | 15.6 | 0.9 | 10.7 |
| Handguard | 5.2 | 23.3 | 3.6 | 17.3 |
| Rail top | 22.8 | 39.6 | 22.1 | 34.6 |
| Magazine | 21.4 | 29.3 | 17.1 | 23.4 |

The rail's teeth, the handguard's holes, the receiver's edges and the magazine well now read, and it is still a black rifle. `m4a1-asset.test.ts` passes, and so does the typecheck. No page errors.

The other guns (their own `.glb` materials) are not changed here.
