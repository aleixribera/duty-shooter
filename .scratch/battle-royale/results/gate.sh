#!/bin/bash
# The 60-seat gate: every run a warmed server of its own on port 3991 and up, from this machine. Run through remote-test.
R=.scratch/battle-royale/results
L=apps/server/scripts/load-test.mjs
S=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup | sed 's|/[^/]*$||')/cpu.stat
stalled() { awk '/throttled_usec/ {print $2}' $S; }
run() {
  name=$1; shift; echo "=== $name"; before=$(stalled)
  env "$@" 2>&1 | grep -v '^\[server\] {' > $R/$name.txt
  echo "cpu cap stalls during the run: $(( ($(stalled) - before) / 1000 )) ms" >> $R/$name.txt
  grep -E '^tick|^first|^server:|^download|snapshots per|^usercmd|rejected|did not|ended|^Only|cpu cap' $R/$name.txt | cut -c1-190
}
npm run build -w @duty-shooter/server >/dev/null
if [ "$1" = 1 ]; then
run a-2-people-58-bots-survival-town NET=wide MODE=ffa BOTS=29 PORT=3991 node $L 2 92
run b-12-people-48-bots-survival-town NET=wide MODE=ffa BOTS=24 PORT=3992 node $L 12 92
run c-30-people-30-bots-survival-town NET=wide MODE=ffa BOTS=15 PORT=3993 node $L 30 62
else
run d-60-people-survival-town NET=wide MODE=ffa BOTS=0 PORT=3994 node $L 60 62
run e-60-people-no-compression NET=wide MODE=ffa BOTS=0 DEFLATE=0 PORT=3995 node $L 60 62
run f-2-people-58-bots-switchyard NET=wide MODE=ffa MAP=switchyard BOTS=29 PORT=3996 node $L 2 62
echo '=== Play Online stand-in, alone'
run g-play-online-12-alone MODE=tdm PORT=3997 node $L 12 42
echo '=== Play Online stand-in, beside a 60-seat match'
env NET=wide MODE=ffa BOTS=29 PORT=3991 node $L 2 72 2>&1 | grep -v '^\[server\] {' > $R/h-sixty-seats-beside-play-online.txt &
sleep 25
run h-play-online-12-beside-sixty MODE=tdm PORT=3997 node $L 12 42
wait
grep -E '^tick|^server:' $R/h-sixty-seats-beside-play-online.txt
fi
