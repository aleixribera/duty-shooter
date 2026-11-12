"""A take as a contact sheet for choosing cuts: a frame every `step` s with its time, and how many
gunshots the take logged within that step (shots: n).

    python review.py <take> [step=0.5] [cols=5]   -> cache/<take>-review.jpg
"""
import json
import subprocess
import sys

import assemble

take = sys.argv[1]
step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
clip, meta = assemble.blended(take)
n = round(step * 24)
frames = meta["frames"] // n
rows = -(-frames // cols)
shots = [s["t"] - meta["from"] for s in meta["sounds"] if s["event"] == "gunshot"]
font = r"C\:/Windows/Fonts/consola.ttf"
labels = []
for i in range(frames):
    t = i * step
    k = sum(1 for s in shots if t - step / 2 <= s < t + step / 2)
    labels.append(f"{t:.2f}s" + (f"  shots {k}" if k else ""))
draw = ",".join(rf"drawtext=fontfile='{font}':text='{l}':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.6:enable='eq(n\,{i})'" for i, l in enumerate(labels))
vf = rf"select='not(mod(n\,{n}))',setpts=N/TB,scale=480:-1,{draw},tile={cols}x{rows}"
out = assemble.CACHE / f"{take}-review.jpg"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-vf", vf, "-frames:v", "1", "-q:v", "4", str(out)], check=True)
print(out, f"{len(shots)} gunshots")
