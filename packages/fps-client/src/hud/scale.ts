/**
 * The HUD-scale setting (next-level ticket 22): the readouts at the corners
 * and edges drawn at 80 to 130% of their size, each from its own corner. What
 * marks a place in the world (the crosshair, markers, tags, pings, damage
 * numbers) is not scaled: it is sized to what it points at. Neither are the
 * full-screen panels (scoreboard, map, end of match), which already fill the
 * screen.
 *
 * Under 1000 px wide the HUD keeps the layout made for a phone, where every
 * plate is already as small as it reads and as large as fits.
 */
export const HUD_SCALE_LIMITS = [0.8, 1.3] as const;

export const HUD_SCALE_CSS = `
@media (min-width: 1001px) {
  .ds-health, .ds-ammo, .ds-feed, .ds-stats, .ds-match, .ds-zones, .ds-charge, .ds-action, .ds-prompt, .ds-overlay, .ds-recap, .ds-toast,
  .ds-score, .ds-spec, .ds-watch, .ds-br-top, .ds-brstack, .ds-caption { zoom: var(--ds-hud-scale, 1); }
}
`;
