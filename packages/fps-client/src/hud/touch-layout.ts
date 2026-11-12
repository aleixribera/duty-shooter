/**
 * The HUD while the touch controls are up (next-level ticket 23): the thumbs
 * own the lower corners, so nothing of the HUD stays under them. Health and
 * ammo stand as two small plates at the bottom middle, between the stick's
 * ground and the right thumb's cluster; the top row keeps clear of Pause, the
 * scoreboard and the map on the left and of Ping on the right; lines that
 * come and go (toast, hint, caption) stand over the plates, narrow enough to
 * miss both thumbs. Everything counts from the safe area.
 *
 * `html.ds-touch` is set by `touch/mode.ts` while the last input was a finger,
 * so a laptop with a touchscreen gets its corners back with the mouse.
 */
export const HUD_TOUCH_CSS = `
html.ds-touch .ds-health, html.ds-touch .ds-ammo { bottom: calc(var(--ds-safe-b) + 6px); min-width: 0; max-width: none; box-sizing: border-box; height: 60px; padding: 7px 12px 0; background: var(--ds-plate); text-shadow: none; }
html.ds-touch .ds-health { left: auto; right: calc(50% + 1px); width: 108px; }
html.ds-touch .ds-ammo { right: auto; left: 50%; width: 156px; text-align: left; }
html.ds-touch .ds-health .hp, html.ds-touch .ds-ammo .mag { font-size: var(--ds-type-heading); line-height: 1; margin-top: 3px; }
html.ds-touch .ds-ammo .res { font-size: var(--ds-type-small); margin-left: 4px; }
html.ds-touch .ds-ammo .gun { justify-content: flex-start; gap: 6px; margin: 0 0 3px; font-size: var(--ds-type-small); line-height: 1.2; white-space: nowrap; overflow: hidden; }
html.ds-touch .ds-ammo .nade { float: right; gap: 5px; margin: 0; font-size: var(--ds-type-body); vertical-align: 0; }
/* The plate's fixed 60 px keeps the counts at their own size here. */
html.ds-touch .ds-ammo .nade .ds-icon { width: 18px; height: 18px; stroke-width: 2; }
html.ds-touch .ds-health .bar, html.ds-touch .ds-ammo .bar { width: auto; margin: 6px 0 0; height: 4px; }
/* A narrow phone: the plates stand left of the right thumb's cluster instead of on the middle. */
@media (max-width: 740px) {
  html.ds-touch .ds-ammo { left: auto; right: calc(var(--ds-safe-r) + 244px); width: 132px; }
  html.ds-touch .ds-health { right: calc(var(--ds-safe-r) + 377px); width: 92px; }
}
/* The top row: the match bar up against the edge, the zones and the feed under it, the feed's newest three. */
html.ds-touch .ds-match { top: calc(var(--ds-safe-t) + 8px); }
html.ds-touch .ds-zones, html.ds-touch .ds-charge { top: calc(var(--ds-safe-t) + 66px); }
html.ds-touch .ds-feed { top: calc(var(--ds-safe-t) + 64px); right: calc(var(--ds-safe-r) + 12px); }
html.ds-touch .ds-feed div:nth-last-child(n+4) { display: none; }
html.ds-touch .ds-feed div { max-width: 46vw; box-sizing: border-box; white-space: nowrap; }
html.ds-touch .ds-feed div > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
html.ds-touch .ds-feed div > span.tail, html.ds-touch .ds-feed div > span.gun { flex: none; }
/* Beside the Pause column: the frame rate and ping, and under them what used to stand in the lower left. */
html.ds-touch .ds-hud .ds-stats { left: calc(var(--ds-safe-l) + 68px); top: calc(var(--ds-safe-t) + 14px); bottom: auto; }
html.ds-touch .ds-overlay { left: calc(var(--ds-safe-l) + 68px); top: calc(var(--ds-safe-t) + 44px); bottom: auto; padding: 6px 10px; }
html.ds-touch .ds-overlay canvas, html.ds-touch .ds-overlay .k.trace { display: none; }
html.ds-touch .ds-recap { left: calc(var(--ds-safe-l) + 68px); top: calc(var(--ds-safe-t) + 44px); bottom: auto; min-width: 0; max-width: 300px; padding: 8px 12px; }
/* Lines that come and go stand over the plates, between the thumbs. */
html.ds-touch .ds-toast, html.ds-touch .ds-hintline, html.ds-touch .ds-caption { top: auto; bottom: calc(var(--ds-safe-b) + 74px); width: max-content; max-width: min(380px, calc(100vw - 470px - var(--ds-safe-l) - var(--ds-safe-r))); padding: 6px 12px 6px 14px; font-size: var(--ds-type-body); white-space: normal; }
/* One slot, one speaker: while the announcer's caption is up, the hint and the toast (the same words, more often than not) wait. */
html.ds-touch:has(.ds-caption.on) .ds-hintline, html.ds-touch:has(.ds-caption.on) .ds-toast { visibility: hidden !important; }
/* The countdown's plate hangs under the match bar, clear of the crosshair. */
html.ds-touch .ds-round { top: calc(var(--ds-safe-t) + 70px); transform: translateX(-50%); padding: 6px 14px 8px; }
html.ds-touch .ds-round h2 { margin-top: 2px; } html.ds-touch .ds-round .goal { margin-top: 4px; }
html.ds-touch .ds-prompt { top: 58%; }
/* Score lines stand right of the crosshair, over the right thumb's cluster and under the feed: the middle below is the plates' and the prompt's. */
@media (max-width: 860px), (max-height: 520px) {
  html.ds-touch .ds-score { left: calc(50% + 56px); top: calc(50% - 30px); width: 150px; transform: none; text-align: left; }
  html.ds-touch .ds-score .medal, html.ds-touch .ds-score .total, html.ds-touch .ds-score .lines div { padding: 0 8px; background: linear-gradient(90deg, var(--ds-scrim-soft) 35%, transparent); }
  html.ds-touch .ds-score .medal { height: 26px; font-size: var(--ds-type-body); line-height: 26px; }
  html.ds-touch .ds-score .total { height: 22px; font-size: var(--ds-type-body); line-height: 22px; }
  html.ds-touch .ds-score .lines div { justify-content: flex-start; height: 20px; font-size: var(--ds-type-small); line-height: 20px; }
  html.ds-touch .ds-score .lines div:nth-child(n+3) { display: none; }
}
/* The scoreboard has the screen while it is open (the controls step aside), and a finger scrolls it. */
html.ds-touch .ds-board:not(.end) { top: calc(var(--ds-safe-t) + 8px); max-height: calc(100vh - 16px - var(--ds-safe-t) - var(--ds-safe-b)); width: min(920px, calc(100vw - 136px - var(--ds-safe-l) - var(--ds-safe-r))); }
/* The board has the top of the glass on touch: the match bar under it steps back rather than read through it. */
html.ds-touch .ds-hud.boarded .ds-match, html.ds-touch .ds-hud:has(.ds-board.end.held) .ds-match { visibility: hidden; }
/* Nothing of the world reads through the board or stands on it: it is the screen while it is open. */
html.ds-touch .ds-board { background: var(--ds-ink); }
html.ds-touch:has(.ds-hud.boarded) .ds-caption, html.ds-touch:has(.ds-board.end.held) .ds-caption, html.ds-touch:has(.ds-hud.boarded) .ds-allies, html.ds-touch:has(.ds-board.end.held) .ds-allies, html.ds-touch:has(.ds-hud.boarded) .ds-ping, html.ds-touch:has(.ds-board.end.held) .ds-ping, html.ds-touch:has(.ds-hud.boarded) .ds-hintline, html.ds-touch:has(.ds-board.end.held) .ds-hintline, html.ds-touch:has(.ds-hud.boarded) .ds-prompt, html.ds-touch:has(.ds-board.end.held) .ds-prompt { visibility: hidden !important; }
html.ds-touch .ds-board { overflow-y: auto; overscroll-behavior: contain; pointer-events: auto; touch-action: pan-y; scrollbar-width: thin; }
/* A vote is a tap. */
.ds-votes .key .tp { display: none; }
html.ds-touch .ds-votes .key .kb { display: none; }
html.ds-touch .ds-votes .key .tp { display: inline; }
html.ds-touch .ds-votes button { min-height: 56px; }
`;
