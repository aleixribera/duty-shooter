"""The trailer's score, composed in code on the game's own material: D minor at 60 beats a minute
(one beat a second, like the clock every match is), a theremin-like lead playing the menu theme's
motif, a low drone, the countdown's ostinato on D and its clock, brass hits ("braams"), drums,
a riser that stops dead, and the bomb.

    python score.py <cues.json> <out.wav>

cues.json gives the times (s) the score is built around: see CUES below for the keys.
Writes 48 kHz 24-bit stereo. Only numpy; nobody listens to this build, so it also prints
each section's level for checking.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
TAU = 2 * np.pi
rng = np.random.default_rng(7)

CUES = {
    "length": 70.0,
    "open": 0.0,  # the cold-open hit; drone under it
    "motif": 4.0,  # the lead's first phrase
    "hot": 20.0,  # the first gunshot: the drums come in
    "card2": 29.0,  # second card: a hit and a breath
    "slow": 35.0,  # the slow-motion beat: everything drops to a held chord
    "tminus": 38.0,  # "T minus sixty seconds": the siren's fifth, the clock
    "ten": 48.0,  # "Ten seconds": the riser
    "five": 53.0,  # five hits, one a beat
    "dead": 58.0,  # the riser stops dead
    "flash": 58.9,  # the bomb
    "title": 64.0,  # the title's hit
}


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def lp(x, cutoff):
    """One-pole low-pass; cutoff may be an array (per sample)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-TAU * c / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def lp_fast(x, cutoff, passes=2):
    """Fixed-cutoff low-pass by FFT (steep enough, and fast)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    h = 1 / (1 + (f / cutoff) ** (2 * passes))
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def hp_fast(x, cutoff, passes=2):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1e-6
    h = 1 / (1 + (cutoff / f) ** (2 * passes))
    return np.fft.irfft(np.fft.rfft(x) * h, n)


def saw(phase):
    return 2 * (phase / TAU % 1) - 1


def env_adsr(n, a, d, s, r, hold=None):
    """Attack, decay to sustain, hold, release (seconds) over n samples."""
    t = np.arange(n) / SR
    hold = (n / SR - a - d - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel0 = a + d + hold
    e = np.where(t >= rel0, s * np.exp(-(t - rel0) / max(r / 4, 1e-4)), e)
    return e


def place(bus, x, at, gain=1.0):
    i = int(at * SR)
    if i >= len(bus) or i + len(x) <= 0:
        return
    j0 = max(0, -i)
    i = max(0, i)
    n = min(len(x) - j0, len(bus) - i)
    bus[i : i + n] += x[j0 : j0 + n] * gain


def reverb(x, seconds=2.6, mix=0.3, pre=0.02, bright=4000):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / seconds)
    ir = lp_fast(ir, bright)
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt(np.sum(ir**2))
    m = len(x) + n
    size = 1 << (m - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix * 1.4


def soft(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


# --- instruments -------------------------------------------------------------------------------


def drone(seconds, root=26, cutoff=(180, 420)):
    """A low D: sine fundamental and a filtered saw an octave up, the filter breathing slowly."""
    t = t_axis(seconds)
    wow = 1 + 0.002 * np.sin(TAU * 0.25 * t) + 0.0008 * np.sin(TAU * 3.1 * t)
    f = hz(root) * wow
    ph = np.cumsum(TAU * f / SR)
    body = 0.7 * np.sin(ph) + 0.25 * np.sin(2 * ph)
    sw = saw(ph * 2) + 0.6 * saw(ph * 2 * 1.003) + 0.5 * saw(ph * 3.0)
    breathe = cutoff[0] + (cutoff[1] - cutoff[0]) * (0.5 + 0.5 * np.sin(TAU * t / 8 - np.pi / 2))
    sw = lp(sw * 0.35, breathe)
    return body * 0.5 + sw


def theremin(notes, seconds):
    """notes: [(start s, midi, length s)]. A sine with vibrato, gliding between notes, a little breath."""
    t = t_axis(seconds)
    pitch = np.full(len(t), np.nan)
    amp = np.zeros(len(t))
    for start, midi, length in notes:
        i0, i1 = int(start * SR), min(len(t), int((start + length) * SR))
        pitch[i0:i1] = midi
        n = i1 - i0
        a = env_adsr(n, 0.12, 0.3, 0.8, min(0.6, length * 0.5))
        amp[i0:i1] = np.maximum(amp[i0:i1], a)
    # glide: hold the last pitch through gaps, then smooth over ~90 ms
    last = notes[0][1]
    for i in range(len(pitch)):
        if np.isnan(pitch[i]):
            pitch[i] = last
        else:
            last = pitch[i]
    k = int(0.09 * SR)
    pitch = np.convolve(np.pad(pitch, (k, k), mode="edge"), np.ones(k) / k, mode="same")[k:-k]
    vib = 0.18 * np.sin(TAU * 5.4 * t) * np.clip((t % 4) / 1.2, 0, 1)
    f = 440 * 2 ** ((pitch + vib - 69) / 12)
    ph = np.cumsum(TAU * f / SR)
    tone = np.sin(ph) + 0.12 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = lp_fast(rng.standard_normal(len(t)), 2500) * 0.015
    return soft((tone + breath) * amp * 0.9, 1.3)


def braam(seconds=3.5, root=26, bright=1.0):
    """The brass hit: detuned saws on D, A and D, the filter opening hard and closing, driven."""
    t = t_axis(seconds)
    out = np.zeros(len(t))
    for midi, g in ((root, 1.0), (root + 7, 0.6), (root + 12, 0.7), (root + 19, 0.25)):
        for det in (-0.12, 0.0, 0.11):
            f = hz(midi + det)
            out += g * saw(TAU * f * t + rng.uniform(0, TAU))
    cut = 120 + 2400 * bright * np.exp(-t / 0.35) + 300 * np.exp(-t / 1.5)
    out = lp(out * 0.18, cut)
    e = env_adsr(len(t), 0.015, 0.4, 0.55, 1.6)
    return soft(out * e * 2.2, 1.8) * 0.8


def drum(pitch=55, seconds=1.4, punch=1.0):
    """A big low drum: a pitch-dropping sine with a noise skin."""
    t = t_axis(seconds)
    f = pitch * (1 + 1.6 * np.exp(-t / 0.03))
    body = np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / 0.35)
    skin = lp_fast(rng.standard_normal(len(t)), 1800) * np.exp(-t / 0.04) * 0.6 * punch
    return soft((body + skin) * 1.1, 1.5)


def tick(seconds=0.12, f=2200):
    """The clock: a woodblock-ish click."""
    t = t_axis(seconds)
    return (np.sin(TAU * f * t) * 0.6 + np.sin(TAU * f * 1.51 * t) * 0.3) * np.exp(-t / 0.012)


def pluck(midi, seconds=0.45):
    """The ostinato's note: a damped saw on D, low."""
    t = t_axis(seconds)
    f = hz(midi)
    x = saw(TAU * f * t) + saw(TAU * f * 1.005 * t)
    x = lp(x * 0.3, 200 + 1800 * np.exp(-t / 0.05))
    return x * np.exp(-t / 0.12)


def riser(seconds):
    """A Shepard-ish climb and a noise sweep that grow to the end and stop dead."""
    t = t_axis(seconds)
    k = t / seconds
    out = np.zeros(len(t))
    for octave in range(5):
        pos = (k * 1.5 + octave / 5) % 1
        f = 55 * 2 ** (pos * 5)
        w = np.sin(np.pi * pos) ** 2
        out += w * np.sin(np.cumsum(TAU * f / SR))
    noise = rng.standard_normal(len(t))
    sweep = lp(noise * 0.5, 300 + 7000 * k**2)
    return (out * 0.25 + sweep * 0.5) * (k**2.2)


def sub_drop(seconds=5.0, f0=70, f1=24):
    t = t_axis(seconds)
    f = f1 + (f0 - f1) * np.exp(-t / 0.6)
    return np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / 1.8)


def blast(seconds=7.0):
    """The bomb's own roar from the score's side: a noise wall low-passing down from bright to rumble."""
    t = t_axis(seconds)
    n = rng.standard_normal(len(t))
    cut = 90 + 6000 * np.exp(-t / 0.5)
    roar = lp(n, cut) * (1 - np.exp(-t / 0.01)) * np.exp(-t / 2.4)
    return soft(roar * 3.0, 2.0) * 0.6


# --- the arrangement ---------------------------------------------------------------------------


def compose(c):
    L = c["length"]
    n = int(L * SR)
    music = np.zeros(n)
    lead = np.zeros(n)
    hits = np.zeros(n)
    drums = np.zeros(n)

    # Act 1: a cold-open hit on the first frame, the drone already there under it; the low pulse on the beat.
    place(hits, braam(3.5, bright=0.9), c["open"], 1.1)
    place(drums, drum(40, 2.0), c["open"], 1.8)
    d = drone(c["hot"] + 1.0)
    fade = np.clip(t_axis(len(d) / SR) / 0.8, 0, 1) ** 2
    tail = np.clip((c["hot"] + 0.6 - t_axis(len(d) / SR)) / 0.6, 0, 1)
    place(music, d * fade * tail * 0.4, c["open"])
    for b in np.arange(c["open"] + 3, c["hot"] - 1, 1.0):
        place(drums, drum(42, 0.8, 0.2), b, 0.18)

    # The motif (the menu theme's lead): D E F E D | D C Bb ... ending on the leading note.
    m = c["motif"]
    phrase = [(0, 62, 1), (1, 64, 1), (2, 65, 2), (4, 64, 1), (5, 62, 2.6), (8, 62, 1), (9, 60, 1), (10, 58, 3.6), (14, 61, 2.4)]
    lead_notes = [(s, p, l) for s, p, l in phrase if m + s + l <= c["hot"] - 0.2]
    place(lead, theremin(lead_notes, c["hot"] - m), m, 0.2)

    # The range is hot: a braam and a drum on the first gunshot, then the drive.
    place(hits, braam(4.0), c["hot"], 0.75)
    place(drums, drum(48, 1.6), c["hot"], 1.0)
    # The ostinato on D in eighths (two a beat), the clock's tick on the beat, drums on a pattern.
    drive_end = c["slow"]
    for i, b in enumerate(np.arange(c["hot"] + 1.0, drive_end, 0.5)):
        accent = 1.0 if i % 2 == 0 else 0.6
        midi = 38 if (i % 8) not in (6, 7) else (41 if i % 16 < 8 else 36)
        place(music, pluck(midi), b, 0.65 * accent)
    for b in np.arange(c["hot"] + 1.0, drive_end, 1.0):
        place(drums, tick(), b, 0.18)
    pattern = [0, 0.75, 1.5, 2.0, 2.5, 3.25, 3.5]
    for bar in np.arange(c["hot"] + 1.0, drive_end - 0.1, 4.0):
        for p in pattern:
            if bar + p < drive_end:
                place(drums, drum(52 if p in (0, 2.0) else 64, 1.0, 0.8), bar + p, 1.1 if p in (0, 2.0) else 0.7)
    d2 = drone(drive_end - c["hot"], cutoff=(300, 900))
    place(music, d2 * 0.35, c["hot"])
    # The second card: a hit and half a breath.
    place(hits, braam(3.0, bright=0.8), c["card2"], 0.85)
    place(drums, drum(46, 1.6), c["card2"], 0.9)

    # The slow-motion beat: one held, filtered chord (Dm add9) and nothing else.
    ts = t_axis(c["tminus"] - c["slow"] + 0.8)
    chord = np.zeros(len(ts))
    for midi in (50, 57, 62, 64, 65):
        chord += np.sin(TAU * hz(midi) * ts + rng.uniform(0, TAU)) + 0.3 * saw(TAU * hz(midi) * 1.002 * ts)
    chord = lp(chord * 0.12, 900) * np.clip(ts / 0.4, 0, 1) * np.clip((len(ts) / SR - ts) / 0.8, 0, 1)
    place(music, chord, c["slow"], 0.6)
    place(hits, braam(4.0, bright=0.5), c["slow"], 0.5)

    # T minus sixty: the clock alone, louder, then everything back in, tighter; the siren's fifth in the lead.
    place(hits, braam(4.0, root=26, bright=1.1), c["tminus"], 0.8)
    place(drums, drum(46, 1.8), c["tminus"], 1.0)
    for b in np.arange(c["tminus"] + 1, c["dead"], 1.0):
        place(drums, tick(f=2600), b, 0.35)
    for i, b in enumerate(np.arange(c["tminus"] + 2.0, c["dead"], 0.25)):
        place(music, pluck(38 if (i // 8) % 2 == 0 else 39), b, 0.32 + 0.25 * (b - c["tminus"]) / (c["dead"] - c["tminus"]))
    for bar in np.arange(c["tminus"] + 2.0, c["five"] - 0.1, 2.0):
        for p in (0, 0.75, 1.0, 1.5):
            place(drums, drum(50 if p == 0 else 62, 1.0), bar + p, 0.8 if p == 0 else 0.5)
    siren_notes = [(c["tminus"] + 1.5, 57, 3.0), (c["tminus"] + 4.5, 64, 4.5)]
    place(lead, theremin([(s - c["tminus"] - 1.5, p, l) for s, p, l in siren_notes], 8.5), c["tminus"] + 1.5, 0.35)
    d3 = drone(c["dead"] - c["tminus"], root=26, cutoff=(400, 1600))
    place(music, d3 * np.linspace(0.25, 0.5, len(d3)), c["tminus"])

    # Ten seconds: the riser, to the stop.
    place(music, riser(c["dead"] - c["ten"]), c["ten"], 1.8)
    # Five, four, three, two, one: a hit on each, climbing.
    for i, b in enumerate(np.arange(c["five"], c["dead"], 1.0)):
        place(hits, braam(0.95, root=26 + [0, 1, 3, 5, 7][i], bright=0.9 + 0.1 * i), b, 0.9 + 0.1 * i)
        place(drums, drum(44, 1.0), b, 1.4)

    # Dead stop, then the bomb, then the title's hit.
    music[int(c["dead"] * SR) : int(c["flash"] * SR)] = 0
    lead[int(c["dead"] * SR) : int(c["flash"] * SR)] = 0
    drums[int(c["dead"] * SR) : int(c["flash"] * SR)] = 0
    hits[int((c["dead"] + 0.95) * SR) : int(c["flash"] * SR)] *= 0
    place(hits, blast(), c["flash"], 1.8)  # the loudest moment of the piece
    place(drums, sub_drop(6.0), c["flash"], 2.0)
    place(hits, braam(6.0, root=26, bright=1.2), c["title"], 1.0)
    place(drums, drum(40, 3.0), c["title"], 1.1)
    place(drums, sub_drop(5.0, 55, 22), c["title"], 0.8)
    # The motif's last two notes over the title, unresolved: D, then the leading note.
    place(lead, theremin([(1.0, 62, 1.6), (2.6, 61, 3.0)], 6.0), c["title"], 0.3)

    # Mix: the lead and music get the hall; drums less; hits a long one.
    mix = reverb(music, 2.2, 0.25) + reverb(lead, 3.2, 0.45) + reverb(hits, 3.8, 0.3, bright=2500) + reverb(drums, 1.6, 0.18)
    return mix


def stereo(mono):
    """A gentle width: the reverb-ish side from a short decorrelated copy."""
    d = int(0.011 * SR)
    side = np.concatenate([np.zeros(d), mono[:-d]]) - mono
    side = hp_fast(side, 300) * 0.25
    return np.stack([mono + side, mono - side], axis=1)


def write(path, x):
    x = x / max(1e-9, np.max(np.abs(x))) * 0.89
    pcm = np.clip(x * (2**23 - 1), -(2**23), 2**23 - 1).astype(np.int32)
    b = np.zeros((pcm.shape[0], pcm.shape[1], 3), dtype=np.uint8)
    for k in range(3):
        b[:, :, k] = (pcm >> (8 * k)) & 0xFF
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b.tobytes())


if __name__ == "__main__":
    cues = dict(CUES)
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        cues.update(json.load(open(sys.argv[1])))
    out = sys.argv[2] if len(sys.argv) > 2 else "score.wav"
    mono = compose(cues)
    st = stereo(mono)
    write(out, st)
    for name in ("open", "motif", "hot", "card2", "slow", "tminus", "ten", "five", "flash", "title"):
        a = int(cues[name] * SR)
        seg = mono[a : a + 2 * SR]
        rms = np.sqrt(np.mean(seg**2)) / np.max(np.abs(mono))
        print(f"{name:7s} {cues[name]:5.1f}s  rms {20 * np.log10(rms + 1e-9):6.1f} dBFS(rel)")
