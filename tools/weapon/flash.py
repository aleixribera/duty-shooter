"""The flash tactical (ticket 20): see canister.py.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/flash.py
It writes packages/fps-client/src/viewmodel/assets/flash.glb and tools/weapon/flash.blend.
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import canister  # noqa: E402

importlib.reload(canister)

result = canister.build("flash", canister.flash, draft=globals().get("ARGS", {}).get("draft", False))
