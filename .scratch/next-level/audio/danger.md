# Danger, measured

Rendered offline through the game's sound system at 48 kHz at the default mix, after the master chain. The game calls `setHealth` every frame; here it is called ten times a second. WAVs: `wav/danger/`.

## The heartbeat

| health | beats a minute | LUFS-M | peak dBFS | centroid Hz |
|---|---|---|---|---|
| 25 | 73.7 | -28.3 | -14.7 | 55 |
| 12 | 106.3 | -24.3 | -10.7 | 55 |
| 6 | 133.6 | -22.9 | -9.2 | 55 |

- Health fell under 30 at 0.5 s: the first beat sounds at 0.50 s. Healed to 60 at 24.5 s: the last beat is at 24.43 s, and 26-28 s reads - dBFS.
- WAV: `wav/danger/heartbeat-25-12-6-health.wav`.

## The world through the low-pass (a rifle 15 m off, five shots a second, with the heartbeat over it under 30)

| when | RMS dBFS (the thump of the heart included) | centroid Hz | presence (2-6 kHz) dBFS | air (> 6 kHz) dBFS |
|---|---|---|---|---|
| full health | -27.6 | 838 | -36.6 | -46.6 |
| 25 health | -25.7 | 587 | -35.1 | -53.2 |
| 6 health | -21.5 | 109 | -49.2 | -77.1 |
| healed: the first second | -23.6 | 335 | -36.3 | -49.2 |
| healed: 2-3 s on | -27.4 | 857 | -36.3 | -45.9 |
| healed: 4-6 s on | -27.2 | 828 | -36.2 | -46.5 |

- WAV: `wav/danger/world-lowpass-gunfire.wav`.

## Tinnitus

| blast | world before dBFS (< 2 kHz) | lowest | ducked by dB | back within 1 dB after s |
|---|---|---|---|---|
| full strength | -28.0 | -41.5 | 13.5 | 1.4 |
| strength 0.35 | -28.0 | -30.8 | 2.8 | 0.8 |

- The ringing alone at full strength: peak -22.3 dBFS, -22.9 LUFS-M, centroid 4377 Hz. Its 4150 Hz tone by quarter second (dBFS): -28, -28, -35, -41, -47, -53, -60, -66, -107, -, -, -: over -70 dBFS for 2.00 s.
- WAVs: `wav/danger/tinnitus-over-gunfire.wav`, `wav/danger/tinnitus-alone.wav`.

