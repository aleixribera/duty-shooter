#!/bin/bash
# A load run outside remote-test's slice: run on the home server over plain ssh, in the workspace remote-test synced and built.
# Usage: uncapped.sh <name> <clients> <seconds> [VAR=value...]. Port 4091, nothing left behind: the server is the load test's child.
cd ~/remote-tests/duty-shooter-61b75cd9 || exit 9
name=$1; clients=$2; seconds=$3; shift 3
mkdir -p .scratch/battle-royale/ticks
env CANARY=1 MODE=battle-royale STATIC_DIR=$PWD/apps/range/dist BOTS=29 PORT=4091 SETTLE=25 "$@" node apps/server/scripts/load-test.mjs "$clients" "$seconds" > .scratch/battle-royale/ticks/$name.txt 2>&1
code=$?
grep -E '^window|^tick|^first|^server:|^slow ticks|^  over|^canary|^download|^snapshots|^usercmd|rejected|did not|ended|^Only|Error' .scratch/battle-royale/ticks/$name.txt | cut -c1-260
echo "exit $code"
