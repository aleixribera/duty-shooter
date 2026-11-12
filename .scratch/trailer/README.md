# Trailer

A 58 s cinematic trailer cut from the real game: frame-locked takes filmed through `Game.cinema`, the other
capture's director footage (`finale-town`, `cover-yard`, `b/cover-station`, from `apps/range/scripts/trailer`),
an original score, the game's own sound re-rendered offline per clip, and Range Control on a tannoy.

The cut lives in `edit/edl.json`: the cut list, the score's cues and the controller lines.

    sh build.sh            # score -> game sound per clip -> mix -> picture: out/trailer.mp4
    sh build.sh --draft    # half size, fast
    sh build.sh --no-sfx   # keep edit/sfx as it is
    sh edit/whatsapp.sh out/trailer.mp4 out/trailer-whatsapp.mp4   # a copy under 16 MB to send on WhatsApp

The sound step needs the dev server on :5173. Takes are filmed with
`node rig/rig.mjs shots/<file>.mjs [--take <name>]` (a file holds several takes; see `shots/st-static.mjs`) into `renders/`.
`edit/review.py` and `edit/review_src.py` make labelled contact sheets of a take or a capture, for choosing in-points.

Renders, caches, `edit/sfx`, `edit/mix.wav`, `audio/score.wav` and `out/` are build products and stay out of git.
