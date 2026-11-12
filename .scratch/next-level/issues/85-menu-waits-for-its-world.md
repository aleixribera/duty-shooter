# The menu waits for its world

Status: resolved

Release: v2.187.35

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12g.md`), its weakest point and first defect (01, x 776-1920): "the desktop main menu has no backdrop. Where review f's 01 showed the aerial of Survival Town, this frame is a flat near-black navy field ... The phone frame taken 0.8 s later (02) has the aerial, so the menu reveals before its world has drawn."

## Comments

**What it was.** Not a slow capture: the menu is built before the engine, so it shows at about 0.7 s, while the world behind it first draws only when the map's shaders have compiled (`Game.drawing`), about 4 s on this PC with a warm dev server and later on a weak machine or a cold one. For those seconds the menu was a list on nothing (`menu-still/before/`). Review f's 01 had simply been taken later in that window.

**The fix (decided without the owner).** The reviewer suggested holding the menu back until the world drew; that would make every player wait three seconds or more for a menu they can already use. Instead the world is there from the first paint as a picture:
- `apps/range/public/menu/survival-town.jpg` (1600x900, 145 KB, progressive) is the menu's aerial with every page element hidden, taken by `menu-still/still.mjs`. It is the body's background in `index.html`, behind the canvas, which is transparent until its first frame.
- The menu camera flies its path from where the world first drew, not from the page's clock, so the live world's first frame is the still's pose; the canvas fades in over it in half a second, which hides the lighting that arrives with the bake. Before, the fly-through's pose was wherever the clock had got to, so any still would have jumped.
- A page that starts on another map (`?map=`) drops the still. `duty.flyAt` (dev) holds the fly-through at a distance, for the next still if the path or the map's look changes.

Verified: the range typecheck; frames at 0.6 s, 3.9 s, 6.1 s and 10.7 s on desktop and at 0.7 s, live and 13 s on a phone (`menu-still/sheet.jpg`): the still at first paint, the same pose when the world takes over, then the flight; before (still blocked) the same moments are an empty dark field; a minimal Vite build with the page's `./` base writes `url(menu/survival-town.jpg)`, as the deployed page needs.

A second-opinion review found the still outliving its job: nothing removed it, so a map switch with a resize, a lost graphics device, or leaving the menu before the first frame (`?explore=switchyard`, the Bot Match setup on another map) could show Survival Town's aerial behind another map. It also sat on both `html` and `body` while `?map=` cleared only `body`. The still is now on `body` alone and goes when the fade ends, on any map switch and on device loss; checked again in the page (first paint 136 mean brightness on the right two-thirds against 18 in review g, the live world 132, the body's image `none` after the fade).
