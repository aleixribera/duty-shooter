"""Runs a map's model generator in a Blender of its own (no shared session):

    blender -b --factory-startup --python tools/map/build.py -- tools/map/survival-town.py [--export] [--preview DIR] [--blend PATH]

Prints the generator's `result` as JSON on a line starting with RESULT.
With --preview, writes a Workbench sheet per asset into DIR.
"""
import json
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
script = argv[0]
export = "--export" in argv
preview = argv[argv.index("--preview") + 1] if "--preview" in argv else None
blend = argv[argv.index("--blend") + 1] if "--blend" in argv else None

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender", "scripts"))
import bkit  # noqa: E402

bkit.reset()
result = bkit.run(script, export=export)
if preview:
    os.makedirs(preview, exist_ok=True)
    assets = [o for o in bpy.data.objects if o.type == "MESH"]
    for a in assets:
        for o in assets:
            o.hide_render = o.hide_viewport = o is not a
        bkit.preview(os.path.join(preview, f"{a.name}.png"), [a], views=("three_quarter", "front", "side", "back"), size=640)
    for o in assets:
        o.hide_render = o.hide_viewport = False
if blend:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
print("RESULT " + json.dumps(result))
