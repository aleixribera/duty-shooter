#!/bin/sh
# Pass 33, round 3: taking turns against copying (flag), then the fold alone (&copy) against the old chain.
cd ~/duty-ab
python3 -m http.server 8471 --bind 127.0.0.1 -d ~/duty-dev33 >/dev/null 2>&1 &
SRV=$!; trap "kill $SRV 2>/dev/null" EXIT INT TERM
sleep 2
rm -f traa3.txt
for m in "survival-town&spot=cul-de-sac" "zero-island&spot=The%20Dustlands"; do
  echo "== pingpong-vs-copy $m" >> traa3.txt
  PROBE="$(cat flag-pp.js)" PROBE_S=500 node ~/duty-bench.mjs "http://localhost:8471/?map=$m&stats&hz=1000" x.json >> traa3.txt 2>&1
  echo "== fold-only-vs-old $m" >> traa3.txt
  PROBE="$(cat post-old.js)" PROBE_S=500 node ~/duty-bench.mjs "http://localhost:8471/?map=$m&stats&hz=1000&copy" x.json >> traa3.txt 2>&1
done
