#!/bin/bash
# Battle Royale's own opening on the real server, after the server has settled, all bots starting at once when the countdown ends.
R=.scratch/battle-royale/results
L=apps/server/scripts/load-test.mjs
S=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup | sed 's|/[^/]*$||')/cpu.stat
stalled() { awk '/throttled_usec/ {print $2}' $S; }
npm run build -w @duty-shooter/server >/dev/null 2>&1
for spec in "br-2-people-58-bots 2 3991" "br-12-people-48-bots 12 3992" "br-60-people 60 3993"; do
  set -- $spec
  echo "=== $1"; before=$(stalled)
  env MODE=battle-royale STATIC_DIR=$PWD/apps/range/dist BOTS=29 PORT=$3 SETTLE=25 node $L $2 ${RUN:-42} 2>&1 | grep -v '^\[server\] {' > $R/$1.txt
  echo "cpu cap stalls: $(( ($(stalled) - before) / 1000 )) ms" >> $R/$1.txt
  grep -E '^window|^tick|^first|^server:|^download|^usercmd|rejected|did not|ended|^Only|Error|cpu cap' $R/$1.txt | cut -c1-150
done
