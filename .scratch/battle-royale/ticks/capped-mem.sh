#!/bin/bash
# A whole Battle Royale with the server alone in a 512 MiB cgroup, as the live container's limit, swap off.
# The load test drives it from outside the scope. Port 4094; the scope is gone when the server stops.
cd ~/remote-tests/duty-shooter-61b75cd9 || exit 9
out=.scratch/battle-royale/ticks/mem-512.txt
systemd-run --user --scope --unit=t30-mem -p MemoryMax=512M -p MemorySwapMax=0 env PORT=4094 PASSPHRASE=load-test MODE=battle-royale STATIC_DIR=$PWD/apps/range/dist LOG_STATS=1 LOAD_TEST_SOCKETS=64 node apps/server/dist/main.js > $out.server 2>&1 &
until curl -sf http://127.0.0.1:4094/healthz >/dev/null; do sleep 0.5; done
cg=/sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/t30-mem.scope
[ -d $cg ] || cg=$(dirname $(find /sys/fs/cgroup/user.slice -maxdepth 6 -name t30-mem.scope 2>/dev/null | head -1)/x)
echo "cgroup $cg max $(cat $cg/memory.max)"
( while [ -d $cg ]; do echo "mem $(date +%s) $(cat $cg/memory.current 2>/dev/null) peak $(cat $cg/memory.peak 2>/dev/null) $(grep -E '^(oom|oom_kill) ' $cg/memory.events 2>/dev/null | tr '\n' ' ')"; sleep 10; done ) > $out.mem &
TARGET=http://127.0.0.1:4094 PASSPHRASE=load-test BOTS=29 SETTLE=25 node apps/server/scripts/load-test.mjs 2 560 > $out 2>&1
echo "load test exit $?"
tail -3 $out.mem; grep -E "^tick|^first|did not|ended" $out | cut -c1-160
grep -c "stats cpu" $out.server; grep "stats cpu" $out.server | tail -1 | cut -c1-140
pkill -f "PORT=4094" ; systemctl --user stop t30-mem.scope 2>/dev/null; sleep 1; systemctl --user status t30-mem.scope 2>&1 | head -2
