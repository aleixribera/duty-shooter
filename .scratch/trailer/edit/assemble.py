"""Cuts the trailer from the rendered takes, the cards and the mixed sound.

    python assemble.py <edl.json> <out.mp4> [--draft]

Each take in renders/<take>/ holds f<frame>_<sub>.png captures inside each 24 fps frame's shutter;
they are blended into one frame (motion blur), graded, trimmed, cut together, letterboxed to
1920x1080 with a film grain, and muxed with the mix (mix.wav beside the EDL, if there is one).
--draft: half size and fast, for checking the cut.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDERS = HERE.parent / "renders"
CACHE = HERE / "cache"
FF = "ffmpeg"
FPS = 24

# Grades: one per look. Kept gentle; the game's own picture carries most of it.
GRADES = {
    # 1950s morning: faded, warm highlights, lifted blacks
    "town": "eq=contrast=1.06:saturation=0.78:gamma=0.97,colorbalance=rs=0.02:bs=-0.03:rm=0.02:bm=-0.02:rh=0.04:bh=-0.05,curves=all='0/0.035 0.5/0.49 1/0.97'",
    # the fight in daylight: harder, a little cold in the shadows
    "fight": "eq=contrast=1.14:saturation=0.9:gamma=0.96,colorbalance=rs=-0.02:bs=0.04:rh=0.04:bh=-0.04,curves=all='0/0.02 0.5/0.48 1/0.98'",
    # Switchyard at dusk: deep, warm lamps, blue shadow
    "dusk": "eq=contrast=1.1:saturation=0.95:gamma=0.95,colorbalance=rs=-0.02:bs=0.05:rh=0.05:bh=-0.03,curves=all='0/0.015 0.5/0.47 1/0.98'",
    # Station Nine into the sun: bleached
    "sun": "eq=contrast=1.12:saturation=0.8:gamma=0.98,colorbalance=rh=0.03:bh=-0.04,curves=all='0/0.03 0.5/0.5 1/0.97'",
    "none": "null",
}


def run(args):
    r = subprocess.run([FF, "-v", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-2000:])


def blended(take):
    """renders/<take> -> cache/<take>.mp4: the shutter's captures blended, 24 fps, near lossless."""
    src = RENDERS / take
    meta = json.loads((src / "shot.json").read_text())
    out = CACHE / f"{take}.mp4"
    stamp = (src / "shot.json").stat().st_mtime
    if out.exists() and out.stat().st_mtime > stamp:
        return out, meta
    shutter = meta["shutter"]
    seq = CACHE / f"{take}-seq"
    seq.mkdir(parents=True, exist_ok=True)
    for old in seq.iterdir():
        old.unlink()
    n = 0
    for f in range(meta["frames"]):
        for s in range(shutter):
            p = src / f"f{f:05d}_{s}.png"
            os.link(p, seq / f"{n:06d}.png")
            n += 1
    vf = f"tmix=frames={shutter},select='eq(mod(n\\,{shutter})\\,{shutter - 1})',setpts=N/{FPS}/TB" if shutter > 1 else f"setpts=N/{FPS}/TB"
    run(["-framerate", str(FPS * shutter), "-i", str(seq / "%06d.png"), "-vf", vf, "-r", str(FPS), "-c:v", "libx264", "-crf", "8", "-preset", "medium", "-pix_fmt", "yuv444p", str(out)])
    for old in seq.iterdir():
        old.unlink()
    seq.rmdir()
    return out, meta


def segment(i, e, draft):
    """One EDL entry -> cache/seg-<i>.mp4 at 1920x804 (960x402 draft), exactly its frames."""
    frames = round(e["dur"] * FPS)
    out = CACHE / f"seg-{i:03d}.mp4"
    size = "960:402" if draft else "1920:804"
    enc = ["-c:v", "libx264", "-crf", "16" if draft else "10", "-preset", "veryfast" if draft else "medium", "-pix_fmt", "yuv444p", "-r", str(FPS), "-frames:v", str(frames)]
    fade = []
    if e.get("fadeIn"):
        fade.append(f"fade=t=in:st=0:d={e['fadeIn']}")
    if e.get("fadeOut"):
        fade.append(f"fade=t=out:st={e['dur'] - e['fadeOut']}:d={e['fadeOut']}")
    if e.get("whiteOut"):
        fade.append(f"fade=t=out:st={e['dur'] - e['whiteOut']}:d={e['whiteOut']}:color=white")
    # A bomb's light and its blast on the camera: "flash": {"at": s, "decay": s} lifts the picture to white
    # and lets it fall back; "shake": {"at": s, "px": amplitude, "decay": s} rattles the frame, dying away.
    post = []
    if e.get("flash"):
        f = e["flash"]
        post.append(f"eq=brightness='if(gte(t,{f['at']}),0.85*exp(-(t-{f['at']})/{f.get('decay', 0.5)}),0)':eval=frame")
    if e.get("shake"):
        k = e["shake"]
        env = f"if(gte(t,{k['at']}),exp(-(t-{k['at']})/{k.get('decay', 0.6)}),0)"
        p = k.get("px", 14)
        post.append(f"crop=iw-{2 * p}:ih-{2 * p}:x='{p}+{p}*{env}*sin(t*71)*cos(t*23)':y='{p}+{p}*{env}*sin(t*53+1)'")
    if e["type"] == "clip" and e.get("src"):
        # The other capture's 60 fps 16:9 JPGs (JPG k at t = k/60, the clock its sounds.json keeps),
        # every 2.5th taken for 24 fps, cropped to 2.39:1.
        start = round(e["in"] * 60)
        grade = GRADES[e.get("grade", "none")]
        y = round((1080 - 804) * e.get("cropY", 0.5))
        speed = e.get("speed", 1)
        # No blend: soldiers move ~20 px between 60 fps frames, so averaging two leaves ghost copies, not blur.
        # Slowed, the frames play slower (0.4 shows each one once at 24 fps).
        motion = ["fps=24"]
        vf = ",".join([*motion, f"crop=1920:804:0:{y}", grade, *post, f"scale={size}:flags=lanczos", *fade])
        run(["-framerate", f"{60 * speed:g}", "-start_number", str(start), "-i", str(RENDERS.parent / e["src"] / "frames" / "%05d.jpg"), "-vf", vf, *enc, str(out)])
    elif e["type"] == "clip":
        clip, meta = blended(e["take"])
        grade = GRADES[e.get("grade", "none")]
        vf = ",".join([f"trim=start_frame={round(e.get('in', 0) * FPS)}", "setpts=PTS-STARTPTS", grade, *post, f"scale={size}:flags=lanczos", *fade])
        run(["-i", str(clip), "-vf", vf, *enc, str(out)])
    elif e["type"] == "card":
        vf = ",".join([f"scale={size}:flags=lanczos", *fade])
        run(["-loop", "1", "-framerate", str(FPS), "-i", str(HERE / "cards" / e["card"]), "-vf", vf, *enc, str(out)])
    else:  # black or white
        colour = "white" if e["type"] == "white" else "black"
        vf = ",".join(["null", *fade])
        run(["-f", "lavfi", "-i", f"color=c={colour}:s={size.replace(':', 'x')}:r={FPS}", "-vf", vf, *enc, str(out)])
    # A segment that runs out of source comes out short and would slide every later cut off its sound.
    got = int(subprocess.run(["ffprobe", "-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout.strip().strip(",") or 0)
    if got != frames:
        raise RuntimeError(f"segment {i} ({e.get('take') or e.get('src') or e['type']}): {got} frames, the cut wants {frames}")
    return out


def main():
    edl_path = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    draft = "--draft" in sys.argv
    CACHE.mkdir(exist_ok=True)
    edl = json.loads(edl_path.read_text())
    segs = [segment(i, e, draft) for i, e in enumerate(edl["cut"])]
    listing = CACHE / "concat.txt"
    listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in segs))
    w, h = (960, 540) if draft else (1920, 1080)
    pic = 402 if draft else 804
    finish = f"pad={w}:{h}:0:{(h - pic) // 2}:black,noise=c0s={3 if draft else 7}:c0f=t+u,vignette=angle=PI/6:mode=forward,format=yuv420p"
    mix = edl_path.parent / "mix.wav"
    audio = ["-i", str(mix)] if mix.exists() else []
    amap = ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k", "-shortest"] if audio else []
    run(["-f", "concat", "-safe", "0", "-i", str(listing), *audio, "-vf", finish, *amap, "-c:v", "libx264", "-crf", "23" if draft else "18", "-preset", "veryfast" if draft else "slow", "-tune", "film", "-movflags", "+faststart", str(out)])
    total = sum(e["dur"] for e in edl["cut"])
    print(f"{out} {total:.2f} s, {len(segs)} segments")


if __name__ == "__main__":
    main()
