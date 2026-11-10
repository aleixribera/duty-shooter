# The score, measured

Rendered offline through the game's sound system at 48 kHz at the default mix (master 0.8, music 0.7), after the master chain. LUFS-I is the gated integrated loudness (BS.1770), LUFS-M the loudest 400 ms; levels in windows are plain RMS (dBFS). WAVs: `wav/music/`.

## Menu theme (100 s: three passes of the 32 s loop)

- Loudness -21.5 LUFS-I, loudest 400 ms -18.5 LUFS, peak -9.7 dBFS, DC offset 1.7e-5.
- RMS per 10 s (dBFS): -26.4, -25.6, -25.4, -23.2, -23.0, -22.5, -22.8, -22.7, -22.5, -23.0 (it fades in over 2.5 s; the motif enters at 32 s).
- Loop points: worst sample-to-sample jump within 30 ms of 32 s, 64 s and 96 s: 0.0040, 0.0040, 0.0045; worst anywhere in the render 0.0492 (at 52.45 s), mean 0.00239. A click would stand far above the rest.
- Level across each loop point (50 ms before / after, dBFS): -25.7 / -24.6, -25.7 / -24.5, -25.2 / -24.2.
- Rendering 100 s took 2532 ms offline. WAV: `wav/music/menu-theme-100s.wav` (and seconds 30-90 of it, across the loop point with the motif entering, as `menu-theme-60s.wav`).

## The last minute: the bed, and the riser over it for the final ten

- Loudness -24.7 LUFS-I, loudest 400 ms -16.8 LUFS, peak -8.9 dBFS (0 samples over the clip knee), DC offset 1.3e-4.

| seconds left | RMS dBFS | centroid Hz |
|---|---|---|
| 60-50 | -27.8 | 96 |
| 50-40 | -26.3 | 95 |
| 40-30 | -27.0 | 93 |
| 30-20 | -26.2 | 102 |
| 20-10 | -26.7 | 99 |
| 10-0 | -23.6 | 256 |

- The final ten, a second at a time (dBFS): -24.4, -28.4, -29.8, -23.5, -24.2, -25.1, -23.9, -21.7, -21.2, -21.0. Across the hand-over: -27.1 in the two seconds before, -25.9 in the two after.
- The last second reads -21.0 dBFS; 50-300 ms after the clock runs out -25.4 dBFS, and half a second on - dBFS (the riser is cut dead on its knock; the bed goes with the scene, over 0.12 s).
- Worst sample-to-sample jump before the end: 0.1110 at 59.66 s (the riser joins the bed at 50 s).
- WAV: `wav/music/last-minute-score-only.wav`.

## The last minute as a match hears it: the score, the siren (250 m off) and the counter

- Loudness -24.0 LUFS-I, loudest 400 ms -16.4 LUFS, peak -6.6 dBFS (0 samples over the clip knee), DC offset 1.2e-4, 210 siren and counter cues.

| seconds left | RMS dBFS | centroid Hz |
|---|---|---|
| 60-50 | -27.3 | 142 |
| 50-40 | -25.9 | 134 |
| 40-30 | -26.6 | 150 |
| 30-20 | -25.8 | 193 |
| 20-10 | -26.3 | 172 |
| 10-0 | -23.2 | 406 |

- The final ten, a second at a time (dBFS): -24.1, -27.6, -28.9, -23.3, -23.7, -24.7, -23.5, -21.4, -20.9, -20.7. Across the hand-over: -26.6 in the two seconds before, -25.5 in the two after.
- The last second reads -20.7 dBFS; 50-300 ms after the clock runs out -25.2 dBFS, and half a second on -36.1 dBFS (the siren winding down).
- Worst sample-to-sample jump before the end: 0.3658 at 56.90 s (the riser joins the bed at 50 s).
- WAV: `wav/music/last-minute-with-siren-and-counter.wav`.

## Stings

| sting | LUFS-M | peak dBFS | centroid Hz | length ms (to -40 dB) | DC |
|---|---|---|---|---|---|
| matchStart | -19.3 | -9.6 | 267 | 3400 | -1.4e-6 |
| ringClosing | -19.5 | -12.0 | 367 | 3004 | 1.4e-8 |
| victory | -18.9 | -9.6 | 375 | 5592 | -1.0e-6 |
| defeat | -19.3 | -11.4 | 229 | 5266 | -5.1e-7 |

## Ducking

The bed alone in the render (effects volume 0: the sounds still duck it), against the same render with no sounds in it, in 50 ms windows.

| under | apart half a second before dB | ducked by dB | 90 % down within ms (the 50 ms window is the floor) | back within 1 dB, s after it starts | s after it ends |
|---|---|---|---|---|---|
| ten of your own rifle rounds in a second | 0.00 | 9.0 | 55 | 1.83 | 0.83 |
| one rifle shot 60 m off | 0.00 | 2.8 | 51 | 0.58 | 0.48 |
| a frag 8 m off | -0.00 | 14.0 | 61 | 1.49 | 1.09 |
| the announcer, a 1.5 s line | 0.00 | 5.0 | 123 | 1.84 | 0.34 |

- WAV: `wav/music/ducking-music-only.wav`.

