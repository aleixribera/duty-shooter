#!/bin/sh
# Pass 33, final: taking turns (rtt occlusion pass kept) against three's TRAA in one page, then the benchmark page,
# GitHub Pages (before) and this pass's production build (after), alternated.
cd ~/duty-ab
python3 -m http.server 8471 --bind 127.0.0.1 -d ~/duty-dev33 >/dev/null 2>&1 &
S1=$!
python3 -m http.server 8473 --bind 127.0.0.1 -d ~/duty-prod33 >/dev/null 2>&1 &
S2=$!
trap "kill $S1 $S2 2>/dev/null" EXIT INT TERM
sleep 2
rm -f final.txt
for m in "survival-town&spot=cul-de-sac" "zero-island&spot=The%20Dustlands"; do
  echo "== turns-vs-old $m" >> final.txt
  PROBE="$(cat post-old.js)" PROBE_S=500 node ~/duty-bench.mjs "http://localhost:8471/?map=$m&stats&hz=1000" x.json >> final.txt 2>&1
done
M="?benchmark&run&maps=survival-town,zero-island"
node ~/duty-bench.mjs "https://aleixribera.github.io/duty-shooter/$M" bench-before.json > bench-before.log 2>&1
node ~/duty-bench.mjs "http://localhost:8473/$M" bench-after.json > bench-after.log 2>&1
