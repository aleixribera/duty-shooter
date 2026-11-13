#!/bin/sh
# One-page A/B on the laptop: the temporal AA after (on) and before (off, the TEMP-TRAA-PROBE hook's old chain), pass 33.
cd ~/duty-ab
python3 -m http.server 8471 --bind 127.0.0.1 -d ~/duty-dev33 >/dev/null 2>&1 &
SRV=$!; trap "kill $SRV 2>/dev/null" EXIT INT TERM
sleep 2
rm -f traa.txt traa.done
for m in "zero-island&spot=The%20Dustlands"; do
  echo "== traa $m" >> traa.txt
  PROBE="$(cat post-old-24.js)" PROBE_S=500 node ~/duty-bench.mjs "http://localhost:8471/?map=$m&stats&hz=1000" x.json >> traa.txt 2>&1
done
echo done > traa.done
