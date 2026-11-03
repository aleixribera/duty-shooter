#!/bin/sh
cd /c/Users/Aleix/Documents/CLAUDE/duty-shooter
for run in "server 1 1" "server 3 0" "local 1 0" "local 3 0"; do
  set -- $run
  if [ "$3" = 1 ]; then R="REJOIN=1 "; else R=""; fi
  remote-test --local "SOURCE=$1 SQUADS=$2 ${R}node .scratch/battle-royale/t16/play.mjs" > .scratch/battle-royale/t16/logs/$1-s$2.log 2>&1
  echo "$1 s$2 exit $?" >> .scratch/battle-royale/t16/logs/all.txt
done
echo done >> .scratch/battle-royale/t16/logs/all.txt
