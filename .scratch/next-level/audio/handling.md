# Weapon handling, measured

Each sound in your own hands, rendered offline through the game's sound system at 48 kHz, 3 plays a row (median; peaks are the highest). "Heard" is at the default mix after the master chain; the rest before it at master 1. LUFS is the loudest 400 ms; bands are each band's share of the energy (dB re total): sub < 80 Hz, low 80-250, mid 250-2k, presence 2k-6k, air > 6k; length is onset to 40 dB under the peak. A gunshot in the same hands reads -16 to -24 LUFS. WAVs: `wav/handling/`.

| sound | heard peak dBFS | peak dBFS | LUFS | loudest 50 ms dB | centroid Hz | sub | low | mid | presence | air | length ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| dryFire-m4a1 | -16.9 | -19.5 | -40.6 | -37.4 | 3653 | -52.3 | -39.8 | -4.5 | -2.7 | -9.5 | 48 |
| dryFire-smg | -17.8 | -20.4 | -42.1 | -38.9 | 3843 | -59.4 | -45.0 | -9.9 | -0.9 | -9.8 | 53 |
| dryFire-shotgun | -15.5 | -18.3 | -39.8 | -35.1 | 1753 | -28.5 | -10.9 | -1.9 | -6.0 | -15.2 | 124 |
| dryFire-sniper | -15.1 | -17.8 | -38.8 | -34.5 | 1913 | -29.9 | -15.7 | -1.8 | -5.5 | -15.7 | 123 |
| dryFire-pistol | -19.3 | -21.8 | -44.8 | -41.4 | 3765 | -24.9 | -13.7 | -6.9 | -2.2 | -8.2 | 25 |
| reloadMagOut-m4a1 | -16.0 | -18.4 | -33.9 | -34.5 | 2367 | -50.0 | -33.8 | -1.8 | -5.2 | -13.9 | 371 |
| reloadMagOut-smg | -16.6 | -19.1 | -33.8 | -35.1 | 2975 | -54.2 | -38.0 | -7.1 | -1.2 | -13.3 | 326 |
| reloadMagOut-sniper | -14.9 | -17.3 | -36.0 | -34.6 | 1626 | -21.4 | -9.9 | -1.6 | -7.7 | -15.1 | 365 |
| reloadMagOut-pistol | -18.5 | -21.0 | -38.6 | -38.3 | 3016 | -25.1 | -13.3 | -7.1 | -1.6 | -11.4 | 221 |
| reloadMagIn-m4a1 | -14.5 | -17.6 | -36.7 | -32.0 | 1541 | -22.7 | -8.5 | -1.7 | -8.7 | -14.4 | 189 |
| reloadMagIn-smg | -15.4 | -18.5 | -36.8 | -35.7 | 2426 | -35.4 | -24.5 | -3.4 | -3.0 | -13.8 | 210 |
| reloadMagIn-sniper | -13.1 | -16.2 | -34.8 | -30.0 | 1107 | -16.8 | -9.1 | -1.2 | -10.7 | -18.0 | 253 |
| reloadMagIn-pistol | -16.1 | -19.2 | -40.5 | -36.7 | 2311 | -23.1 | -12.3 | -3.1 | -4.0 | -13.0 | 83 |
| reloadBoltRelease-m4a1 | -13.2 | -16.0 | -35.0 | -30.2 | 1465 | -31.1 | -11.7 | -1.2 | -7.8 | -18.5 | 208 |
| reloadBoltRelease-pistol | -14.7 | -17.6 | -36.7 | -33.2 | 2487 | -36.5 | -25.6 | -2.1 | -4.7 | -13.5 | 130 |
| reloadChargingHandle-m4a1 | -13.2 | -16.3 | -32.7 | -31.0 | 2053 | -35.9 | -18.1 | -2.0 | -5.1 | -15.0 | 393 |
| reloadChargingHandle-smg | -14.4 | -17.5 | -34.5 | -33.7 | 2610 | -34.7 | -23.3 | -3.3 | -3.2 | -13.3 | 277 |
| weaponRaise-m4a1 | -18.0 | -21.1 | -33.3 | -34.6 | 2929 | -27.3 | -13.3 | -4.8 | -2.8 | -10.3 | 330 |
| weaponRaise-smg | -19.4 | -22.5 | -34.2 | -33.3 | 3434 | -40.0 | -20.8 | -4.9 | -2.7 | -9.2 | 217 |
| weaponRaise-shotgun | -18.1 | -21.2 | -33.6 | -33.3 | 2020 | -19.2 | -6.9 | -4.0 | -4.9 | -12.4 | 322 |
| weaponRaise-sniper | -17.2 | -20.3 | -32.8 | -33.7 | 2040 | -21.5 | -9.3 | -2.7 | -5.5 | -12.7 | 471 |
| weaponRaise-pistol | -22.0 | -24.5 | -39.4 | -38.0 | 2990 | -28.2 | -21.2 | -4.4 | -2.7 | -10.2 | 244 |
| pumpRack-shotgun | -12.1 | -15.2 | -30.4 | -29.8 | 1512 | -29.8 | -13.1 | -0.9 | -9.2 | -17.4 | 420 |
| shellInsert-shotgun | -14.5 | -17.6 | -37.9 | -34.1 | 1650 | -39.0 | -28.7 | -1.1 | -7.2 | -16.7 | 146 |
| boltOpen-sniper | -13.4 | -16.5 | -32.5 | -33.0 | 2386 | -50.6 | -38.5 | -2.5 | -3.9 | -14.1 | 299 |
| boltClose-sniper | -12.9 | -16.0 | -32.6 | -30.7 | 2121 | -32.8 | -15.3 | -1.8 | -5.6 | -14.3 | 220 |

