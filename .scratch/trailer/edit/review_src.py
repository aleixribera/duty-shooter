"""The other capture as a contact sheet: python review_src.py <src> <from s> <to s> [step 0.5] [cols 6]."""
import json
import subprocess
import sys
from pathlib import Path

src, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
step = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 6
root = Path(__file__).resolve().parent.parent / src
log = [s for s in json.loads((root / "sounds.json").read_text()) if s.get("event") == "gunshot"]
times = [a + i * step for i in range(int((b - a) / step) + 1)]
lab = []
for t in times:
    k = sum(1 for s in log if t - step / 2 <= s["t"] < t + step / 2)
    lab.append(f"{t:.1f}" + (f" shots {k}" if k else ""))
first = round(a * 60)  # JPG k at t = k/60
n = round(step * 60)
font = r"C\:/Windows/Fonts/consola.ttf"
draw = ",".join(rf"drawtext=fontfile='{font}':text='{l}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6:enable='eq(n\,{i})'" for i, l in enumerate(lab))
rows = -(-len(times) // cols)
vf = rf"select='not(mod(n\,{n}))',setpts=N/TB,crop=1920:804:0:138,scale=400:-1,{draw},tile={cols}x{rows}"
out = Path(__file__).resolve().parent / "cache" / f"{src.replace(chr(47), chr(95))}-{a:g}-{b:g}.jpg"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "60", "-start_number", str(first), "-i", str(root / "frames" / "%05d.jpg"), "-vf", vf, "-frames:v", str(1), str(out)], check=True)
print(out)
