# Gunshots, measured (after)

Each shot rendered offline through the game's sound system at 48 kHz (panner, air absorption, environment reverb, buses, master chain), 3 shots a row (median; peaks are the highest of them). "Heard" is at the default mix (master 0.8) after the compressor, limiter and soft clipper; the rest is measured before the master chain at master 1. LUFS is the loudest 400 ms (BS.1770 momentary). Bands are each band's share of the shot's energy (dB re total): sub < 80 Hz, low 80-250, mid 250-2k, presence 2k-6k, air > 6k. Attack is the direct sound's rise, 10% to 90% of the highest level in the 5 ms after the onset; "peak at" is where the shot's highest peak falls after the onset (a far sniper's boom arrives after its crack; indoors a reflection can top the front); T60 is the Schroeder decay (-5 to -25 dB, times three); length is onset to 40 dB under the peak (5 ms RMS). WAVs: `wav/guns-after/`.

| shot | heard peak dBFS | heard LUFS | over clip knee | peak dBFS | LUFS | loudest 50 ms dB | centroid Hz | sub | low | mid | presence | air | attack ms | peak at ms | T60 ms | length ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| m4a1-first-person-outdoor | -2.1 | -16.9 | 0 | -4.0 | -19.5 | -15.6 | 1154 | -10.0 | -2.8 | -7.4 | -8.2 | -13.8 | 0.00 | 0.3 | 363 | 299 |
| m4a1-first-person-indoor | -2.1 | -17.6 | 0 | -4.0 | -20.1 | -15.5 | 1102 | -9.7 | -2.5 | -8.2 | -8.6 | -13.6 | 0.00 | 0.3 | 402 | 306 |
| m4a1-near-15m-outdoor | -10.3 | -26.0 | 0 | -13.3 | -29.1 | -24.9 | 958 | -19.3 | -2.3 | -7.3 | -7.1 | -20.5 | 0.40 | 0.4 | 350 | 306 |
| m4a1-near-15m-indoor | -10.2 | -25.8 | 0 | -13.3 | -28.9 | -24.5 | 804 | -20.9 | -1.6 | -9.4 | -8.1 | -21.0 | 0.40 | 0.4 | 463 | 385 |
| m4a1-far-150m-outdoor | -19.3 | -35.2 | 0 | -22.4 | -38.2 | -32.5 | 168 | -3.9 | -4.1 | -6.8 | -42.1 | -90.9 | 3.23 | 7.9 | 1504 | 890 |
| m4a1-far-150m-indoor | -19.1 | -35.2 | 0 | -22.2 | -38.2 | -32.7 | 169 | -4.1 | -3.9 | -6.8 | -41.9 | -90.7 | 3.25 | 7.9 | 1469 | 897 |
| smg-first-person-outdoor | -3.2 | -20.4 | 0 | -5.5 | -23.0 | -18.9 | 2211 | -16.7 | -4.5 | -6.1 | -5.1 | -10.6 | 0.00 | 0.0 | 248 | 167 |
| smg-first-person-indoor | -3.2 | -20.3 | 0 | -5.5 | -22.9 | -18.8 | 2289 | -16.6 | -4.6 | -6.4 | -5.1 | -10.5 | 0.00 | 0.0 | 225 | 172 |
| smg-near-15m-outdoor | -14.5 | -30.4 | 0 | -17.6 | -33.5 | -29.5 | 1428 | -20.5 | -3.1 | -6.6 | -6.0 | -15.9 | 0.67 | 1.5 | 265 | 201 |
| smg-near-15m-indoor | -13.8 | -30.0 | 0 | -16.9 | -33.1 | -29.6 | 1599 | -20.4 | -3.2 | -7.1 | -5.3 | -16.1 | 0.52 | 7.0 | 345 | 226 |
| smg-far-150m-outdoor | -24.5 | -38.4 | 0 | -27.6 | -41.5 | -36.3 | 149 | -4.9 | -2.8 | -8.1 | -42.8 | -77.8 | 3.69 | 11.7 | 858 | 660 |
| smg-far-150m-indoor | -24.2 | -38.2 | 0 | -27.3 | -41.3 | -35.8 | 145 | -5.1 | -2.6 | -8.4 | -42.8 | -89.2 | 3.69 | 11.7 | 833 | 565 |
| shotgun-first-person-outdoor | -2.1 | -14.5 | 0 | -3.9 | -17.1 | -13.7 | 413 | -3.9 | -3.7 | -8.9 | -14.9 | -20.2 | 0.15 | 0.1 | 875 | 579 |
| shotgun-first-person-indoor | -2.1 | -14.6 | 0 | -3.9 | -17.2 | -13.8 | 420 | -3.6 | -3.9 | -9.1 | -14.6 | -19.9 | 0.15 | 0.1 | 879 | 577 |
| shotgun-near-15m-outdoor | -8.3 | -23.9 | 0 | -11.4 | -27.0 | -23.4 | 462 | -6.4 | -3.6 | -5.6 | -12.5 | -25.5 | 1.25 | 1.3 | 825 | 575 |
| shotgun-near-15m-indoor | -8.0 | -23.0 | 0 | -11.0 | -26.1 | -22.5 | 436 | -6.7 | -3.0 | -6.7 | -12.3 | -25.8 | 1.13 | 1.1 | 794 | 589 |
| shotgun-far-150m-outdoor | -18.2 | -34.2 | 0 | -21.3 | -37.3 | -33.0 | 198 | -6.5 | -2.7 | -6.1 | -50.9 | -85.3 | 2.44 | 10.6 | 2233 | 1100 |
| shotgun-far-150m-indoor | -18.0 | -34.1 | 0 | -21.1 | -37.1 | -32.9 | 193 | -6.4 | -2.7 | -6.3 | -51.0 | -77.2 | 2.42 | 10.6 | 2250 | 1088 |
| sniper-first-person-outdoor | -1.8 | -13.9 | 0 | -3.4 | -16.7 | -14.7 | 489 | -2.8 | -5.2 | -10.2 | -11.5 | -19.3 | 0.38 | 0.4 | 1547 | 1166 |
| sniper-first-person-indoor | -1.8 | -14.1 | 0 | -3.4 | -16.7 | -14.3 | 466 | -2.7 | -5.2 | -11.3 | -11.8 | -19.0 | 0.38 | 0.4 | 1091 | 662 |
| sniper-near-15m-outdoor | -11.2 | -22.3 | 0 | -14.3 | -25.4 | -24.9 | 833 | -5.9 | -4.2 | -7.0 | -7.8 | -23.4 | 0.33 | 0.4 | 2038 | 1428 |
| sniper-near-15m-indoor | -7.7 | -22.5 | 0 | -10.8 | -25.6 | -23.7 | 681 | -6.0 | -3.1 | -8.6 | -8.8 | -23.2 | 0.33 | 14.5 | 1057 | 924 |
| sniper-far-150m-outdoor | -20.7 | -33.6 | 0 | -23.8 | -36.6 | -32.3 | 176 | -6.1 | -2.6 | -6.9 | -47.0 | -86.4 | 0.25 | 85.5 | 3115 | 1380 |
| sniper-far-150m-indoor | -20.7 | -33.3 | 0 | -23.8 | -36.4 | -32.1 | 172 | -6.2 | -2.5 | -7.2 | -47.1 | -85.3 | 0.23 | 85.5 | 3147 | 1419 |
| pistol-first-person-outdoor | -3.2 | -21.6 | 0 | -5.6 | -24.2 | -20.2 | 1696 | -24.3 | -4.5 | -3.9 | -7.3 | -12.7 | 0.31 | 0.3 | 219 | 166 |
| pistol-first-person-indoor | -3.2 | -21.8 | 0 | -5.6 | -24.4 | -20.2 | 1696 | -23.3 | -4.2 | -4.5 | -7.4 | -12.5 | 0.31 | 0.3 | 198 | 179 |
| pistol-near-15m-outdoor | -14.2 | -31.4 | 0 | -17.3 | -34.5 | -30.1 | 1251 | -26.1 | -2.9 | -6.3 | -6.2 | -19.5 | 0.33 | 6.9 | 246 | 182 |
| pistol-near-15m-indoor | -14.0 | -31.1 | 0 | -17.1 | -34.2 | -30.0 | 1296 | -25.5 | -2.8 | -6.9 | -5.9 | -19.4 | 0.33 | 0.4 | 264 | 207 |
| pistol-far-150m-outdoor | -25.1 | -39.0 | 0 | -28.2 | -42.1 | -36.8 | 149 | -4.9 | -2.8 | -8.1 | -42.8 | -77.8 | 3.69 | 11.7 | 858 | 660 |
| pistol-far-150m-indoor | -24.8 | -38.8 | 0 | -27.9 | -41.9 | -36.4 | 145 | -5.1 | -2.6 | -8.4 | -42.8 | -89.2 | 3.69 | 11.7 | 833 | 565 |

- Loudest first, first-person outdoor: sniper -16.7 > shotgun -17.1 > m4a1 -19.5 > smg -23.0 > pistol -24.2
- Loudest first, first-person indoor: sniper -16.7 > shotgun -17.2 > m4a1 -20.1 > smg -22.9 > pistol -24.4
- Loudest first, near-15m outdoor: sniper -25.4 > shotgun -27.0 > m4a1 -29.1 > smg -33.5 > pistol -34.5
- Loudest first, near-15m indoor: sniper -25.6 > shotgun -26.1 > m4a1 -28.9 > smg -33.1 > pistol -34.2
- Loudest first, far-150m outdoor: sniper -36.6 > shotgun -37.3 > m4a1 -38.2 > smg -41.5 > pistol -42.1
- Loudest first, far-150m indoor: sniper -36.4 > shotgun -37.1 > m4a1 -38.2 > smg -41.3 > pistol -41.9
