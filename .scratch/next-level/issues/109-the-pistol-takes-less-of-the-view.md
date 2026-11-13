# The pistol takes less of the view

Status: resolved
Release: v2.197.1

Spec: `../spec.md` (objective 4, every weapon feels good, scopes and sights first)

Aleix (2026-11-13, after v2.196.0): "The pistol's gun model, especially the sight, was not very good, it takes a lot of vision from the screen."

Acceptance: before/after frames of the Warden 9 at hip and aimed in the Practice Range, desktop and phone, with the share of the view the gun and hands cover (looking at open sky, HUD hidden) and the width of the rear sight; the sight picture shows the front post in the notch with light either side.

## Comments

**2026-11-13, loop pass 26 (pass 1).**

What well-loved shooters do (15 minutes, a default): they push a handgun's sight plane out toward arm's length so the irons and slide sit small under the aim point (Rogue Point's "ADS 2.0" pushed the ADS focal plane back for exactly this, https://roguepoint.featurebase.app/p/ads-20), keep the hip gun low and right of the crosshair (CS2's offset viewmodel, Titanfall 2's lowered-viewmodel mods), and cut a notch clearly wider than the front post so light shows each side of it.

Done:
- Aimed, the Warden 9 sits 0.46 m from the eye (was 0.34 m), so its rear sight, slide and hands shrink by a quarter.
- At hip it sits lower, further right and further out ([0.115, -0.14, -0.45], was [0.1, -0.12, -0.4]).
- The model (`tools/weapon/pistol.py`, rebuilt): rear sight 19 mm wide (was 20.5), notch 5 mm wide and 3.4 mm deep (was 3.4 mm, as wide as the post, so the post filled it), front post 2.8 mm (was 3.4) with a smaller fibre dot.
- The Marshal .357 shares the Warden's framing (same hip and eye relief) and takes both framing changes; its sights are request 6's.

Measured (`look.mjs`, `before/` and `after/`, `result-*.json`; dark pixels against open sky):
- Rear sight width aimed, 1920x1080: 75 px → 51 px. Width of gun and hands a quarter of the screen below the aim point: 289 → 250 px, a third below: 330 → 262 px.
- Share of the view covered, 1920: hip 4.1 % → 3.5 %, aimed 8.2 % → 7.6 % (the forearms now show at the bottom edge, as the gun is held further out). 844x390: hip 3.4 → 2.9 %, aimed 6.8 → 6.3 %. The M4A1 aimed covers 10.2 %.
- Hip: the gun's top went from 64 % to 66 % down the screen.

Sheets: `../pistol-sights/sheet.jpg` (hip and aimed, before | after), `notch-pair.png` (the sight picture, 4x), `revolver-pair.jpg`.
