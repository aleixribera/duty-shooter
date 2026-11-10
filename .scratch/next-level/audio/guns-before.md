# Gunshots, measured (before)

Each shot rendered offline through the game's sound system at 48 kHz (panner, air absorption, environment reverb, buses, master chain), 3 shots a row (median; peaks are the highest of them). "Heard" is at the default mix (master 0.8) after the compressor, limiter and soft clipper; the rest is measured before the master chain at master 1. LUFS is the loudest 400 ms (BS.1770 momentary). Bands are each band's share of the shot's energy (dB re total): sub < 80 Hz, low 80-250, mid 250-2k, presence 2k-6k, air > 6k. Attack is 10% to 90% of the peak; T60 is the Schroeder decay (-5 to -25 dB, times three); length is onset to 40 dB under the peak (5 ms RMS). WAVs: `wav/guns-before/`.

| shot | heard peak dBFS | heard LUFS | over clip knee | peak dBFS | LUFS | loudest 50 ms dB | centroid Hz | sub | low | mid | presence | air | attack ms | T60 ms | length ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| m4a1-first-person-outdoor | -5.7 | -20.6 | 0 | -5.6 | -19.4 | -13.9 | 314 | -2.4 | -5.1 | -10.6 | -15.0 | -21.8 | 5.63 | 1940 | 1195 |
| m4a1-first-person-indoor | -5.3 | -19.3 | 0 | -3.6 | -18.4 | -12.9 | 230 | -2.2 | -4.8 | -13.6 | -16.8 | -23.0 | 38.33 | 830 | 581 |
| m4a1-near-15m-outdoor | -11.8 | -24.1 | 0 | -13.5 | -26.4 | -23.9 | 654 | -5.8 | -5.6 | -4.1 | -12.2 | -24.8 | 4.58 | 2606 | 1200 |
| m4a1-near-15m-indoor | -10.4 | -24.4 | 0 | -10.8 | -26.2 | -22.0 | 372 | -4.9 | -3.1 | -8.6 | -14.2 | -25.9 | 7.17 | 880 | 625 |
| m4a1-far-150m-outdoor | -23.5 | -34.8 | 0 | -26.6 | -38.0 | -40.5 | 257 | -10.4 | -2.6 | -4.4 | -42.7 | -86.4 | 131.52 | 2595 | 1937 |
| m4a1-far-150m-indoor | -20.1 | -32.6 | 0 | -23.2 | -35.6 | -34.4 | 120 | -5.8 | -1.6 | -13.0 | -49.6 | -80.8 | 137.58 | 2040 | 1219 |
| smg-first-person-outdoor | -9.1 | -23.4 | 0 | -9.0 | -22.1 | -17.2 | 436 | -3.4 | -3.8 | -10.6 | -13.7 | -19.1 | 4.63 | 2169 | 1193 |
| smg-first-person-indoor | -7.9 | -22.0 | 0 | -8.5 | -21.0 | -16.7 | 328 | -2.5 | -4.4 | -12.9 | -15.5 | -20.2 | 4.63 | 993 | 628 |
| smg-near-15m-outdoor | -13.3 | -27.3 | 0 | -15.9 | -29.6 | -26.7 | 708 | -7.8 | -3.9 | -4.9 | -11.0 | -21.9 | 3.35 | 2637 | 1199 |
| smg-near-15m-indoor | -11.9 | -26.9 | 0 | -13.7 | -28.7 | -24.1 | 362 | -7.5 | -1.8 | -9.3 | -14.2 | -24.3 | 10.54 | 1040 | 627 |
| smg-far-150m-outdoor | -25.7 | -38.3 | 0 | -28.8 | -41.4 | -41.3 | 225 | -7.2 | -2.4 | -6.3 | -39.1 | -85.3 | 121.38 | 2408 | 1452 |
| smg-far-150m-indoor | -21.6 | -34.2 | 0 | -24.7 | -37.3 | -34.7 | 106 | -5.7 | -1.5 | -16.0 | -46.4 | -80.6 | 34.56 | 1224 | 779 |
| shotgun-first-person-outdoor | -2.1 | -17.7 | 0 | -2.5 | -16.7 | -10.7 | 207 | -1.1 | -9.6 | -8.9 | -18.6 | -27.3 | 15.38 | 1720 | 1150 |
| shotgun-first-person-indoor | -3.0 | -18.2 | 0 | -0.5 | -16.4 | -10.2 | 164 | -1.0 | -10.3 | -10.9 | -19.7 | -27.7 | 20.38 | 1373 | 880 |
| shotgun-near-15m-outdoor | -8.0 | -21.0 | 0 | -9.8 | -23.4 | -21.7 | 558 | -6.9 | -5.9 | -3.1 | -13.4 | -30.7 | 13.04 | 2753 | 1216 |
| shotgun-near-15m-indoor | -7.2 | -21.9 | 0 | -8.6 | -23.7 | -20.3 | 357 | -5.5 | -3.6 | -5.8 | -14.8 | -31.8 | 16.08 | 986 | 681 |
| shotgun-far-150m-outdoor | -23.5 | -33.3 | 0 | -26.5 | -36.4 | -39.3 | 256 | -12.8 | -2.3 | -4.6 | -50.3 | -91.9 | 142.21 | 2704 | 2004 |
| shotgun-far-150m-indoor | -20.6 | -32.3 | 0 | -23.7 | -35.4 | -34.3 | 145 | -7.2 | -1.4 | -11.1 | -55.8 | -90.5 | 82.17 | 1957 | 1284 |
| sniper-first-person-outdoor | -3.8 | -17.8 | 0 | -2.9 | -16.8 | -10.7 | 240 | -1.3 | -8.3 | -9.6 | -17.3 | -24.4 | 14.21 | 1733 | 1148 |
| sniper-first-person-indoor | -3.0 | -17.0 | 0 | -1.0 | -16.0 | -10.1 | 188 | -1.4 | -7.0 | -11.5 | -19.0 | -25.3 | 36.71 | 1093 | 785 |
| sniper-near-15m-outdoor | -8.7 | -21.2 | 0 | -9.8 | -23.5 | -21.6 | 643 | -7.0 | -6.1 | -3.1 | -11.9 | -27.2 | 12.08 | 2636 | 1223 |
| sniper-near-15m-indoor | -7.7 | -22.1 | 0 | -7.8 | -24.1 | -20.6 | 415 | -6.1 | -3.3 | -6.4 | -13.2 | -27.9 | 14.96 | 1079 | 656 |
| sniper-far-150m-outdoor | -24.3 | -34.7 | 0 | -27.4 | -37.9 | -40.2 | 276 | -10.6 | -2.8 | -4.2 | -47.3 | -88.7 | 199.40 | 3033 | 2250 |
| sniper-far-150m-indoor | -22.8 | -33.6 | 0 | -25.9 | -36.6 | -36.1 | 140 | -5.3 | -2.1 | -11.1 | -52.7 | -92.8 | 143.17 | 2328 | 1571 |
| pistol-first-person-outdoor | -10.2 | -24.2 | 0 | -9.1 | -22.9 | -18.0 | 430 | -3.6 | -3.6 | -10.5 | -14.1 | -18.9 | 4.33 | 2283 | 1175 |
| pistol-first-person-indoor | -8.3 | -22.4 | 0 | -8.7 | -21.4 | -17.1 | 293 | -2.4 | -4.5 | -13.3 | -16.2 | -20.6 | 4.33 | 798 | 630 |
| pistol-near-15m-outdoor | -13.9 | -27.8 | 0 | -15.8 | -30.0 | -27.2 | 718 | -8.3 | -3.6 | -5.1 | -10.8 | -21.4 | 4.02 | 2621 | 1176 |
| pistol-near-15m-indoor | -13.7 | -27.2 | 0 | -13.9 | -29.1 | -24.8 | 356 | -6.6 | -2.0 | -9.9 | -13.8 | -23.8 | 10.02 | 946 | 630 |
| pistol-far-150m-outdoor | -26.2 | -38.8 | 0 | -29.3 | -41.8 | -41.8 | 225 | -7.2 | -2.4 | -6.3 | -39.0 | -85.1 | 121.38 | 2408 | 1452 |
| pistol-far-150m-indoor | -22.1 | -34.7 | 0 | -25.2 | -37.8 | -35.2 | 106 | -5.7 | -1.5 | -16.0 | -46.3 | -80.6 | 34.56 | 1224 | 779 |

- Loudest first, first-person outdoor: shotgun -16.7 > sniper -16.8 > m4a1 -19.4 > smg -22.1 > pistol -22.9
- Loudest first, first-person indoor: sniper -16.0 > shotgun -16.4 > m4a1 -18.4 > smg -21.0 > pistol -21.4
- Loudest first, near-15m outdoor: shotgun -23.4 > sniper -23.5 > m4a1 -26.4 > smg -29.6 > pistol -30.0
- Loudest first, near-15m indoor: shotgun -23.7 > sniper -24.1 > m4a1 -26.2 > smg -28.7 > pistol -29.1
- Loudest first, far-150m outdoor: shotgun -36.4 > sniper -37.9 > m4a1 -38.0 > smg -41.4 > pistol -41.8
- Loudest first, far-150m indoor: shotgun -35.4 > m4a1 -35.6 > sniper -36.6 > smg -37.3 > pistol -37.8
