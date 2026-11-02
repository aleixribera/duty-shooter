#!/bin/bash
# Serves the dev build, shoots the crawl and Revive columns of the soldier sheet, stops the server.
cd /c/Users/Aleix/Documents/CLAUDE/duty-shooter
(cd apps/range && exec npx vite --port 5191 --strictPort > /tmp/vite-sheet.log 2>&1) &
V=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:5191/ && break; sleep 1; done
for t in ${TIMES:-0.9}; do
  VIEWS=${VIEWS:-front,side} ROWS=1 COLS=9,10,11 node apps/range/scripts/soldier-sheet.mjs .scratch/battle-royale/downed/sheet$t http://localhost:5191/ $t m4a1
done
taskkill //F //T //PID $(netstat -ano | grep ':5191' | grep LISTENING | awk '{print $5}' | head -1) > /dev/null 2>&1
kill $V 2>/dev/null
exit 0
