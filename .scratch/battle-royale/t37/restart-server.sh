# Restarts ticket 37's local game server on 3241 (its own port; never the live container).
cd /c/Users/Aleix/Documents/CLAUDE/duty-shooter
for pid in $(netstat -ano | grep LISTENING | grep ':3241 ' | awk '{print $5}' | sort -u); do taskkill //PID $pid //T //F > /dev/null; done
sleep 1
PORT=3241 HOST=127.0.0.1 STATIC_DIR=apps/range/dist EVENT_LOG=.scratch/battle-royale/t37/events.jsonl nohup node .scratch/battle-royale/t37/server-dist/main.js > .scratch/battle-royale/t37/server.log 2>&1 &
sleep 6
curl -s localhost:3241/healthz; echo
