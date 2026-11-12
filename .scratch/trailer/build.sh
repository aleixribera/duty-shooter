#!/bin/sh
# Builds the trailer from the rendered takes: score, the game's sound per clip, the mix, then the picture.
#   sh build.sh [--draft] [--no-sfx]   (the dev server must be up for the sound step)
set -e
cd "$(dirname "$0")"
python -c "import json; json.dump(json.load(open('edit/edl.json'))['cues'], open('edit/cues.json', 'w'))"
python audio/score.py edit/cues.json audio/score.wav
case " $* " in *" --no-sfx "*) ;; *) node rig/sfx.mjs edit/edl.json edit/sfx ;; esac
python edit/mix.py edit/edl.json audio/score.wav edit/sfx edit/mix.wav
case " $* " in
  *" --draft "*) python edit/assemble.py edit/edl.json out/trailer-draft.mp4 --draft ;;
  *) python edit/assemble.py edit/edl.json out/trailer.mp4 ;;
esac
