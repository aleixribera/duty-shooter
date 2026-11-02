# Usage: source D.sh; D route '{json}'
D() { curl -s --max-time 600 localhost:7351/$1 -d "$2"; echo; }
NAME() { D eval "{\"name\":\"$1\",\"js\":\"(() => { const i = document.querySelector('input[aria-label=Name]'); i.value = '$2'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return i.value })()\"}"; }
ST() { D state "{\"name\":\"$1\"}"; }
RS() { curl -s 127.0.0.1:3201/royale/status | head -c 400; echo; }
EV() { grep -v '"bot":true' .scratch/battle-royale/bugs/events.jsonl | tail -${1:-6}; }
