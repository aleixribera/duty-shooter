#!/bin/bash
# Ticket 13: the container's memory with both processes, from a measuring copy of
# the released image beside the live one (port 3096, no memory limit, removed after).
# Usage on the home server: measure.sh start <tag> | watch <seconds> | stop
set -u
name=duty-measure
case "$1" in
  start)
    docker rm -f $name >/dev/null 2>&1
    docker run -d --name $name --init --read-only --cap-drop ALL --security-opt no-new-privileges:true \
      -e LOG_STATS=1 -p 127.0.0.1:3096:3000 ghcr.io/aleixribera/duty-shooter:$2 >/dev/null
    until curl -sf http://127.0.0.1:3096/healthz >/dev/null; do sleep 0.5; done
    curl -s http://127.0.0.1:3096/healthz; echo
    ;;
  watch)
    id=$(docker inspect -f '{{.Id}}' $name)
    cg=/sys/fs/cgroup/system.slice/docker-$id.scope
    end=$(( $(date +%s) + $2 ))
    while [ $(date +%s) -lt $end ]; do
      rss=$(docker top $name -o pid,rss,args 2>/dev/null | awk 'NR>1 && /node/ {printf "%s=%dMB ", ($0 ~ /server\/main/ ? $1 : $1), $2/1024}')
      echo "$(date +%T) current=$(( $(cat $cg/memory.current) / 1048576 ))MB peak=$(( $(cat $cg/memory.peak) / 1048576 ))MB anon=$(( $(grep '^anon ' $cg/memory.stat | cut -d' ' -f2) / 1048576 ))MB $rss"
      sleep 5
    done
    ;;
  stop)
    id=$(docker inspect -f '{{.Id}}' $name)
    echo "final peak $(( $(cat /sys/fs/cgroup/system.slice/docker-$id.scope/memory.peak) / 1048576 ))MB"
    docker logs $name 2>&1 | grep -E "stats|Battle Royale process" | tail -40 | cut -c1-140
    docker rm -f $name >/dev/null
    ;;
esac
