"""The gameplay trailer's driving track: the same cut as edl.json, scored like an action trailer instead of with
the game's tension stems. D minor at 120 beats a minute, the beat grid laid on Range Control's countdown (five,
four, three, two, one fall on the downbeats of half-bars), so the counts and the hits land together.

    python drive.py <out.wav>

Built from the cinematic score's instruments (../audio/score.py) plus a kit and a bass. It ducks itself under
Range Control's lines. Writes 48 kHz 24-bit stereo, and prints each section's level for checking.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio"))
from score import SR, TAU, braam, drum, hz, lp, lp_fast, hp_fast, place, reverb, riser, saw, soft, stereo, sub_drop, t_axis, theremin, tick, write  # noqa: E402

rng = np.random.default_rng(11)

# The cut, in seconds of the timeline (edl.json's shot lengths added up).
CUT = {
    "yard": 2.6,  # the Switchyard slate
    "town": 13.8,
    "station": 19.7,
    "card": 23.1,  # "Every match is a weapons test."
    "finale": 25.0,  # the last minute
    "t10": 36.45,  # "Ten seconds"
    "five": 38.28,
    "walk": 40.7,  # the quiet walk on "two, one"
    "zero": 43.28,  # the match ends: the siren
    "blast": 45.6,  # the nuke
    "ends": 53.8,  # "The test ends the match."
    "title": 55.7,
    "end": 58.1,
    "length": 62.1,
}
BEAT = 0.5
PHASE = CUT["five"] % BEAT  # beats at PHASE + k * BEAT
# Range Control's lines (start, length, dB): the music ducks under them, less under the counts, which it hits with.
VO = [(0.25, 2.88, -6), (25.48, 4.25, -6), (36.45, 1.24, -5), (38.28, 0.81, -2.5), (39.28, 0.81, -2.5), (40.28, 0.75, -2.5), (41.28, 0.69, -2.5), (42.28, 0.69, -2.5)]


def beats(a, b, step=BEAT):
    """Grid times in [a, b)."""
    k0 = np.ceil((a - PHASE) / BEAT - 1e-9)
    t = PHASE + k0 * BEAT
    out = []
    while t < b - 1e-9:
        out.append(round(t, 6))
        t += step
    return out


# --- the kit and the bass -----------------------------------------------------------------------


def kick(seconds=0.45, punch=1.0):
    t = t_axis(seconds)
    f = 48 + 120 * np.exp(-t / 0.025)
    body = np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / 0.16)
    click = hp_fast(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.004) * 0.35 * punch
    return soft((body + click) * 1.3, 1.6)


def snare(seconds=0.35, bright=1.0):
    t = t_axis(seconds)
    tone = np.sin(TAU * 185 * t) * np.exp(-t / 0.05) * 0.7
    noise = hp_fast(lp_fast(rng.standard_normal(len(t)), 7000 * bright), 900) * np.exp(-t / 0.09)
    return soft(tone + noise * 0.9, 1.4)


def hat(open_=False):
    seconds = 0.25 if open_ else 0.06
    t = t_axis(seconds)
    n = hp_fast(rng.standard_normal(len(t)), 7500)
    return n * np.exp(-t / (0.07 if open_ else 0.012)) * 0.5


def tom(pitch=95):
    return drum(pitch, 0.6, 0.6) * 0.8


def bass(midi, seconds=0.24, bright=1.0):
    """A driven saw bass with a snapping filter."""
    t = t_axis(seconds)
    f = hz(midi)
    x = saw(TAU * f * t) + 0.7 * saw(TAU * f * 1.006 * t) + 0.6 * np.sin(TAU * f * 0.5 * t)
    x = lp(x * 0.35, 140 + 1500 * bright * np.exp(-t / 0.045))
    e = np.minimum(1, t / 0.003) * np.clip((seconds - t) / 0.03, 0, 1)
    return soft(x * e * 1.6, 1.8)


def arp_note(midi, seconds=0.12):
    t = t_axis(seconds)
    f = hz(midi)
    x = saw(TAU * f * t) + saw(TAU * f * 1.004 * t)
    x = lp(x * 0.25, 800 + 3000 * np.exp(-t / 0.03))
    return x * np.exp(-t / 0.07)


def swell(seconds):
    """A reversed cymbal: noise growing to the end."""
    t = t_axis(seconds)
    k = t / seconds
    return lp(hp_fast(rng.standard_normal(len(t)), 2000) * 0.4, 1500 + 9000 * k) * k**3


# --- the arrangement ----------------------------------------------------------------------------

ROOTS = [38, 38, 34, 36]  # a bar each (two seconds): D, D, Bb, C


def groove(bus, drums, a, b, *, density=1.0, bright=1.0, hats16=False, fill_at=None):
    """Kick, snare on two and four, hats, and the bass in eighths over [a, b)."""
    for i, t in enumerate(beats(a, b)):
        pos = i % 4  # beat in the bar
        bar = i // 4
        if fill_at is not None and t >= fill_at:
            continue
        place(drums, kick(), t, 1.0 if pos in (0, 2) else 0.0)
        if pos in (1, 3):
            place(drums, snare(), t, 0.85)
        if density > 0.6 and pos == 3:
            place(drums, kick(punch=0.6), t + 0.25, 0.7)  # the push into the next bar
        for h in ((0, 0.125, 0.25, 0.375) if hats16 else (0, 0.25)):
            place(drums, hat(open_=(h == 0.25 and pos == 3 and not hats16)), t + h, 0.35 if h == 0.25 else 0.22)
        root = ROOTS[bar % 4]
        for e, step in enumerate((0, 0.25)):
            midi = root + (12 if (e == 1 and pos == 3) else 0)
            place(bus, bass(midi, bright=bright), t + step, 0.55 * density)
    if fill_at is not None:
        # A snare roll in sixteenths to the stop, getting louder.
        ts = np.arange(fill_at, b - 0.01, BEAT / 4)
        for j, t in enumerate(ts):
            place(drums, snare(bright=1.2), t, 0.3 + 0.7 * j / max(1, len(ts) - 1))
        for t in beats(fill_at, b):
            place(drums, tom(80), t, 0.8)


def compose():
    c = CUT
    n = int(c["length"] * SR)
    music, lead, hits, drums, rise = (np.zeros(n) for _ in range(5))

    # Intro: the bass alone in eighths, its filter opening, hats coming up, a swell into the drop.
    first = beats(0, c["yard"])
    for j, t in enumerate(first):
        k = j / max(1, len(first) - 1)
        place(music, bass(38, bright=0.2 + 0.8 * k), t, 0.35 + 0.2 * k)
        place(music, bass(38, bright=0.2 + 0.8 * k), t + 0.25, 0.25 + 0.2 * k)
        place(drums, hat(), t + 0.25, 0.15 * k)
    drop = beats(c["yard"], c["yard"] + BEAT)[0]
    place(hits, swell(1.6), drop - 1.6, 0.6)

    # Act one: the drop on the slate, the groove, the arp joining at Survival Town, a fill into the card.
    place(hits, braam(3.0, bright=1.0), drop, 0.8)
    place(drums, drum(44, 1.6), drop, 1.2)
    fill = c["card"] - 0.85
    groove(music, drums, drop, c["card"], fill_at=fill)
    town = beats(c["town"], c["town"] + BEAT)[0]
    place(hits, braam(2.0, bright=0.7), town, 0.45)
    arp = [62, 65, 69, 74, 69, 65, 62, 65]
    for i, t in enumerate(np.arange(town, fill, BEAT / 2)):
        bar = int((t - drop) // (4 * BEAT))
        shift = ROOTS[bar % 4] - 38
        place(music, arp_note(arp[i % len(arp)] + shift), t, 0.22)

    # The card: one hit, exactly on the cut, and its tail; a swell into the last minute.
    music[int(c["card"] * SR) :] *= 0
    drums[int(c["card"] * SR) :] *= 0
    place(hits, braam(3.2, bright=1.1), c["card"], 1.0)
    place(drums, drum(40, 2.0), c["card"], 1.4)
    place(hits, swell(1.1), c["finale"] - 1.1, 0.5)

    # The last minute: in on the cut, under "T minus sixty" the clock and a tight sixteenth bass; the kit at
    # half strength until the line ends, then the full groove with sixteenth hats and the motif on top.
    place(hits, braam(2.5, bright=0.8), c["finale"], 0.7)
    place(drums, drum(46, 1.4), c["finale"], 1.0)
    vo_end = 25.48 + 4.25
    full = beats(vo_end, vo_end + BEAT)[0]
    for i, t in enumerate(beats(c["finale"], full)):
        place(drums, tick(f=2600), t, 0.3)
        place(drums, kick(), t, 0.8 if i % 2 == 0 else 0.0)
        for s in (0, 0.125, 0.25, 0.375):
            place(music, bass(38, seconds=0.11, bright=0.8), t + s, 0.5)
    place(hits, braam(2.5, bright=1.0), full, 0.6)
    groove(music, drums, full, c["t10"], density=1.2, bright=1.3, hats16=True)
    for t in beats(full, c["t10"]):
        place(drums, tick(f=2600), t, 0.18)
    # The menu theme's motif, as a lead over the groove: D E F E D | D C Bb ...
    phrase = [(0, 62, 0.5), (0.5, 64, 0.5), (1, 65, 1), (2, 64, 0.5), (2.5, 62, 1.3), (4, 62, 0.5), (4.5, 60, 0.5), (5, 58, 1.8)]
    room = c["t10"] - 0.2 - full
    place(lead, theremin([(s, p + 12, l) for s, p, l in phrase if s + l <= room], room), full, 0.16)

    # Ten seconds: the riser to the stop; the groove on through five, four, three with a hit on each count.
    place(rise, riser(c["zero"] - c["t10"]), c["t10"], 1.5)
    groove(music, drums, c["t10"], c["walk"], density=1.2, bright=1.5, hats16=True)
    for i, t in enumerate((38.28, 39.28, 40.28, 41.28, 42.28)):
        place(hits, braam(0.95, root=26 + [0, 1, 3, 5, 7][i], bright=0.8 + 0.1 * i), t, 0.7 + 0.1 * i)
        place(drums, drum(44, 1.0), t, 1.1)
    # The walk on "two, one": the kit drops out; the clock and the riser carry it to the stop.
    walk = int(c["walk"] * SR)
    zero = int(c["zero"] * SR)
    tail = np.clip(1 - np.arange(zero - walk) / (0.08 * SR), 0, 1)
    music[walk:zero] *= tail
    drums[walk:zero] *= tail
    for t in beats(c["walk"], c["zero"]):
        place(drums, tick(f=3000), t, 0.45)
    for t in (41.28, 42.28):
        place(drums, drum(44, 1.0), t, 1.1)

    # Dead stop on zero: the game's siren and the blast play alone; a low drone and a sub under the blast.
    for bus in (music, lead, drums, rise):
        bus[zero:] = 0
    hits[int((c["zero"] + 0.2) * SR) :] = 0
    place(drums, sub_drop(5.0), c["blast"], 1.2)
    ts = t_axis(c["title"] - c["blast"] - 0.5)
    hum = (np.sin(TAU * hz(26) * ts) + 0.4 * np.sin(TAU * hz(33) * ts)) * np.clip((ts - 1.5) / 3, 0, 1) * 0.25
    place(music, hum, c["blast"])

    # The title: the last hit, then one more on the end card, and the room.
    place(hits, braam(6.0, root=26, bright=1.2), c["title"], 1.0)
    place(drums, drum(40, 3.0), c["title"], 1.4)
    place(drums, sub_drop(4.0, 55, 22), c["title"], 0.8)
    place(hits, braam(4.0, root=26, bright=0.6), c["end"], 0.45)
    place(drums, drum(42, 2.0), c["end"], 0.8)

    mix = reverb(music, 1.4, 0.12) + reverb(lead, 2.6, 0.4) + reverb(hits, 3.4, 0.3, bright=2500) + reverb(drums, 1.0, 0.1) + reverb(rise, 1.2, 0.2)
    # Ducked under Range Control, with a 40 ms attack and 250 ms release.
    duck = np.ones(n)
    for a, length, db in VO:
        duck[int(a * SR) : int((a + length) * SR)] = 10 ** (db / 20)
    k_att, k_rel = np.exp(-1 / (0.04 * SR)), np.exp(-1 / (0.25 * SR))
    g = np.empty(n)
    s = 1.0
    for i in range(n):
        k = k_att if duck[i] < s else k_rel
        s = k * s + (1 - k) * duck[i]
        g[i] = s
    mix *= g
    # The end fades out over the end card.
    te = np.arange(n) / SR
    mix *= np.clip((c["length"] - te) / 2.5, 0, 1)
    return mix


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "drive.wav"
    mono = compose()
    write(out, stereo(mono))
    peak = np.max(np.abs(mono))
    for name in ("yard", "town", "card", "finale", "t10", "walk", "blast", "title"):
        a = int(CUT[name] * SR) + SR // 4
        seg = mono[a : a + 2 * SR]
        rms = np.sqrt(np.mean(seg**2)) / peak
        print(f"{name:8s} {CUT[name]:5.2f}s  rms {20 * np.log10(rms + 1e-9):6.1f} dBFS(rel)")
