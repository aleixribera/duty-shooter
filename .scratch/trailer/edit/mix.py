"""The trailer's sound: the score, the game's sound for each clip, and Range Control on the tannoy.

    python mix.py <edl.json> <score.wav> <sfx dir> <out mix.wav>

The EDL's "vo" list places controller lines ({"line": name, "at": s, "gain": dB, "duck": dB, default 6});
the score ducks under them, and the game's sound by half as much. Each clip's sound (rig/sfx.mjs, PRE s of lead-in) is laid at its cut with a short
fade in and a tail past the cut; slowed clips are muffled and washed. Loudness is set by
ffmpeg's loudnorm afterwards (two passes), to -14 LUFS and -1 dBTP.
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
PRE = 3.0
HERE = Path(__file__).resolve().parent
ASSETS = HERE.parents[2] / "packages/fps-client/src/audio/assets"


def read_wav(path):
    """Any WAV (16/24-bit int or 32-bit float), stereo float at SR (no resampling: all ours are SR)."""
    raw = Path(path).read_bytes()
    fmt_at = raw.index(b"fmt ")
    tag, ch, rate, _, _, bits = np.frombuffer(raw[fmt_at + 8: fmt_at + 24], dtype="<u2,<u2,<u4,<u4,<u2,<u2")[0]
    data_at = raw.index(b"data")
    n = int(np.frombuffer(raw[data_at + 4: data_at + 8], "<u4")[0])
    body = raw[data_at + 8: data_at + 8 + n]
    if tag == 3:
        x = np.frombuffer(body, "<f4").astype(np.float64)
    elif bits == 16:
        x = np.frombuffer(body, "<i2") / 32768.0
    elif bits == 24:
        b = np.frombuffer(body, np.uint8).reshape(-1, 3)
        x = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        x = np.where(x >= 1 << 23, x - (1 << 24), x) / float(1 << 23)
    else:
        raise ValueError(f"{path}: {bits}-bit")
    x = x.reshape(-1, ch)
    if ch == 1:
        x = np.repeat(x, 2, axis=1)
    assert rate == SR, f"{path} is {rate} Hz"
    return x


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 8388607).astype(np.int32)
    b = np.empty((pcm.shape[0], 2, 3), np.uint8)
    for k in range(3):
        b[:, :, k] = (pcm >> (8 * k)) & 0xFF
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b.tobytes())


def fft_filter(x, lo=None, hi=None, order=2):
    """Smooth Butterworth-shaped band limits, applied in the frequency domain (whole clip)."""
    n = x.shape[0]
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hi:
        g /= np.sqrt(1 + (f / hi) ** (2 * order))
    if lo:
        g /= np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], n, axis=0)


def convolve(x, ir):
    n = x.shape[0] + ir.shape[0]
    m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, m, axis=0) * np.fft.rfft(ir, m, axis=0), m, axis=0)[:n]


def hall(seconds=2.6, seed=3):
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    ir = rng.standard_normal((t.size, 2)) * np.exp(-t * 6.9 / seconds)[:, None]
    ir = fft_filter(ir, lo=120, hi=5000)
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def fade(x, a, b):
    """Linear fade in over a samples and out over b samples, in place."""
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None]
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def vo_lines():
    meta = json.loads((ASSETS / "controller.json").read_text())
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ASSETS / "controller.mp3"), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    mono = np.frombuffer(raw, "<f4").astype(np.float64)
    return {k: mono[int(v["start"] * SR): int((v["start"] + v["seconds"]) * SR)] for k, v in meta["lines"].items()}


def tannoy(line):
    """A controller line on a range PA: band-limited, driven, and thrown across open ground."""
    x = np.stack([line, line], axis=1)
    x = fft_filter(x, lo=280, hi=3800, order=3)
    x = np.tanh(x / (np.abs(x).max() + 1e-9) * 2.2) / np.tanh(2.2)
    out = np.zeros((x.shape[0] + int(1.6 * SR), 2))
    out[: x.shape[0]] += x
    # Two far horns answering: a slap at 95 ms and a softer one at 210 ms, a little off to each side.
    for delay, gain, pan in ((0.095, 0.32, (0.8, 0.45)), (0.21, 0.18, (0.4, 0.8))):
        d = int(delay * SR)
        out[d: d + x.shape[0], 0] += x[:, 0] * gain * pan[0]
        out[d: d + x.shape[0], 1] += x[:, 1] * gain * pan[1]
    wet = convolve(out, hall(1.8, 9))[: out.shape[0]]
    return out * 0.85 + wet * 0.22


def main():
    edl_path, score_path, sfx_dir, out_path = sys.argv[1:5]
    edl = json.loads(Path(edl_path).read_text())
    total = sum(e["dur"] for e in edl["cut"])
    N = int(total * SR) + SR * 3
    music = np.zeros((N, 2))
    fx = np.zeros((N, 2))
    voice = np.zeros((N, 2))

    score = read_wav(score_path) * edl.get("scoreGain", 1.0)
    music[: min(N, score.shape[0])] += score[: N]

    big = hall(2.8, 4)
    t = 0.0
    for i, e in enumerate(edl["cut"]):
        f = Path(sfx_dir) / f"seg-{i:03d}.wav"
        if e["type"] == "clip" and e.get("sfx", True) and f.exists():
            x = read_wav(f)
            a = int((PRE - 0.04) * SR)
            b = int((PRE + e["dur"] + e.get("tail", 0.3)) * SR)
            x = x[a:b].copy()
            fade(x, int(0.04 * SR), int(min(0.3, e.get("tail", 0.3)) * SR))
            gain = 10 ** (e.get("sfxGain", 0) / 20)
            if e.get("slow"):
                x = fft_filter(x, hi=900, order=2) * 1.6
                x = np.concatenate([x, np.zeros((big.shape[0], 2))])
                x = x * 0.5 + convolve(x, big)[: x.shape[0]] * 0.9
            at = int((t - 0.04) * SR)
            at0 = max(0, at)
            seg = x[at0 - at:]
            fx[at0: at0 + seg.shape[0]] += seg[: N - at0] * gain
        t += e["dur"]

    lines = vo_lines()
    duck = np.ones(N)
    for v in edl.get("vo", []):
        x = tannoy(lines[v["line"]]) * 10 ** (v.get("gain", 0) / 20) * 0.5
        at = int(v["at"] * SR)
        voice[at: at + x.shape[0]] += x[: N - at]
        speech = len(lines[v["line"]])
        lo, hi = at, min(N, at + speech + int(0.3 * SR))
        duck[lo:hi] = np.minimum(duck[lo:hi], 10 ** (-v.get("duck", 6) / 20))
    # Smooth the duck: 120 ms either way.
    k = int(0.12 * SR)
    duck = np.convolve(duck, np.ones(k) / k, mode="same")

    # The score takes the whole duck; the game's sound half of it (in dB), so a fight still reads under a line.
    bed = music * duck[:, None] * edl.get("musicGain", 1.0) + fx * np.sqrt(duck)[:, None] * edl.get("fxGain", 1.0)
    voice *= edl.get("voGain", 1.0)
    mixed = bed + voice
    # How far each line stands over everything else while it is spoken (a clear PA wants ~+6 dB or more).
    for v in edl.get("vo", []):
        a = int(v["at"] * SR)
        b = a + len(lines[v["line"]])
        db = 10 * np.log10(((voice[a:b] ** 2).mean() + 1e-12) / ((bed[a:b] ** 2).mean() + 1e-12))
        print(f"vo {v['line']:8s} {db:+.1f} dB over the bed")
    end = int(total * SR)
    mixed = mixed[:end]
    fade(mixed, 0, int(0.5 * SR))
    peak = np.abs(mixed).max()
    mixed *= 0.7 / peak
    tmp = Path(out_path).with_suffix(".pre.wav")
    write_wav(tmp, mixed)
    # Loudness: measure, lift to -14 LUFS, and catch the peaks the lift pushes past the ceiling with a
    # brickwall limiter (loudnorm's own linear mode gives up and pumps when the blast sets the peak).
    def measure(path):
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "loudnorm=I=-14:TP=-1:LRA=14:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
        blob = r.stderr[r.stderr.rindex("{"):]
        return json.loads(blob[: blob.index("}") + 1])
    m = measure(tmp)
    lift = -14 - float(m["input_i"])
    for _ in range(3):
        af = f"volume={lift:.2f}dB,alimiter=limit=0.84:attack=2:release=60:level=false:asc=true"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-af", af, "-ar", str(SR), "-c:a", "pcm_s24le", str(out_path)], check=True)
        done = measure(out_path)
        miss = -14 - float(done["input_i"])
        if abs(miss) < 0.3:
            break
        lift += miss  # the limiter took some loudness back: push again
    tmp.unlink()
    for name, x in (("music", music[:end]), ("fx", fx[:end]), ("voice", voice[:end])):
        rms = np.sqrt((x ** 2).mean()) + 1e-12
        print(f"{name}: rms {20 * np.log10(rms / peak * 0.7):.1f} dB pre-norm, peak {20 * np.log10(np.abs(x).max() / peak * 0.7 + 1e-12):.1f} dB")
    print(f"in {m['input_i']} LUFS, {m['input_tp']} dBTP; lift {lift:+.1f} dB -> {done['input_i']} LUFS, {done['input_tp']} dBTP -> {out_path}")


if __name__ == "__main__":
    main()
