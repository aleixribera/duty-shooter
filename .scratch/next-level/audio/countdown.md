# The countdown, measured

Rendered offline through the game's sound system at 48 kHz at the default mix, after the master chain, the listener in the open. LUFS-M is the loudest 400 ms (BS.1770); windows are plain RMS (dBFS). For scale, at the same mix a rifle 15 m off reads about -25 LUFS-M and your own about -15 (the gun tables are measured before the master chain, which adds about 4.7 dB to quiet signals). WAVs: `wav/countdown/`.

## The siren, a piece at a time

| piece | distance m | place | LUFS-M | peak dBFS | centroid Hz | pitch at start Hz | pitch at end Hz | length s (to -40 dB) |
|---|---|---|---|---|---|---|---|---|
| rise | 150 | outdoor | -26.9 | -22.2 | 458 | 226 | 520 | 9.29 |
| hold | 150 | outdoor | -27.1 | -22.3 | 530 | 522 | 518 | 4.35 |
| fall | 150 | outdoor | -27.2 | -22.1 | 275 | 424 | 154 | 6.82 |
| rise | 250 | outdoor | -30.2 | -25.3 | 458 | 226 | 520 | 9.30 |
| hold | 250 | outdoor | -30.2 | -25.3 | 530 | 522 | 518 | 4.61 |
| fall | 250 | outdoor | -30.5 | -25.1 | 275 | 424 | 154 | 6.82 |
| rise | 400 | outdoor | -33.6 | -28.4 | 458 | 226 | 520 | 9.47 |
| hold | 400 | outdoor | -33.3 | -28.4 | 530 | 522 | 518 | 4.64 |
| fall | 400 | outdoor | -33.8 | -28.1 | 276 | 424 | 154 | 6.81 |
| rise | 250 | indoor | -30.5 | -26.2 | 458 | 234 | 520 | 8.89 |
| hold | 250 | indoor | -31.1 | -27.2 | 528 | 522 | 518 | 3.89 |
| fall | 250 | indoor | -30.8 | -26.1 | 273 | 416 | 154 | 6.83 |

## One tick of the counter

| intensity | LUFS-M | peak dBFS | centroid Hz | length ms (to -40 dB) |
|---|---|---|---|---|
| 0.45 | -43.6 | -17.0 | 5133 | 21.0 |
| 1 | -40.8 | -14.2 | 5133 | 21.0 |

## The last minute: the siren alone

- 19 cues; loudness -31.5 LUFS-I, loudest 400 ms -30.2 LUFS, peak -25.3 dBFS (0 samples over the clip knee); most voices at once in the system 2 (cap 64).

| seconds left | RMS dBFS | centroid Hz |
|---|---|---|
| 60-50 | -37.3 | 465 |
| 50-40 | -37.0 | 528 |
| 40-30 | -37.1 | 530 |
| 30-20 | -37.0 | 530 |
| 20-10 | -37.2 | 529 |
| 10-0 | -37.2 | 529 |

- The held note, from wound up to the clock running out (100 ms windows): median -37.3 dBFS, lowest -41.9, highest -34.8: the joins between its 4 s segments show as neither gap nor bump when these stay within a few dB (the siren's own slow wail moves it too).
- Winding down after the clock runs out: -37.2 dBFS 1-2 s after, -38.3 at 4-5 s, -63.0 at 8-9 s.
- WAV: `wav/countdown/last-minute-siren.wav`.

## The last minute: the counter alone

- 192 cues; loudness -34.7 LUFS-I, loudest 400 ms -27.8 LUFS, peak -10.7 dBFS (0 samples over the clip knee); most voices at once in the system 3 (cap 64).

| seconds left | RMS dBFS | centroid Hz | ticks a second (counted) |
|---|---|---|---|
| 60-50 | -61.3 | 4298 | 0.1 |
| 50-40 | -50.6 | 4676 | 0.6 |
| 40-30 | -50.2 | 4408 | 0.7 |
| 30-20 | -47.4 | 3954 | 1.4 |
| 20-10 | -45.4 | 4333 | 2.5 |
| 10-0 | -37.9 | 4345 | 12.3 |

- In the last two seconds: 23.0 ticks a second counted (21 rising to 30 a second are asked for there; ticks closer than 8 ms apart count as one).
- WAV: `wav/countdown/last-minute-counter.wav`.

## The last minute: the siren and the counter together

- 229 cues; loudness -30.6 LUFS-I, loudest 400 ms -26.3 LUFS, peak -9.5 dBFS (0 samples over the clip knee); most voices at once in the system 5 (cap 64).

| seconds left | RMS dBFS | centroid Hz |
|---|---|---|
| 60-50 | -37.2 | 513 |
| 50-40 | -36.6 | 844 |
| 40-30 | -36.7 | 894 |
| 30-20 | -36.4 | 1257 |
| 20-10 | -36.4 | 1245 |
| 10-0 | -34.6 | 2130 |

- WAV: `wav/countdown/last-minute-both.wav`.

