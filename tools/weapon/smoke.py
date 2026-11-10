"""The smoke tactical (ticket 20): see canister.py.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/smoke.py
It writes packages/fps-client/src/viewmodel/assets/smoke.glb and tools/weapon/smoke.blend.
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import canister  # noqa: E402

importlib.reload(canister)

result = canister.build("smoke", canister.smoke, draft=globals().get("ARGS", {}).get("draft", False))
