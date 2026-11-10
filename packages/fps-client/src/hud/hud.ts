import { STATS, heldRow, type ChargeState, type MatchStatus, type ModeId, type PlayerOutput, type RoundReason, type Score } from '@duty-shooter/fps-core';
import { ALLY_TAGS_CSS, AllyTagsView, type AllyTag } from './ally-tags';
import { SPECTATOR_PANEL_CSS, SpectatorPanel, type SpectatorPanelState } from './spectator-panel';
import { MATCH_CARD_CSS, MatchCardView, type MatchCardState } from './match-card';
import { MATCH_GAIN_CSS, matchGainHtml } from './match-gain';
import { SCORE_FEED_CSS, ScoreFeed, type ScoreFeedEntry } from './score-feed';
import { MATCH_CLOCK_CSS, MatchClockView, matchClockHtml } from './match-clock';
import { GRENADE_WARNINGS_CSS, GrenadeWarningsView, type GrenadeWarning } from './grenade-warnings';
import { HUD_TOUCH_CSS } from './touch-layout';
import { HINT_LINE_CSS, hintLineHtml } from './hint-line';
import type { HintLine } from '../hints';
import { figure, medalName, type MatchGain } from '../profile/model';
import { RECAP_CSS, recapHtml, type Recap } from '../ui/recap';
import { END_REASONS, MODE_NAMES, TEAMS, endSummary, goalLine, matchBar, mvpOf, ordinal, scoreboard, type BoardRow, type RosterCard } from '../ui/model';
import { escapeHtml as escape, icon, installTheme } from '../ui/theme';
import { placement, type VictoryCard } from '../ui/royale';
import { RoyaleHud, type IslandMapSource, type RoyaleHudState } from './royale-hud';
import { PingMarks, type PingScreenMark } from './ping-marks';
import { CAPTIONS_CSS, CaptionView } from './captions';
import { CrosshairView, type CrosshairOptions } from './crosshair';
import { HUD_SCALE_CSS, HUD_SCALE_LIMITS } from './scale';
import { colourVision, teamColours } from '../team-colours';
import type { PingKind } from '@duty-shooter/fps-core';

const CSS = `
.ds-hud { position: fixed; inset: 0; pointer-events: none; font: 400 var(--ds-type-body)/1.2 var(--ds-font); color: var(--ds-text); font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px var(--ds-shadow); user-select: none; z-index: 5; }
.ds-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
.ds-hit i { position: absolute; width: 11px; height: 2.4px; background: var(--ds-reticle); left: -5.5px; top: -1.2px; box-shadow: 0 0 2px var(--ds-shadow); }
.ds-hit.kill i { background: var(--ds-alert); }
.ds-hit.head i { width: 15px; left: -7.5px; height: 3px; }
.ds-hit.shielded i { width: 6px; left: -3px; height: 1.6px; top: -0.8px; background: var(--ds-text-2); }
.ds-dmg { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.ds-dmg div { position: absolute; left: -70px; top: -230px; width: 140px; height: 40px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; border-top: 6px solid color-mix(in srgb, var(--ds-alert) 85%, transparent); filter: blur(0.6px); transform-origin: 70px 230px; }
.ds-blind { position: absolute; inset: 0; background: var(--ds-text); opacity: 0; }
.ds-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, var(--ds-blood) 100%); opacity: 0; }
/* A plate is one flat surface over the world: no outline, no rounding. */
.ds-plate { background: var(--ds-plate); border: 0; border-radius: 0; text-shadow: none; }
.ds-ammo { position: absolute; right: 0; bottom: 0; min-width: 300px; padding: 0 calc(var(--ds-gutter) + var(--ds-safe-r)) calc(26px + var(--ds-safe-b)) 60px; text-align: right; background: linear-gradient(0deg, var(--ds-scrim-soft), var(--ds-scrim-thin) 70%, transparent); }
.ds-ammo .mag { font-size: var(--ds-type-display); font-weight: 700; line-height: 0.9; letter-spacing: 0.01em; }
.ds-ammo .mag.low { color: var(--ds-alert); }
.ds-ammo .res { font-size: var(--ds-type-heading); color: var(--ds-text-2); margin-left: 8px; }
.ds-ammo .res.low { color: var(--ds-alert); }
.ds-ammo .gun { display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; margin-bottom: 4px; font-size: var(--ds-type-body); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-ammo .gun small { font-size: var(--ds-type-small); font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--ds-text); }
.ds-ammo .nade { display: inline-flex; align-items: center; gap: 5px; margin-right: 18px; font-size: var(--ds-type-body); font-weight: 700; color: var(--ds-text); vertical-align: 10px; }
.ds-ammo .nade .ds-icon { width: 18px; height: 18px; stroke-width: 2; }
.ds-ammo .nade.none { color: var(--ds-text-3); opacity: 0.45; }
.ds-ammo .nade.cook { color: var(--ds-alert); }
.ds-ammo .nade.tac.cook { color: var(--ds-signal); }
.ds-scope { position: absolute; inset: 0; display: none; background: radial-gradient(circle at center, transparent 0, transparent 38vmin, var(--ds-shadow) 38.3vmin, var(--ds-black) 39vmin); }
.ds-scope i { position: absolute; background: var(--ds-black); }
.ds-scope i.h { left: calc(50% - 38vmin); right: calc(50% - 38vmin); top: calc(50% - 1px); height: 2px; }
.ds-scope i.v { top: calc(50% - 38vmin); bottom: calc(50% - 38vmin); left: calc(50% - 1px); width: 2px; }
.ds-scope i.h.thick { left: calc(50% - 38vmin); right: calc(50% + 8vmin); height: 5px; top: calc(50% - 2.5px); }
.ds-scope i.h.thick.r { left: calc(50% + 8vmin); right: calc(50% - 38vmin); }
.ds-scope i.v.thick { top: calc(50% + 8vmin); bottom: calc(50% - 38vmin); width: 5px; left: calc(50% - 2.5px); }
.ds-ammo .bar, .ds-health .bar { position: relative; height: 5px; background: var(--ds-track); margin-top: 10px; overflow: hidden; }
.ds-health .bar::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), var(--ds-scrim) calc(10% - 2px) 10%); }
.ds-ammo .bar { width: 220px; margin-left: auto; }
.ds-ammo .bar i, .ds-health .bar i { display: block; height: 100%; width: 100%; background: var(--ds-text); transform-origin: 0 50%; transition: transform 120ms linear; }
.ds-ammo .mag.low ~ .bar i { background: var(--ds-alert); }
.ds-health { position: absolute; left: 0; bottom: 0; min-width: 300px; padding: 0 60px calc(26px + var(--ds-safe-b)) calc(var(--ds-gutter) + var(--ds-safe-l)); background: linear-gradient(0deg, var(--ds-scrim-soft), var(--ds-scrim-thin) 70%, transparent); }
.ds-health .ds-label { color: var(--ds-text); }
.ds-health.low .ds-label { color: var(--ds-alert); }
.ds-health .bar { width: 236px; }
.ds-health .hp { font-size: var(--ds-type-display); font-weight: 700; line-height: 0.9; margin-top: 6px; }
.ds-health.low .hp { color: var(--ds-alert); }
.ds-health.low .bar i { background: var(--ds-alert); }
.ds-feed { position: absolute; right: calc(var(--ds-gutter) + var(--ds-safe-r)); top: calc(24px + var(--ds-safe-t)); display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ds-feed div { display: flex; align-items: center; background: var(--ds-plate-soft); padding: 5px 12px; text-shadow: none; font-size: var(--ds-type-body); transition: opacity 400ms linear; animation: ds-slide 160ms ease-out; }
.ds-hud.rostered .ds-feed { top: calc(84px + var(--ds-safe-t)); }
/* A phone's Battle Royale: the feed starts under the compass and keeps its newest three, clear of the ammo. */
@media (max-width: 1000px) { .ds-hud.royale .ds-feed { top: calc(var(--ds-brstack-foot, 150px) + 10px); } .ds-hud.royale .ds-feed div:nth-last-child(n+4) { display: none; } }
/* A phone: a feed line stays one line; a long one gives up the middle of its names, never its end (ticket 69's "Squad wiped" lines). */
@media (max-width: 640px) {
  .ds-feed { right: calc(var(--ds-gutter) + var(--ds-safe-r)); }
  .ds-feed div { max-width: calc(100vw - 24px); box-sizing: border-box; white-space: nowrap; font-size: var(--ds-type-small); padding: 5px 10px; }
  .ds-feed div > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .ds-feed div > span.tail, .ds-feed div > span.gun { flex: none; }
}
@media (max-width: 1000px) { .ds-feed { top: calc(96px + var(--ds-safe-t)); } }
/* A phone: health and ammo each keep to their half of the screen, so the bars never cross (ticket 41). */
@media (max-width: 640px) {
  .ds-health, .ds-ammo { min-width: 0; max-width: 50vw; box-sizing: border-box; }
  .ds-health { padding: 0 12px calc(22px + var(--ds-safe-b)) calc(var(--ds-gutter) + var(--ds-safe-l)); }
  .ds-ammo { padding: 0 calc(var(--ds-gutter) + var(--ds-safe-r)) calc(22px + var(--ds-safe-b)) 12px; }
  .ds-health .bar, .ds-ammo .bar { width: calc(50vw - 28px); }
}
/* Narrow screens put the ping and frame rate over the health, out from under the top bars (ticket 45). */
@media (max-width: 960px) { .ds-hud .ds-stats { top: auto; bottom: calc(118px + var(--ds-safe-b)); left: calc(var(--ds-gutter) + var(--ds-safe-l)); } }
/* Your own lines: a step up and a bar in text colour, as your lobby seat. */
.ds-feed .you { box-shadow: inset 3px 0 0 var(--ds-text); background: var(--ds-raised-2); }
/* A bot is said in words after the name, not boxed in a tag. */
.ds-bot { margin-left: 6px; color: var(--ds-text-2); font-size: var(--ds-type-small); font-weight: 400; }
.ds-zones { position: absolute; left: 50%; top: calc(86px + var(--ds-safe-t)); transform: translateX(-50%); display: flex; gap: 6px; }
.ds-zones .zone { position: relative; width: 40px; height: 40px; border: 2px solid currentColor; background: var(--ds-plate-thin); display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: var(--ds-text-3); }
.ds-zones .zone.ds-t1 { color: var(--ds-blue); background: rgb(var(--ds-blue-rgb) / 0.28); }
.ds-zones .zone.ds-t2 { color: var(--ds-orange); background: rgb(var(--ds-orange-rgb) / 0.28); }
.ds-zones .zone b { font-size: var(--ds-type-body); line-height: 1; color: var(--ds-text); }
.ds-zones .zone .mark { font-size: var(--ds-type-small); line-height: 1; margin-top: 2px; }
.ds-zones .zone i { position: absolute; left: 0; bottom: 0; height: 4px; background: currentColor; }
.ds-zones .zone.here { box-shadow: 0 0 0 2px var(--ds-line-3); }
.ds-zones .zone.contested { animation: ds-blink 0.6s steps(2) infinite; }
@keyframes ds-blink { 50% { border-color: var(--ds-alert); } }
.ds-marker { position: absolute; left: 0; top: 0; will-change: transform; display: flex; flex-direction: column; align-items: center; color: var(--ds-text-3); }
.ds-marker b { width: 26px; height: 26px; border: 2px solid currentColor; display: flex; align-items: center; justify-content: center; font-size: var(--ds-type-small); color: var(--ds-text); background: var(--ds-plate-thin); }
.ds-marker.ds-t1 { color: var(--ds-blue); }
.ds-marker.ds-t2 { color: var(--ds-orange); }
.ds-marker.ds-t1 b { background: rgb(var(--ds-blue-rgb) / 0.4); }
.ds-marker.ds-t2 b { background: rgb(var(--ds-orange-rgb) / 0.4); }
.ds-marker small { font-size: var(--ds-type-small); margin-top: 2px; color: var(--ds-text-2); }
.ds-marker.contested b { border-color: var(--ds-alert); }
.ds-marker.target b { border-color: var(--ds-signal); }
.ds-marker.charge b { border-color: var(--ds-alert); color: var(--ds-alert); }
.ds-marker.planted b { border-color: var(--ds-alert); color: var(--ds-alert); animation: ds-blink 0.5s steps(2) infinite; }
.ds-charge { position: absolute; left: 50%; top: calc(86px + var(--ds-safe-t)); transform: translateX(-50%); padding: 6px 14px; text-align: center; white-space: nowrap; }
.ds-charge .side { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-charge .what { font-size: var(--ds-type-body); font-weight: 700; margin-top: 3px; }
.ds-charge .what.alert { color: var(--ds-alert); }
.ds-action { position: absolute; left: 50%; top: calc(50% + 48px); transform: translateX(-50%); width: 240px; padding: 8px 12px; text-align: center; font-size: var(--ds-type-small); }
.ds-action .bar { height: 5px; margin-top: 6px; background: var(--ds-track); overflow: hidden; }
.ds-action .bar i { display: block; height: 100%; background: var(--ds-signal); }
.ds-action .bar i.bleed { background: var(--ds-alert); }
.ds-action div { font-variant-numeric: tabular-nums; }
.ds-action .shield { margin-bottom: 4px; font-weight: 700; color: var(--ds-text); }
.ds-action .bar + div { margin-top: 8px; }
.ds-round { position: absolute; left: 50%; top: 30%; width: max-content; max-width: calc(100vw - 32px); transform: translate(-50%, -50%); padding: 10px 16px 12px; background: var(--ds-plate); text-align: center; white-space: nowrap; animation: ds-in 160ms ease-out; }
.ds-round .sub { font-size: var(--ds-type-body); font-weight: 700; color: var(--ds-text); text-shadow: 0 1px 8px var(--ds-shadow-hi), 0 0 2px var(--ds-shadow-hi); }
.ds-round .goal { margin-top: 8px; font-size: var(--ds-type-body); text-shadow: none; white-space: normal; max-width: min(560px, calc(100vw - 32px)); box-sizing: border-box; }
.ds-round h2 { margin: 6px 0 0; font-size: var(--ds-type-title); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 2px 12px var(--ds-shadow); }
.ds-feed .gun { color: var(--ds-text-2); margin: 0 8px; font-size: var(--ds-type-small); }
.ds-feed .gun b { color: var(--ds-alert); margin-left: 6px; font-weight: 700; }
.ds-stats { position: absolute; left: calc(var(--ds-gutter) + var(--ds-safe-l)); top: calc(20px + var(--ds-safe-t)); padding: 3px 8px; background: var(--ds-scrim-thin); font-size: var(--ds-type-small); font-weight: 700; color: var(--ds-text-2); letter-spacing: 0.08em; text-shadow: none; }
.ds-stats:empty { display: none; }
.ds-match { position: absolute; left: 50%; top: calc(24px + var(--ds-safe-t)); transform: translateX(-50%); width: max-content; display: flex; align-items: stretch; gap: 0; padding: 0; overflow: hidden; }
.ds-match > div { padding: 6px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ds-match .score { font-size: var(--ds-type-heading); font-weight: 700; line-height: 1; }
.ds-match .team { min-width: 92px; }
.ds-match .team.mine { background: var(--ds-tint); }
.ds-match .team { position: relative; }
.ds-match .team .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--ds-line); }
.ds-match .team .prog i { display: block; height: 100%; background: currentColor; }
.ds-match .team.r .prog i { margin-left: auto; }
.ds-match .mid { border-left: 1px solid var(--ds-line); border-right: 1px solid var(--ds-line); min-width: 96px; }
.ds-match .clock { font-size: var(--ds-type-heading); font-weight: 700; letter-spacing: 0.02em; }
.ds-match .clock.low { color: var(--ds-alert); }
.ds-match .sub { font-size: var(--ds-type-small); color: var(--ds-text-2); margin-top: 3px; white-space: nowrap; }
.ds-match > .roster { flex-direction: row; gap: 4px; padding: 6px 8px; }
.ds-match > .roster.l { flex-direction: row-reverse; }
.ds-pc { position: relative; width: 34px; height: 38px; overflow: hidden; box-shadow: inset 0 -2px 0 currentColor; }
.ds-pc.ds-t1 { background: var(--ds-t1-shade); }
.ds-pc.ds-t2 { background: var(--ds-t2-shade); }
.ds-pc svg { position: absolute; left: 0; bottom: 0; width: 34px; height: 34px; }
.ds-pc.you { box-shadow: inset 0 -2px 0 currentColor, inset 0 0 0 1px var(--ds-signal); }
.ds-pc.dead { box-shadow: none; background: var(--ds-raised); }
.ds-pc.dead svg { filter: grayscale(1) brightness(0.45); opacity: 0.8; }
.ds-pc.dead::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top right, transparent calc(50% - 1.2px), var(--ds-alert) calc(50% - 1.2px), var(--ds-alert) calc(50% + 1.2px), transparent calc(50% + 1.2px)); opacity: 0.9; }
.ds-pc .carry { position: absolute; right: 2px; top: 1px; font-size: var(--ds-type-small); line-height: 1; color: var(--ds-alert); text-shadow: 0 0 2px var(--ds-black); }
.ds-pc .hp { position: absolute; left: 3px; right: 3px; bottom: 4px; height: 2px; background: var(--ds-shadow); }
.ds-pc .hp span { display: block; height: 100%; background: var(--ds-text); }
.ds-pc .hp.low span { background: var(--ds-alert); }
.ds-match .name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--ds-type-body); }
.ds-prompt { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); padding: 6px 12px; font-size: var(--ds-type-body); letter-spacing: 0.14em; text-transform: uppercase; }
.ds-prompt[hidden] { display: none; }
.ds-dmgnum { position: absolute; transform: translate(-50%, -100%); text-align: center; pointer-events: none; text-shadow: 0 1px 4px var(--ds-shadow-hi); animation: ds-dmgnum 1.4s ease-out forwards; }
.ds-dmgnum b { display: block; font-size: var(--ds-type-heading); font-weight: 700; font-variant-numeric: tabular-nums; }
.ds-dmgnum.head b { color: var(--ds-alert); }
.ds-dmgnum small { display: block; font-size: var(--ds-type-small); letter-spacing: 0.1em; color: var(--ds-text-2); }
@keyframes ds-dmgnum { 0% { opacity: 0; margin-top: 6px; } 10% { opacity: 1; margin-top: 0; } 70% { opacity: 1; } 100% { opacity: 0; margin-top: -34px; } }
.ds-center { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: var(--ds-type-heading); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; white-space: pre-line; line-height: 1.6; }
.ds-overlay { position: absolute; left: calc(var(--ds-gutter) + var(--ds-safe-l)); bottom: calc(132px + var(--ds-safe-b)); padding: 10px 12px; font-size: var(--ds-type-small); display: grid; grid-template-columns: auto auto; gap: 2px 14px; align-items: center; }
.ds-overlay canvas { grid-column: 1 / 3; margin-top: 4px; background: var(--ds-shadow-lo); }
/* The empty box under the readouts says what will be drawn in it. */
.ds-overlay .k.trace { grid-column: 1 / 3; margin-top: 6px; }
.ds-overlay .k { color: var(--ds-text-2); font-size: var(--ds-type-small); }
.ds-board { position: absolute; z-index: 2; left: 50%; top: calc(142px + var(--ds-safe-t)); max-height: calc(100vh - 332px); overflow: hidden; transform: translateX(-50%); width: min(920px, calc(100vw - 64px)); padding: 0; display: none; background: var(--ds-plate-solid); text-shadow: none; animation: ds-fade 100ms ease-out; }
.ds-hud.boarded .ds-feed, .ds-hud.boarded .ds-round { visibility: hidden; }
.ds-board > header { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 20px 12px; border-bottom: 1px solid var(--ds-line); }
.ds-board > header b { font-size: var(--ds-type-heading); letter-spacing: 0.04em; text-transform: uppercase; }
.ds-board > header span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-board > header .goal { flex: 1 1 0; min-width: 0; margin: 0 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-board > header b, .ds-board > header .ds-label { flex: none; }
.ds-board .cols { padding: 14px 20px 18px; }
/* At a match's end the board stands under the end panel, in the room that panel leaves it. */
.ds-board.end { top: auto; bottom: 56px; max-height: max(120px, calc(100vh - var(--ds-end-foot, 360px) - 68px)); }
.ds-board .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.ds-board .cols.one { grid-template-columns: 1fr; }
/* A phone: the board starts under the Battle Royale stack and runs to just over the health and ammo. One column. */
@media (max-width: 640px) { .ds-board { width: calc(100vw - 24px); max-height: calc(100vh - var(--ds-brstack-foot, 150px) - 170px); } .ds-board .cols { grid-template-columns: minmax(0, 1fr); padding: 12px 14px 14px; gap: 14px; } .ds-board > header { padding: 12px 14px 10px; } .ds-hud.royale .ds-board { top: calc(var(--ds-brstack-foot, 150px) + 8px); } }
/* A side: its name and total over its rows, a bar in the team's colour at its left edge. */
.ds-board h3 { margin: 0 0 6px; padding: 6px 10px 6px 14px; display: flex; justify-content: space-between; align-items: center; font-size: var(--ds-type-heading); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; box-shadow: inset 4px 0 0 currentColor; }
.ds-board h3 > span:first-child { color: var(--ds-text); }
.ds-board h3 .total { font-size: var(--ds-type-heading); line-height: 1; }
.ds-board table { width: 100%; border-collapse: collapse; }
.ds-board th { text-align: right; font-size: var(--ds-type-small); font-weight: 400; color: var(--ds-text-2); padding: 4px 8px; }
.ds-board th:nth-child(-n+2), .ds-board td:nth-child(-n+2) { text-align: left; }
.ds-board td { padding: 7px 8px; border-top: 1px solid var(--ds-line); text-align: right; font-size: var(--ds-type-body); }
.ds-board td:nth-child(2) { font-weight: 700; width: 100%; max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-board td.place { color: var(--ds-text-2); width: 36px; }
.ds-board td.score { font-weight: 700; }
/* Column heads in full, or their initials where the table is narrow. */
.ds-board th .n { display: none; }
@media (max-width: 1100px) { .ds-board th .w { display: none; } .ds-board th .n { display: inline; } .ds-board th, .ds-board td { padding-left: 6px; padding-right: 6px; } }
.ds-board tr.you td { background: var(--ds-raised); }
.ds-board tr.you td:first-child { box-shadow: inset 4px 0 0 var(--ds-text); }
.ds-board .ping { color: var(--ds-text-2); }
.ds-end { position: absolute; left: 50%; top: calc(56px + var(--ds-safe-t)); transform: translateX(-50%); width: min(880px, calc(100vw - 112px)); text-align: center; display: none; animation: ds-in 160ms ease-out; }
/* The result heads the panel on its plate: over the sky and the cloud it measured 1.2:1. */
.ds-end .head { margin: 0 auto 1px; width: min(840px, 100%); padding-top: 12px; background: var(--ds-plate); }
.ds-end .head .mvp.ds-plate { margin-bottom: 0; background: none; border-top: 1px solid var(--ds-line); }
.ds-end h2 { margin: 4px 0 14px; font-size: var(--ds-type-title); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 2px 12px var(--ds-shadow); }
/* The MVP: one line on its own plate, set on top of yours. */
.ds-end .mvp { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 16px; margin: 0 auto 1px; width: min(840px, 100%); padding: 9px 14px; text-align: left; font-size: var(--ds-type-body); color: var(--ds-text-2); font-variant-numeric: tabular-nums; }
.ds-end .mvp b { color: var(--ds-text); font-weight: 700; }
.ds-end .mvp .who { font-size: var(--ds-type-heading); line-height: 1; text-transform: uppercase; letter-spacing: 0.03em; }
/* Your match: your numbers, the XP they paid and the Rank bar, as one plate. */
.ds-end .mine { margin: 0 auto 14px; width: min(840px, 100%); padding: 12px 14px; }
.ds-end .mine:empty { display: none; }
.ds-end .mine > .ds-label { display: block; margin-bottom: -2px; text-align: left; }
@media (max-width: 640px) { .ds-end { top: calc(16px + var(--ds-safe-t)); width: calc(100vw - 24px); } .ds-end h2 { font-size: var(--ds-type-title); margin-bottom: 10px; } .ds-end .mvp { padding: 8px 10px; gap: 2px 12px; font-size: var(--ds-type-body); } .ds-end .mvp .who { font-size: var(--ds-type-body); } .ds-end .mine { padding: 10px; margin-bottom: 10px; } }
/* A phone on its side (ticket 26): the result on one line, the numbers in one row and the vote beside nothing it hides. The board
   comes when it is asked for, over the panel and not under it: there is no room for both. */
@media (max-height: 520px) and (min-width: 641px) {
  .ds-end { top: calc(6px + var(--ds-safe-t)); width: min(880px, calc(100vw - 136px - var(--ds-safe-l) - var(--ds-safe-r))); }
  .ds-end .head { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 0 14px; padding-top: 6px; }
  .ds-end h2 { margin: 0 0 6px; font-size: var(--ds-type-title); }
  .ds-end .mvp { flex: 1 1 100%; padding: 6px 12px; }
  .ds-end .mine { padding: 8px 12px; margin-bottom: 6px; }
  .ds-hud .ds-end .mine .ds-readouts { grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); }
  .ds-hud .ds-end .mine .ds-readouts > div { grid-column: auto; padding: 5px 10px; }
  .ds-end .mine.ds-gain { gap: 6px; }
  .ds-end .vote { padding: 8px 12px; }
  .ds-end .vote header { margin-bottom: 4px; }
  .ds-end .vote .next, .ds-end .next { margin-top: 4px; }
  .ds-board.end:not(.held) { display: none !important; }
  .ds-end .next.board { display: none; }
  .ds-board.end.held { z-index: 3; top: calc(8px + var(--ds-safe-t)); bottom: auto; width: min(920px, calc(100vw - 136px - var(--ds-safe-l) - var(--ds-safe-r))); max-height: calc(100vh - 16px - var(--ds-safe-t) - var(--ds-safe-b)); overflow-y: auto; }
  .ds-hud:has(.ds-board.end.held) .ds-end { visibility: hidden; }
  /* The panel has the width of the screen here: the kill feed would lie on it. */
  .ds-hud:has(.ds-end[style*="block"]) .ds-feed { visibility: hidden; }
}
.ds-end .vote { margin: 0 auto; width: min(560px, 100%); padding: 12px 14px; text-align: left; }
.ds-end .vote header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.ds-end .vote .clock { font-size: var(--ds-type-heading); font-weight: 700; color: var(--ds-text); }
.ds-votes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; pointer-events: auto; }
.ds-votes button { position: relative; overflow: hidden; font: inherit; color: inherit; text-align: left; background: var(--ds-raised); border: 1px solid var(--ds-line); border-radius: 0; padding: 10px 12px; cursor: pointer; }
.ds-votes button:hover { border-color: var(--ds-text-2); }
.ds-votes button.mine { border-color: var(--ds-signal); box-shadow: inset 4px 0 0 var(--ds-signal); }
.ds-votes button > span { display: block; }
.ds-votes button .key { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-votes button .mode { display: block; font-size: var(--ds-type-body); font-weight: 700; text-transform: uppercase; margin: 2px 0 6px; }
.ds-votes button .tally { height: 4px; background: var(--ds-line); overflow: hidden; }
.ds-votes button .tally i { display: block; height: 100%; background: var(--ds-signal); transition: width 200ms ease-out; }
.ds-votes button .n { position: absolute; right: 12px; top: 10px; font-size: var(--ds-type-heading); font-weight: 700; }
.ds-end .next { display: inline-block; margin-top: 8px; padding: 4px 10px; background: var(--ds-scrim-soft); font-size: var(--ds-type-small); color: var(--ds-text); }
.ds-end .vote .next { display: block; padding: 0; background: none; color: var(--ds-text-2); }
.ds-recap { position: absolute; left: calc(var(--ds-gutter) + var(--ds-safe-l)); bottom: calc(156px + var(--ds-safe-b)); min-width: 260px; max-width: min(380px, calc(100vw - 32px)); padding: 12px 16px; background: var(--ds-scrim-soft); border-left: 3px solid var(--ds-alert); animation: ds-in var(--ds-slow) var(--ds-ease); }
@media (max-width: 640px) { .ds-recap { left: calc(var(--ds-gutter) + var(--ds-safe-l)); bottom: calc(206px + var(--ds-safe-b)); min-width: 0; padding: 8px 12px; } .ds-recap .who b { font-size: var(--ds-type-body); } .ds-recap .nums b { font-size: var(--ds-type-body); } }
.ds-toast { position: absolute; left: 50%; bottom: calc(128px + var(--ds-safe-b)); transform: translateX(-50%); width: max-content; max-width: min(560px, calc(100vw - 32px)); box-sizing: border-box; background: var(--ds-plate-solid); box-shadow: inset 4px 0 0 var(--ds-text); padding: 10px 16px 10px 20px; font-size: var(--ds-type-body); line-height: 1.4; opacity: 0; transition: opacity 300ms; text-shadow: none; }
/* A phone: the toast runs the width, two lines at most, and the recap stands above it rather than under it. */
@media (max-width: 640px) { .ds-toast { width: calc(100vw - 24px); padding: 8px 12px 8px 16px; font-size: var(--ds-type-body); } }
`;

export interface HudState {
  readonly self: PlayerOutput | null;
  /** What the match just played gave your Profile, once it is banked: the end panel's XP, Rank bar and Challenges. Null before then, and where nothing is kept. */
  readonly gain?: MatchGain | null;
  /** A tag over each ally (ticket 52): teammates, or your Squad in a Battle Royale. */
  readonly allies?: readonly AllyTag[];
  /** Out of the fight: the spectator's panel (ticket 32), or null. */
  readonly spectator?: SpectatorPanelState | null;
  /** Watching through someone's eyes: whose aim the crosshair shows. */
  readonly spectatorAim?: PlayerOutput | null;
  /** Pixels per degree at the screen centre, for sizing the crosshair to the spread. */
  readonly pixelsPerDegree: number;
  readonly fps: number;
  /** Round-trip time in ms, or null offline. */
  readonly ping: number | null;
  readonly showFps: boolean;
  readonly showPing: boolean;
  readonly showOverlay: boolean;
  /** Range overlay: distance to whatever the crosshair is on. */
  readonly targetDistance: number | null;
  readonly scores: readonly Score[];
  /** Each player's round trip (ms), online. */
  readonly pings: Readonly<Record<string, number>>;
  readonly selfId: string | null;
  readonly showScoreboard: boolean;
  /** The online match: mode, phase, time left, team scores and the vote. Null offline. */
  readonly match: MatchView | null;
  /** Seconds until you respawn while dead, or null while alive. */
  readonly respawnIn: number | null;
  /** A button prompt under the centre (the loadout screen's), or null. */
  readonly prompt?: string | null;
  /** The first-match hint to show (ticket 26), or null. A toast stands in its place while one is up. */
  readonly hint?: HintLine | null;
  /** A centred message (e.g. "connecting"), or null. */
  readonly message: string | null;
  /** The Outposts zones, or none. */
  readonly zones?: readonly ZoneMarker[];
  /** The Charge round, or null outside Charge. */
  readonly charge?: ChargeHud | null;
  /** The Battle Royale in play, or null. */
  readonly royale?: RoyaleHudState | null;
  /** A Battle Royale's victory beat, between its result and the nuke (ticket 69), or null. */
  readonly victory?: VictoryCard | null;
  /** A Battle Royale's match card, at its end in place of the end panel (ticket 73), or null. */
  readonly matchCard?: MatchCardState | null;
  /** Who put you Downed, while you are (ticket 73); out, the spectator's panel says it. */
  readonly recap?: Recap | null;
  /** Something you are holding use for that takes a while (opening a Supply Drop, a Reboot), and how far along it is. */
  readonly action?: { readonly label: string; readonly share: number } | null;
  /** The pings standing, where they show on the screen, and the ping wheel while it is open (ticket 66). */
  readonly pingMarks?: { readonly marks: readonly PingScreenMark[]; readonly wheel: { readonly pick: PingKind | null } | null };
  /** How white a flash has turned the view, 0 to 1 (ticket 20). */
  readonly blinded?: number;
  /** The tactical this life's loadout carries (ticket 20); none hides its slot. */
  readonly tactical?: 'smoke' | 'flash' | null;
  /** The live grenades near enough to warn you of (ticket 12). */
  readonly grenades?: readonly GrenadeWarning[];
  readonly dt: number;
}

/** A Charge round as the HUD shows it. */
export interface ChargeHud {
  readonly state: ChargeState;
  /** Whether the local player is on the attacking side. */
  readonly attacking: boolean;
  /** Names of the carrier and of whoever is planting or defusing, if anyone. */
  readonly carrier: string | null;
  readonly actor: string | null;
  /** The local player is the carrier, or the one planting or defusing. */
  readonly carrying: boolean;
  readonly acting: boolean;
  /** The teammate a dead player watches, or null. */
  readonly spectating: string | null;
  /** The sites and the charge, each projected to where its marker goes on screen. */
  readonly markers: readonly ObjectiveMarker[];
  /** Everyone's portrait by side, for the match bar: who is still alive this round. */
  readonly roster: readonly { readonly team: number; readonly cards: readonly RosterCard[] }[];
}

/** A marker over something in the world: a Charge site, the dropped or planted charge. */
export interface ObjectiveMarker {
  readonly key: string;
  readonly label: string;
  readonly kind: 'site' | 'target' | 'charge' | 'planted';
  readonly x: number;
  readonly y: number;
  /** Metres away. */
  readonly distance: number;
}

/** How a Charge round was won, as the round banner says it. */
const ROUND_REASONS: Readonly<Record<RoundReason, string>> = { detonated: 'Charge detonated', defused: 'Charge defused', eliminated: 'Team eliminated', time: 'Time ran out' };

export type HitKind = 'hit' | 'kill' | 'headshot' | 'headshotKill' | 'shielded';

/** The marker for a hit you made: `shielded` when it took nothing, a seat in its first second Downed (ticket 54). */
export function hitKind(killed: boolean, head: boolean, damage: number): HitKind {
  if (killed) return head ? 'headshotKill' : 'kill';
  if (damage <= 0) return 'shielded';
  return head ? 'headshot' : 'hit';
}

/** Seconds a Downed seat has left of the grace in which nothing damages it; 0 once it is over. */
export function protectedFor(downed: { readonly bleedOut: number } | null): number {
  if (!downed) return 0;
  return Math.max(0, downed.bleedOut - (STATS.royale.bleedOut.value - STATS.royale.downedGrace.value));
}

/** An Outposts zone as the HUD shows it: its state, and where its marker goes on screen. */
export interface ZoneMarker {
  readonly id: string;
  /** Teams: the holder (0 while neutral) and the one taking it (0 for none), and how far, 0 to 1. */
  readonly owner: number;
  readonly capturing: number;
  readonly progress: number;
  readonly contested: boolean;
  /** Where the marker goes (px), kept on screen when the zone is behind or off to the side. */
  readonly x: number;
  readonly y: number;
  /** Metres away. */
  readonly distance: number;
  /** Whether the local player stands in it. */
  readonly inside: boolean;
}

/** The match as the HUD shows it. */
export interface MatchView {
  readonly status: MatchStatus;
  /** Seconds left in the phase, or null with no time limit. */
  readonly secondsLeft: number | null;
  /** The local player's team (team modes), or null. */
  readonly team: number | null;
  /** The mode the local player voted for this intermission, if any. */
  readonly myVote: ModeId | null;
  /** Seconds left in the match's opening countdown, or null once play is on. */
  readonly countdown?: number | null;
}


/** The mode as the match bar names it, short. */
const MODE_SHORT: Readonly<Record<string, string>> = { tdm: 'TDM', ffa: 'FFA', outposts: 'Outposts', charge: 'Charge', gungame: 'Gun game' };

/** A number for a style, to three places, so values that barely move are not written again. */
/** Health and ammo show only while you are in play: alive, or Downed; out, or waiting to respawn, they go (ticket 46). */
export function barsShown(self: Pick<PlayerOutput, 'alive'> | null): boolean {
  return self !== null && self.alive;
}

function fixed(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Indicator {
  readonly el: HTMLDivElement;
  /** World yaw from the player toward the attacker. */
  readonly worldYaw: number;
  age: number;
}

/**
 * The HUD: hipfire crosshair (hidden on ADS), hit, kill and headshot markers,
 * directional damage indicators, the ammo counter, the kill feed, fps and
 * ping counters, the range overlay (TTK, distance, recoil trace) and the
 * scoreboard. Plain DOM over the canvas.
 */
export class Hud {
  readonly root: HTMLDivElement;
  readonly #cross: CrosshairView;
  readonly #captions: CaptionView;
  readonly #hit: HTMLDivElement;
  #hitAge = 1;
  #hitLife = 0.28;
  readonly #score: ScoreFeed;
  readonly #dmg: HTMLDivElement;
  readonly #indicators: Indicator[] = [];
  readonly #vignette: HTMLDivElement;
  /** A flash's white-out over the world (the HUD stays over it). */
  readonly #blind: HTMLDivElement;
  readonly #mag: HTMLSpanElement;
  /** The spare rounds: infinite, except a sniper from a Supply Drop. */
  readonly #res: HTMLSpanElement;
  readonly #gun: HTMLElement;
  readonly #nade: HTMLElement;
  readonly #nadeCount: HTMLElement;
  readonly #tac: HTMLElement;
  #tacKind: string | null = 'smoke';
  readonly #hint: HTMLElement;
  readonly #scope: HTMLDivElement;
  readonly #health: HTMLDivElement;
  readonly #healthLabel: HTMLElement;
  readonly #ammo: HTMLDivElement;
  readonly #hp: HTMLElement;
  readonly #hpBar: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #feed: HTMLDivElement;
  readonly #stats: HTMLDivElement;
  readonly #center: HTMLDivElement;
  readonly #prompt: HTMLDivElement;
  readonly #overlay: HTMLDivElement;
  readonly #ttk: HTMLSpanElement;
  readonly #dist: HTMLSpanElement;
  readonly #shots: HTMLSpanElement;
  readonly #lastHit: HTMLSpanElement;
  readonly #trace: HTMLCanvasElement;
  readonly #board: HTMLDivElement;
  readonly #match: HTMLDivElement;
  readonly #end: HTMLDivElement;
  /** The end panel's three parts: who won, your match (drawn once, so its Rank bar fills once), and what comes next with its clock. */
  readonly #endHead: HTMLDivElement;
  readonly #endMine: HTMLDivElement;
  readonly #endNext: HTMLDivElement;
  #endFoot = -1;
  readonly #zones: HTMLDivElement;
  readonly #markers = new Map<string, HTMLDivElement>();
  readonly #charge: HTMLDivElement;
  readonly #action: HTMLDivElement;
  readonly #revive: HTMLDivElement;
  readonly #round: HTMLDivElement;
  readonly #chargeMarkers = new Map<string, HTMLDivElement>();
  /** Called when a vote button is pressed. */
  onVote: ((mode: ModeId) => void) | null = null;
  readonly #toast: HTMLDivElement;
  #toastTime = 0;
  readonly #royale: RoyaleHud;
  readonly #pings: PingMarks;
  readonly #allies: AllyTagsView;
  readonly #grenades: GrenadeWarningsView;
  readonly #clock = new MatchClockView();
  readonly #spectator: SpectatorPanel;
  readonly #card: MatchCardView;
  readonly #recap: HTMLDivElement;
  #traceShots: { yaw: number; pitch: number }[] = [];
  #flash = 0;
  readonly #html = new WeakMap<HTMLElement, string>();
  /** What each element was last given, so a frame writes to the page only what changed. */
  readonly #texts = new WeakMap<HTMLElement, string>();
  readonly #styles = new WeakMap<HTMLElement, Map<string, string>>();

  constructor(parent: HTMLElement) {
    installTheme();
    if (!document.getElementById('ds-hud-css')) {
      const style = document.createElement('style');
      style.id = 'ds-hud-css';
      style.textContent = CSS + ALLY_TAGS_CSS + SPECTATOR_PANEL_CSS + RECAP_CSS + MATCH_CARD_CSS + MATCH_GAIN_CSS + SCORE_FEED_CSS + MATCH_CLOCK_CSS + GRENADE_WARNINGS_CSS + CAPTIONS_CSS + HUD_SCALE_CSS + HINT_LINE_CSS + HUD_TOUCH_CSS;
      document.head.append(style);
    }
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parentEl: HTMLElement, html = '') => {
      const e = document.createElement(tag);
      e.className = cls;
      e.innerHTML = html;
      parentEl.append(e);
      return e;
    };
    this.root = el('div', 'ds-hud ds-ui', parent);
    this.#scope = el('div', 'ds-scope', this.root, '<i class="h"></i><i class="v"></i><i class="h thick"></i><i class="h thick r"></i><i class="v thick"></i>');
    this.#vignette = el('div', 'ds-vignette', this.root);
    this.#blind = el('div', 'ds-blind', this.root);
    this.#allies = new AllyTagsView(this.root);
    this.#grenades = new GrenadeWarningsView(this.root);
    this.#spectator = new SpectatorPanel(this.root);
    this.#cross = new CrosshairView(this.root);
    this.#captions = new CaptionView(this.root);
    this.#hit = el('div', 'ds-hit', this.root, '<i></i><i></i><i></i><i></i>');
    [...this.#hit.querySelectorAll('i')].forEach((i, n) => {
      const a = 45 + n * 90;
      (i as HTMLElement).style.transform = `rotate(${a}deg) translateX(12px)`;
    });
    this.#score = new ScoreFeed(this.root);
    this.#dmg = el('div', 'ds-dmg', this.root);
    this.#health = el('div', 'ds-health', this.root, '<div class="ds-label">Health</div><div class="hp">100</div><div class="bar"><i></i></div>');
    this.#healthLabel = this.#health.querySelector('.ds-label') as HTMLElement;
    this.#hp = this.#health.querySelector('.hp') as HTMLElement;
    this.#hpBar = this.#health.querySelector('.bar i') as HTMLElement;
    const ammo = (this.#ammo = el('div', 'ds-ammo', this.root, `<div class="gun">M4A1</div><span class="nade tac" aria-label="Tactical">${icon('smoke')}<b>1</b></span><span class="nade frag" aria-label="Grenades">${icon('grenade')}<b>1</b></span><span class="mag">30</span>` + '<span class="res">/ ∞</span><div class="bar"><i></i></div>'));
    this.#mag = ammo.querySelector('.mag') as HTMLSpanElement;
    this.#res = ammo.querySelector('.res') as HTMLSpanElement;
    this.#gun = ammo.querySelector('.gun') as HTMLElement;
    this.#nade = ammo.querySelector('.nade.frag') as HTMLElement;
    this.#nadeCount = ammo.querySelector('.nade.frag b') as HTMLElement;
    this.#tac = ammo.querySelector('.nade.tac') as HTMLElement;
    this.#bar = ammo.querySelector('.bar i') as HTMLElement;
    this.#feed = el('div', 'ds-feed', this.root);
    this.#stats = el('div', 'ds-stats', this.root);
    this.#center = el('div', 'ds-center', this.root);
    this.#prompt = el('div', 'ds-prompt ds-plate', this.root);
    this.#overlay = el(
      'div',
      'ds-overlay ds-plate',
      this.root,
      '<span class="k">Time to kill</span><span class="ttk">–</span><span class="k">Distance</span><span class="dist">–</span><span class="k">Shots / hits</span><span class="shots">–</span><span class="k">Last hit</span><span class="last-hit">–</span><span class="k trace">Recoil of the last burst</span><canvas width="180" height="150"></canvas>',
    );
    this.#ttk = this.#overlay.querySelector('.ttk') as HTMLSpanElement;
    this.#dist = this.#overlay.querySelector('.dist') as HTMLSpanElement;
    this.#shots = this.#overlay.querySelector('.shots') as HTMLSpanElement;
    this.#lastHit = this.#overlay.querySelector('.last-hit') as HTMLSpanElement;
    this.#trace = this.#overlay.querySelector('canvas') as HTMLCanvasElement;
    this.#board = el('div', 'ds-board', this.root);
    this.#match = el('div', 'ds-match ds-plate', this.root);
    this.#zones = el('div', 'ds-zones', this.root);
    this.#charge = el('div', 'ds-charge ds-plate', this.root);
    this.#action = el('div', 'ds-action ds-plate', this.root);
    this.#revive = el('div', 'ds-action ds-plate', this.root);
    this.#round = el('div', 'ds-round', this.root);
    this.#end = el('div', 'ds-end', this.root);
    this.#endHead = el('div', 'head', this.#end);
    this.#endMine = el('div', 'mine ds-plate ds-gain', this.#end);
    this.#endNext = el('div', 'after', this.#end);
    this.#end.addEventListener('click', (e) => {
      const mode = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset['mode'];
      if (mode === 'tdm' || mode === 'ffa') this.onVote?.(mode);
    });
    this.#toast = el('div', 'ds-toast', this.root);
    this.#hint = el('div', 'ds-hintline', this.root);
    this.#hint.hidden = true;
    this.#royale = new RoyaleHud(this.root, null);
    this.#recap = el('div', 'ds-recap', this.root);
    this.#card = new MatchCardView(this.root, () => this.#royale.picture());
    this.#pings = new PingMarks(this.root);
  }

  /** The island the Battle Royale map draws (Zero Island), painted ahead of the map's first opening. */
  setIsland(source: IslandMapSource): void {
    this.#royale.island = source;
  }

  set visible(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }

  hitMarker(kind: HitKind): void {
    const kill = kind === 'kill' || kind === 'headshotKill';
    this.#hit.className = `ds-hit${kill ? ' kill' : ''}${kind === 'headshot' || kind === 'headshotKill' ? ' head' : ''}${kind === 'shielded' ? ' shielded' : ''}`;
    this.#hitAge = 0;
    this.#hitLife = kill ? 0.5 : 0.28;
  }

  /** A kill where nothing is scored (the Practice Range's dummies): the score stack's line, without points. */
  eliminated(victim: string, headshot: boolean): void {
    this.#score.add({ lines: [{ points: 0, label: headshot ? 'Headshot' : 'Eliminated', note: victim }], medal: null, points: 0 });
  }

  /** Score you just earned: its lines, the running total and any Medal, beside the crosshair. */
  score(entry: ScoreFeedEntry): void {
    this.#score.add(entry);
  }

  /** A new match: the score lines of the last one go. */
  clearScore(): void {
    this.#score.clear();
  }

  /** A hit taken from an attacker at world yaw `worldYaw` (the direction from you to them). */
  damage(worldYaw: number): void {
    const div = document.createElement('div');
    this.#dmg.append(div);
    this.#indicators.push({ el: div, worldYaw, age: 0 });
    this.#flash = 1;
  }

  /** A kill feed line; `bots` marks which side of it is a bot, `gun` names what did it, `teams` colours each name by its team (team modes), and `down` says the victim went Downed rather than out. */
  killFeed(
    killer: string | null,
    victim: string,
    headshot: boolean,
    involvesYou: boolean,
    bots: { readonly killer?: boolean; readonly victim?: boolean } = {},
    gun = 'M4A1',
    teams: { readonly killer?: number | undefined; readonly victim?: number | undefined } = {},
    down = false,
  ): void {
    const row = document.createElement('div');
    if (involvesYou) row.className = 'you';
    const k = killer === null ? '' : playerName(killer, bots.killer === true, teams.killer);
    row.innerHTML = `${k}<span class="gun">${killer ? escape(headshot ? `✛ ${gun}` : gun) : '☠'}${down ? '<b>Downed</b>' : ''}</span>${playerName(victim, bots.victim === true, teams.victim)}`;
    this.#feed.append(row);
    while (this.#feed.children.length > 6) this.#feed.firstElementChild?.remove();
    setTimeout(() => (row.style.opacity = '0'), 5000);
    setTimeout(() => row.remove(), 5500);
  }

  /** A line in the kill feed about the objectives (a zone taken), in `team`'s colour. */
  objectiveFeed(text: string, team: number, involvesYou: boolean, tail = ''): void {
    const row = document.createElement('div');
    if (involvesYou) row.className = 'you';
    // `tail` is the line's end, kept whole when a narrow screen shortens the rest.
    row.innerHTML = `<span class="ds-t${team}">${TEAMS[team]?.mark ?? ''} ${escape(text)}</span>${tail ? `<span class="tail">&nbsp;${escape(tail)}</span>` : ''}`;
    this.#feed.append(row);
    while (this.#feed.children.length > 6) this.#feed.firstElementChild?.remove();
    setTimeout(() => (row.style.opacity = '0'), 5000);
    setTimeout(() => row.remove(), 5500);
  }

  /** A shot for the range overlay's recoil trace: its direction as yaw/pitch, and whether it starts a burst. */
  recordShot(yaw: number, pitch: number, first: boolean): void {
    if (first) this.#traceShots = [];
    this.#traceShots.push({ yaw, pitch });
    this.#drawTrace();
  }

  /** Range overlay readouts after a kill or a burst. */
  setRangeStats(ttk: number | null, shots: number, hits: number): void {
    this.#ttk.textContent = ttk === null ? '–' : `${Math.round(ttk * 1000)} ms`;
    this.#shots.textContent = `${shots} / ${hits}`;
  }

  /** Range overlay: the damage of your latest hit (and where and how far), to check against the stats tables. */
  setLastHit(damage: number, zone?: string, distance?: number): void {
    const where = [zone?.replace(/([A-Z])/g, ' $1').toLowerCase(), distance === undefined ? undefined : `${distance.toFixed(0)} m`].filter(Boolean).join(' · ');
    this.#lastHit.textContent = `${damage.toFixed(1)} HP${where ? ` · ${where}` : ''}`;
  }

  /** A damage number rising from a range dummy at screen point (x, y), with a smaller line under it. */
  damageNumber(x: number, y: number, damage: number, head: boolean, detail: string): void {
    const div = document.createElement('div');
    div.className = `ds-dmgnum${head ? ' head' : ''}`;
    div.innerHTML = `<b>${damage}</b><small>${escape(detail)}</small>`;
    this.root.append(div);
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.addEventListener('animationend', () => div.remove());
  }

  toast(text: string, seconds = 8): void {
    this.#toast.textContent = text;
    this.#toast.style.opacity = '1';
    this.#toastTime = seconds;
  }

  #drawTrace(): void {
    const ctx = this.#trace.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.#trace;
    ctx.clearRect(0, 0, width, height);
    const theme = getComputedStyle(this.root);
    ctx.strokeStyle = theme.getPropertyValue('--ds-line-2').trim();
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    const first = this.#traceShots[0];
    if (!first) return;
    // 1 degree = 9 px; the first shot sits near the bottom, the climb goes up.
    const k = 9 * (180 / Math.PI);
    ctx.fillStyle = ctx.strokeStyle = theme.getPropertyValue('--ds-gold').trim();
    // The line between the shots at half the dots' weight.
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    this.#traceShots.forEach((s, i) => {
      let dy = s.yaw - first.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      const x = width / 2 - dy * k;
      const y = height - 12 - (s.pitch - first.pitch) * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.#traceShots.forEach((s, i) => {
      let dy = s.yaw - first.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      ctx.beginPath();
      ctx.arc(width / 2 - dy * k, height - 12 - (s.pitch - first.pitch) * k, i === 0 ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  update(state: HudState): void {
    const self = state.self;
    const dt = state.dt;
    // Crosshair: spread-sized, hidden on ADS and while sprinting, as in MW2019; a spectator through someone's eyes sees theirs.
    const aimer = self?.alive ? self : (state.spectatorAim ?? self);
    const w = self?.weapon;
    const aw = aimer?.weapon;
    const sprinting = aimer?.movement === 'sprint';
    const hide = !aimer || !aimer.alive || aimer.downed !== null || aimer.reviving !== null || (aw?.ads ?? 0) > 0.35 || sprinting || aw?.action === 'inspect';
    this.#style(this.#cross.root, 'opacity', hide ? '0' : '1');
    this.#allies.update(state.allies ?? []);
    this.#grenades.update(self ? (state.grenades ?? []) : [], self?.yaw ?? 0);
    this.#spectator.update(state.spectator ?? null);
    this.#cross.update((aw?.spread ?? 2) * state.pixelsPerDegree);
    this.#captions.update(dt);

    this.#hitAge += dt;
    this.#style(this.#hit, 'opacity', fixed(Math.max(0, 1 - this.#hitAge / this.#hitLife)));
    // The marker pops out and settles over its first moments.
    this.#style(this.#hit, 'transform', `scale(${fixed(1 + Math.max(0, 0.12 - this.#hitAge) * 2.5)})`);
    this.#score.update(dt);

    // Damage indicators point at the attacker relative to where you are looking now.
    for (const ind of this.#indicators) {
      ind.age += dt;
      const rel = ind.worldYaw - (self?.yaw ?? 0);
      ind.el.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
      ind.el.style.opacity = String(Math.max(0, 1 - ind.age / 1.6));
    }
    while (this.#indicators[0] && this.#indicators[0].age > 1.6) this.#indicators.shift()?.el.remove();
    this.#flash = Math.max(0, this.#flash - dt * 2.5);
    const hurt = self ? 1 - self.health / 100 : 0;
    this.#style(this.#blind, 'opacity', fixed(state.blinded ?? 0));
    this.#style(this.#vignette, 'opacity', fixed(Math.min(1, hurt * 0.9 + this.#flash * 0.35)));

    const health = self ? Math.max(0, Math.round(self.health)) : 0;
    const bars = barsShown(self);
    this.#style(this.#health, 'display', bars ? '' : 'none');
    this.#text(this.#hp, String(health));
    // Downed, the number is the Downed pool, and the bar fills against that.
    this.#style(this.#hpBar, 'transform', `scaleX(${fixed(health / (self?.downed ? STATS.royale.downedHealth.value : 100))})`);
    this.#health.classList.toggle('low', health <= 35 || Boolean(self?.downed));
    this.#text(this.#healthLabel, self?.downed ? 'Downed' : 'Health');

    this.#style(this.#ammo, 'display', bars ? '' : 'none');
    if (w && self) {
      const row = heldRow(self);
      const size = row.handling.magazineSize.value;
      this.#set(this.#gun, `${escape(row.traits.name)}<small>${row.traits.sight === 'scope' ? 'scoped' : row.traits.fireMode}</small>`);
      this.#text(this.#mag, String(w.ammo));
      this.#text(this.#res, w.reserve === undefined ? '/ ∞' : `/ ${w.reserve}`);
      this.#res.classList.toggle('low', w.reserve === 0);
      this.#mag.classList.toggle('low', w.ammo <= Math.max(1, Math.floor(size / 5)));
      this.#style(this.#bar, 'transform', `scaleX(${fixed(w.ammo / size)})`);
      // A frag in the hand counts its fuse down; a tactical's isn't lit until it leaves the hand.
      const kind = self.grenade?.kind;
      const cooking = self.grenade?.phase === 'cook' && kind === undefined;
      this.#text(this.#nadeCount, cooking ? Math.max(0, STATS.grenade.fuse.value - (self.grenade?.time ?? 0)).toFixed(1) : String(self.grenades));
      const nade = `nade frag${cooking ? ' cook' : self.grenades === 0 ? ' none' : ''}`;
      if (this.#nade.className !== nade) this.#nade.className = nade;
      const tactical = state.tactical ?? null;
      if (tactical !== this.#tacKind) {
        this.#tacKind = tactical;
        if (tactical) this.#set(this.#tac, `${icon(tactical)}<b>${self.tacticals}</b>`);
        this.#tac.setAttribute('aria-label', tactical === 'flash' ? 'Flash' : 'Smoke');
      }
      this.#style(this.#tac, 'display', tactical ? '' : 'none');
      if (tactical) {
        const count = this.#tac.querySelector('b') as HTMLElement;
        this.#text(count, String(self.tacticals));
        const tac = `nade tac${self.grenade?.phase === 'cook' && kind !== undefined ? ' cook' : self.tacticals === 0 ? ' none' : ''}`;
        if (this.#tac.className !== tac) this.#tac.className = tac;
      }
    }
    // The scope: the view through the glass once aimed (the viewmodel steps aside at the same point).
    this.#style(this.#scope, 'display', self?.alive && w && STATS.weapons[w.id].traits.sight === 'scope' && w.ads >= 0.9 ? 'block' : 'none');

    const stats: string[] = [];
    if (state.showFps) stats.push(`${Math.round(state.fps)} FPS`);
    if (state.showPing && state.ping !== null) stats.push(`${Math.round(state.ping)} ms`);
    this.#text(this.#stats, stats.join('  ·  '));
    const respawn = state.respawnIn === null ? '' : state.respawnIn > 0.05 ? `\nRespawning in ${Math.ceil(state.respawnIn)}` : '\nRespawning';
    // In Charge the dead wait for the next round, watching a teammate.
    const charge = state.charge ?? null;
    // Who they watch is on the spectator's panel.
    const waiting = charge ? '\nBack next round' : respawn;
    const banner = charge && (charge.state.phase === 'over' || charge.state.phase === 'freeze');
    // Out of a Battle Royale (or at its end), the placement and the spectator's bar say it instead.
    const royale = state.royale ?? null;
    const quiet = royale !== null || state.match?.status.mode === 'battle-royale';
    this.#text(this.#center, state.message ?? (self && !self.alive && !banner && !quiet ? `You died${waiting}` : ''));
    const prompt = state.message ? null : (state.prompt ?? null);
    this.#prompt.hidden = prompt === null;
    if (prompt !== null) this.#text(this.#prompt, prompt);

    this.#style(this.#overlay, 'display', state.showOverlay ? '' : 'none');
    if (state.showOverlay) this.#text(this.#dist, state.targetDistance === null ? '–' : `${state.targetDistance.toFixed(1)} m`);

    this.#updateMatch(state);
    this.#updateZones(state);
    this.#updateCharge(state);
    this.#updateRevive(self, state.action ?? null);
    this.#royale.update(royale);
    this.#royale.victory(state.victory ?? null);
    this.#card.update(state.matchCard ?? null);
    const recap = state.recap ?? null;
    this.#style(this.#recap, 'display', recap ? '' : 'none');
    if (recap) this.#set(this.#recap, recapHtml(recap));
    this.#pings.update(royale?.mapOpen ? [] : (state.pingMarks?.marks ?? []), state.pingMarks?.wheel ?? null);
    this.root.classList.toggle('royale', royale !== null);
    this.#updateCountdown(state);
    // The scoreboard is held open on Tab, and stays up for the vote after a match.
    const voting = state.match?.status.phase === 'vote';
    // A Battle Royale's card stands in the scoreboard's place at the end; Tab still opens the board.
    const board = (state.showScoreboard || (voting && !state.matchCard)) && state.scores.length > 0;
    this.#style(this.#board, 'display', board ? 'block' : 'none');
    this.#board.classList.toggle('end', voting);
    this.#board.classList.toggle('held', Boolean(state.showScoreboard));
    // The held board has the screen, and so does a Battle Royale's card: the feed steps back rather than show through or under it.
    this.root.classList.toggle('boarded', (board && !voting) || Boolean(state.matchCard));
    // The island map or the held board open, nothing else speaks over it.
    this.#style(this.#toast, 'visibility', royale?.mapOpen || (board && !voting) ? 'hidden' : 'visible');
    if (board) this.#set(this.#board, boardHtml(state));

    // The hint has the toast's place, and gives it up while a toast speaks.
    const hint = this.#toastTime > 0 ? null : (state.hint ?? null);
    if (this.#hint.hidden !== (hint === null)) this.#hint.hidden = hint === null;
    if (hint) this.#set(this.#hint, hintLineHtml(hint));
    if (this.#toastTime > 0) {
      this.#toastTime -= dt;
      if (this.#toastTime <= 0) this.#toast.style.opacity = '0';
    }
  }

  /** Sets an element's text only when it changed: rewriting it every frame would lay the HUD out again every frame. */
  #text(el: HTMLElement, text: string): void {
    if (this.#texts.get(el) === text) return;
    this.#texts.set(el, text);
    el.textContent = text;
  }

  /** Sets one inline style only when it changed, for the same reason. */
  #style(el: HTMLElement, prop: string, value: string): void {
    let styles = this.#styles.get(el);
    if (!styles) this.#styles.set(el, (styles = new Map()));
    if (styles.get(prop) === value) return;
    styles.set(prop, value);
    el.style.setProperty(prop, value);
  }

  /** The Outposts strip under the match bar (each zone's holder and capture), and a marker over each zone in the world. */
  #updateZones(state: HudState): void {
    const zones = state.match?.status.phase === 'playing' && state.self ? (state.zones ?? []) : [];
    this.#style(this.#zones, 'display', zones.length > 0 ? 'flex' : 'none');
    this.#set(
      this.#zones,
      zones
        .map(
          (z) =>
            `<div class="zone ds-t${z.owner}${z.contested ? ' contested' : ''}${z.inside ? ' here' : ''}"><b>${escape(z.id)}</b><span class="mark">${TEAMS[z.owner]?.mark ?? '·'}</span>${z.capturing ? `<i class="ds-t${z.capturing}" style="width:${Math.round(z.progress * 100)}%"></i>` : ''}</div>`,
        )
        .join(''),
    );
    for (const [id, marker] of this.#markers) {
      if (!zones.some((z) => z.id === id)) {
        marker.remove();
        this.#markers.delete(id);
      }
    }
    for (const z of zones) {
      let marker = this.#markers.get(z.id);
      if (!marker) {
        marker = document.createElement('div');
        this.root.append(marker);
        this.#markers.set(z.id, marker);
      }
      const cls = `ds-marker ds-t${z.owner}${z.contested ? ' contested' : ''}`;
      if (marker.className !== cls) marker.className = cls;
      this.#style(marker, 'display', z.inside ? 'none' : '');
      this.#style(marker, 'transform', `translate(${Math.round(z.x)}px, ${Math.round(z.y)}px) translate(-50%, -100%)`);
      this.#set(marker, `<b>${escape(z.id)}</b><small>${Math.round(z.distance)} m</small>`);
    }
  }

  /** Under the crosshair: Downed, the Bleed-out running out and any Revive coming; Reviving, how far along it is. */
  #updateRevive(self: PlayerOutput | null, action: { readonly label: string; readonly share: number } | null): void {
    const downed = self?.alive ? self.downed : null;
    const reviving = self?.alive ? self.reviving : null;
    this.#style(this.#revive, 'display', downed || (reviving !== null && reviving !== undefined) || action ? '' : 'none');
    const bar = (share: number, cls = '') => `<div class="bar"><i class="${cls}" style="width:${Math.round(share * 100)}%"></i></div>`;
    if (downed) {
      const left = bar(downed.bleedOut / STATS.royale.bleedOut.value, 'bleed');
      const shield = protectedFor(downed) > 0 ? '<div class="shield">Protected</div>' : '';
      this.#set(this.#revive, `${shield}<div>Bleed-out ${Math.ceil(downed.bleedOut)}</div>${left}${downed.revive > 0 ? `<div>Being Revived</div>${bar(downed.revive)}` : ''}`);
    } else if (reviving !== null && reviving !== undefined) this.#set(this.#revive, `<div>Reviving</div>${bar(reviving)}`);
    else if (action) this.#set(this.#revive, `<div>${escape(action.label)}</div>${bar(Math.max(0, Math.min(1, action.share)))}`);
  }

  /**
   * Charge: the round and what to do under the match bar, the plant or
   * defuse under way, the round-start countdown and the round's result, and
   * markers over the sites and the charge.
   */
  #updateCharge(state: HudState): void {
    const c = state.match?.status.phase === 'playing' ? (state.charge ?? null) : null;
    this.#style(this.#charge, 'display', c ? '' : 'none');
    this.#style(this.#action, 'display', c?.state.action && c.acting ? '' : 'none');
    this.#style(this.#round, 'display', c && (c.state.phase === 'freeze' || c.state.phase === 'over') ? '' : 'none');
    const markers = c ? c.markers : [];
    for (const [key, marker] of this.#chargeMarkers) {
      if (!markers.some((m) => m.key === key)) {
        marker.remove();
        this.#chargeMarkers.delete(key);
      }
    }
    if (!c) return;
    for (const m of markers) {
      let marker = this.#chargeMarkers.get(m.key);
      if (!marker) {
        marker = document.createElement('div');
        this.root.append(marker);
        this.#chargeMarkers.set(m.key, marker);
      }
      const cls = `ds-marker ${m.kind === 'target' ? 'site target' : m.kind}`;
      if (marker.className !== cls) marker.className = cls;
      this.#style(marker, 'transform', `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px) translate(-50%, -100%)`);
      this.#set(marker, `<b>${escape(m.label)}</b><small>${Math.round(m.distance)} m</small>`);
    }
    const s = c.state;
    const sites = c.attacking ? 'A or B' : 'A and B';
    const planted = s.planted ? `Charge planted at ${s.planted.site}` : null;
    let what: string;
    let alert = false;
    if (s.action && !c.acting && c.actor) what = `${c.actor} is ${s.action.kind === 'plant' ? 'planting' : 'defusing'}`;
    else if (planted) {
      what = `${planted} · ${c.attacking ? 'guard it' : 'defuse it'}`;
      alert = !c.attacking;
    } else if (c.attacking) what = c.carrying ? `You carry the charge · plant it at ${sites}` : c.carrier ? `Escort ${c.carrier}` : s.dropped ? 'The charge is down · pick it up' : 'Attack';
    else what = s.dropped ? `The charge is down · defend ${sites}` : `Defend ${sites}`;
    this.#set(
      this.#charge,
      `<div class="side">Round ${s.round} · ${c.attacking ? 'Attacking' : 'Defending'}</div><div class="what${alert ? ' alert' : ''}">${escape(what)}</div>`,
    );
    if (s.action && c.acting) {
      this.#set(this.#action, `${s.action.kind === 'plant' ? 'Planting' : 'Defusing'}<div class="bar"><i style="width:${Math.round(s.action.progress * 100)}%"></i></div>`);
    }
    if (s.phase === 'freeze') {
      this.#set(this.#round, `<div class="sub">Round ${s.round} · ${c.attacking ? 'Attack' : 'Defend'}</div><h2>${Math.max(1, Math.ceil(s.remaining))}</h2><div class="goal">${escape(goalLine({ mode: 'charge', killLimit: null }, c.attacking))}</div>`);
    } else if (s.phase === 'over' && s.outcome) {
      const won = TEAMS[s.outcome.winner];
      this.#set(this.#round, `<div class="sub">${ROUND_REASONS[s.outcome.reason]}</div><h2 class="ds-t${s.outcome.winner}">${won?.mark ?? ''} ${won?.name ?? 'Team'} wins the round</h2>`);
    }
  }

  /** The match's opening countdown, big in the middle as Charge's freeze is (Charge has no countdown of its own). */
  #updateCountdown(state: HudState): void {
    const view = state.match;
    // A Battle Royale opens with its Preparation instead, which the page shows.
    const left = view?.status.phase === 'playing' && view.status.mode !== 'battle-royale' ? (view.countdown ?? null) : null;
    if (left === null || left <= 0) {
      if (!state.charge) this.#style(this.#round, 'display', 'none');
      return;
    }
    this.#style(this.#round, 'display', '');
    this.#set(this.#round, `<div class="sub">${escape(MODE_NAMES[view!.status.mode] ?? view!.status.mode)}</div><h2>${Math.max(1, Math.ceil(left))}</h2><div class="goal">${escape(goalLine(view!.status))}</div>`);
  }

  /** The match bar (team scores or the leader, the clock, the mode) and, after a match, the result, your line and the vote. */
  #updateMatch(state: HudState): void {
    const view = state.match;
    // A Battle Royale has its own bar: the compass, the count and the Ring.
    this.#style(this.#match, 'display', view && view.status.phase === 'playing' && !state.royale ? 'flex' : 'none');
    this.#style(this.#end, 'display', view && !state.victory && !state.matchCard && (view.status.phase === 'nuke' || view.status.phase === 'vote') ? 'block' : 'none');
    // The Charge portraits widen the bar into the kill feed's corner, so the feed steps down under it.
    this.root.classList.toggle('rostered', view?.status.phase === 'playing' && (state.charge?.roster.length ?? 0) > 0);
    if (!view) return;
    const s = view.status;
    const left = view.secondsLeft === null ? '' : clock(view.secondsLeft);
    if (s.phase === 'playing') {
      const bar = matchBar(s, state.scores, state.selfId, view.team);
      // A Charge round's clock is a round's: its last half minute in red, but not the countdown to it. Every other
      // match's clock runs out on the bomb, and its last minute counts T-minus (ticket 24).
      const round = s.mode === 'charge';
      const low = round && state.charge?.state.phase !== 'freeze' && view.secondsLeft !== null && view.secondsLeft <= 30;
      const bomb = round ? null : view.secondsLeft;
      const face = bomb !== null ? matchClockHtml(bomb) : `<span class="clock${low ? ' low' : ''}">${left || '–'}</span>`;
      const mid = `<div class="mid">${face}<span class="sub">${MODE_SHORT[s.mode] ?? s.mode.toUpperCase()}${bar.limit === null ? '' : ` · ${bar.limit}`}</span></div>`;
      if (bar.kind === 'tdm') {
        // Each side's way to the limit, under its score.
        const [a, b] = bar.teams.map(
          (t, i) =>
            `<div class="team ${i === 0 ? 'l' : 'r'} ds-t${t.team}${t.mine ? ' mine' : ''}"><span class="score">${t.score}</span><span class="sub">${TEAMS[t.team]!.mark} ${TEAMS[t.team]!.name}${t.mine ? ' · you' : ''}</span>${bar.limit ? `<span class="prog"><i style="width:${Math.min(100, Math.round((t.score / bar.limit) * 100))}%"></i></span>` : ''}</div>`,
        );
        // Charge: each side's portraits outside its score, greyed and struck through once dead.
        const roster = state.charge?.roster;
        const side = (team: number | undefined, end: 'l' | 'r') => {
          const cards = roster?.find((r) => r.team === team)?.cards ?? [];
          return cards.length > 0 ? `<div class="roster ${end}">${cards.map(rosterCard).join('')}</div>` : '';
        };
        this.#set(this.#match, `${side(bar.teams[0]?.team, 'l')}${a}${mid}${b}${side(bar.teams[1]?.team, 'r')}`);
      } else if (bar.kind === 'gungame') {
        const leader = bar.leader ? `<span class="name">${escape(bar.leader.name)}</span><span class="sub">Leader · gun ${bar.leader.level}/${bar.limit}</span>` : '<span class="name">–</span><span class="sub">Leader</span>';
        const y = bar.you;
        const next = y ? ` · ${y.toNext} to ${y.next ? escape(STATS.weapons[y.next].traits.name) : 'win'}` : '';
        const you = y ? `<span class="score">${y.level}/${bar.limit}</span><span class="sub">You · ${ordinal(y.place)}${next}</span>` : '<span class="score">–</span><span class="sub">You</span>';
        this.#set(this.#match, `<div class="team">${leader}</div>${mid}<div class="team">${you}</div>`);
      } else {
        const leader = bar.leader ? `<span class="name">${escape(bar.leader.name)}</span><span class="sub">Leader · ${bar.leader.kills}</span>` : '<span class="name">–</span><span class="sub">Leader</span>';
        const you = bar.you ? `<span class="score">${bar.you.kills}</span><span class="sub">You · ${ordinal(bar.you.place)}</span>` : '<span class="score">–</span><span class="sub">You</span>';
        this.#set(this.#match, `<div class="team">${leader}</div>${mid}<div class="team">${you}</div>`);
      }
      // The last minute's clock and fuse move many times a second: painted into the bar, not written with it.
      this.#clock.paint(this.#match, bomb);
      return;
    }
    const end = endSummary(s.result, s.mode, state.scores, state.selfId);
    const h = end.headline;
    // One line: your result where you had a side, else who won; how it ended only when that isn't the usual limit. The scoreboard under it names the mode.
    const reason = s.result ? END_REASONS[s.result.reason] : '';
    const result =
      h.kind === 'draw'
        ? 'Draw'
        : h.kind === 'team'
          ? view.team !== null
            ? h.won ? `<span class="ds-t${h.team}">Victory</span>` : 'Defeat'
            : `<span class="ds-t${h.team}">${TEAMS[h.team]?.mark ?? ''} ${TEAMS[h.team]?.name ?? 'Team'} wins</span>`
          : h.kind === 'player'
            ? h.you
              ? 'You win'
              : `${escape(h.name)} ${h.verb}`
            : reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : 'Match over';
    const headline = h.kind !== 'unknown' && s.result?.reason === 'forfeit' ? `${result} by forfeit` : result;
    let head = `<h2>${headline}</h2>`;
    // The MVP: the highest Score of the match, with their kills and best Medal.
    const mvp = mvpOf(state.scores, state.selfId);
    if (mvp) {
      head += `<div class="mvp ds-plate"><span>MVP</span><b class="who">${mvp.you ? 'You' : playerName(mvp.name, mvp.bot)}</b><span><b>${figure(mvp.score)}</b> score</span><span><b>${mvp.kills}</b> kills</span>${mvp.medal ? `<span>Best Medal <b>${escape(medalName(mvp.medal))}</b></span>` : ''}</div>`;
    }
    let changed = this.#set(this.#endHead, head);
    // Your match: your numbers and, once the match is banked, what it paid.
    const place = s.mode === 'battle-royale' ? placement(state.scores, state.selfId) : null;
    const y = end.you;
    const cells: (readonly [string, string])[] = !y
      ? []
      : place
        ? // A Battle Royale's result is the place: it leads.
          [['Place', `${ordinal(place.place)}<small> / ${place.of} Squads</small>`], ['Score', figure(y.score)], ['Kills', String(y.kills)]]
        : [['Score', figure(y.score)], ['Kills', String(y.kills)], ['Deaths', String(y.deaths)], ['Assists', String(y.assists)], ['Place', `${ordinal(y.place)}<small> / ${y.of}</small>`]];
    changed = this.#set(this.#endMine, cells.length > 0 ? `<span class="ds-label">Your match</span>${matchGainHtml(cells, state.gain ?? null)}` : '') || changed;
    let html = '';
    if (s.phase === 'nuke') html += `<div class="next board">Scoreboard in ${left}</div>`;
    else if (s.lobby) html += `<div class="next">Back to the lobby in ${left}</div>`;
    else if (s.phase === 'vote') {
      const total = Math.max(1, s.votes.tdm + s.votes.ffa);
      html += `<div class="vote ds-plate"><header><span class="ds-label">Vote for the next mode</span><span class="clock">${left}</span></header><div class="ds-votes">`;
      for (const [i, mode] of (['tdm', 'ffa'] as const).entries()) {
        html += `<button data-mode="${mode}" class="${view.myVote === mode ? 'mine' : ''}"><span class="key"><span class="kb">[${i + 1}] · D-pad ${i === 0 ? '◀' : '▶'}</span><span class="tp">Tap to vote</span></span><span class="mode">${MODE_NAMES[mode]}</span><span class="n">${s.votes[mode]}</span><span class="tally"><i style="width:${(s.votes[mode] / total) * 100}%"></i></span></button>`;
      }
      html += `</div><div class="next">Next match: ${MODE_NAMES[s.next]}${s.votes.tdm + s.votes.ffa === 0 ? ' (no votes: the mode stays)' : ''}</div></div>`;
    }
    changed = this.#set(this.#endNext, html) || changed;
    // How far down the end panel comes, for the board that stands under it: measured when the panel changed (its
    // countdown, once a second), and until it has a size at all.
    if (!changed && this.#endFoot > 0) return;
    const foot = Math.round(this.#end.getBoundingClientRect().bottom);
    if (foot > 0 && foot !== this.#endFoot) this.root.style.setProperty('--ds-end-foot', `${(this.#endFoot = foot)}px`);
  }

  /**
   * Replaces an element's markup only when it changed: rebuilt every frame,
   * the vote buttons would be swapped out between a mouse press and its release.
   */
  #set(el: HTMLElement, html: string): boolean {
    if (this.#html.get(el) === html) return false;
    this.#html.set(el, html);
    el.innerHTML = html;
    return true;
  }

  /** The crosshair as the player set it (shape, size, gap, thickness, colour, dot, and whether it opens with the spread). */
  set crosshair(options: CrosshairOptions) {
    this.#cross.options = options;
  }

  /** The HUD-scale setting, 0.8 to 1.3: the readouts at the corners and edges, each from its own corner (see hud/scale.ts). */
  set scale(scale: number) {
    this.root.style.setProperty('--ds-hud-scale', String(Math.min(HUD_SCALE_LIMITS[1], Math.max(HUD_SCALE_LIMITS[0], scale))));
  }

  /** A caption for a line the announcer says, taking `speech` seconds to say; null clears it. */
  caption(line: string | null, speech = 0): void {
    this.#captions.show(line, speech);
  }

  dispose(): void {
    this.root.remove();
  }
}
const SKINS = ['#e3b994', '#c99a74', '#b07c58', '#8a5a3c', '#5e3c28'];
const HAIR = ['#231c17', '#4a3222', '#8c6a3c', '#2e2e33'];
const portraits = new Map<string, string>();

/** A small hash of a name, so the same player always gets the same face. */
function nameHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A player's profile picture: a soldier's head and shoulders in their team's
 * kit, with the skin, hair, beard and headgear (helmet, cap, beanie or
 * headset) picked from their name.
 */
function portrait(name: string, team: number): string {
  // The kit is the team's colours as they are drawn now (the colour-vision setting swaps them).
  const key = `${colourVision()}:${team}:${name}`;
  const cached = portraits.get(key);
  if (cached) return cached;
  const h = nameHash(name);
  const colours = teamColours(team) ?? teamColours(1)!;
  const look = { ...colours, accent: colours.colour };
  const skin = SKINS[h % SKINS.length]!;
  const hair = HAIR[(h >>> 4) % HAIR.length]!;
  const gear = (h >>> 8) % 4;
  const beard = (h >>> 12) % 3 === 0;
  const goggles = (h >>> 14) % 2 === 0;
  const dark = '#1d1f24';
  const headgear = [
    `<path d="M12.2 17Q11.4 6.8 20 6.8Q28.6 6.8 27.8 17L26.7 14.3Q20 12.4 13.3 14.3Z" fill="${look.helmet}"/><path d="M12.2 17L13.3 14.3Q20 12.4 26.7 14.3L27.8 17" fill="none" stroke="#0006" stroke-width=".7"/>${goggles ? `<rect x="14" y="9.6" width="12" height="3" rx="1.4" fill="${look.accent}" opacity=".85"/>` : ''}`,
    `<path d="M13.4 17Q12.8 12 14 11L26 11Q27.2 12 26.6 17Z" fill="${hair}"/><path d="M13.2 14Q13 7.8 20 7.8Q27 7.8 26.8 14Z" fill="${look.helmet}"/><path d="M12.4 14.3Q20 12.2 27.6 14.3L27.1 15.5Q20 13.7 12.9 15.5Z" fill="${look.vest}"/>`,
    `<path d="M13 14.6Q12.6 6.6 20 6.6Q27.4 6.6 27 14.6Z" fill="${look.vest}"/><rect x="12.6" y="12.2" width="14.8" height="3" rx="1.2" fill="${look.uniform}"/>`,
    `<path d="M13.3 15Q12.6 8.6 20 8.6Q27.4 8.6 26.7 15Q25 11.6 20 11.4Q15 11.6 13.3 15Z" fill="${hair}"/><path d="M12.6 17Q12 6.4 20 6.4Q28 6.4 27.4 17" fill="none" stroke="${dark}" stroke-width="1.3"/><rect x="11" y="15" width="3.2" height="5.4" rx="1.2" fill="${dark}"/><rect x="25.8" y="15" width="3.2" height="5.4" rx="1.2" fill="${dark}"/><path d="M12.6 20Q13.4 23.6 17 23.2" fill="none" stroke="${dark}" stroke-width=".8"/>`,
  ][gear];
  const svg =
    `<svg viewBox="0 0 40 40" aria-hidden="true">` +
    `<path d="M3 40C4 31 10 27.5 20 27.5S36 31 37 40Z" fill="${look.uniform}"/>` +
    `<path d="M10.5 40L11.5 30.5Q20 33.5 28.5 30.5L29.5 40Z" fill="${look.vest}"/>` +
    `<path d="M4.5 34Q6 29 11 28.2L11.6 31Q7 32 5.5 35Z" fill="${look.accent}"/><path d="M35.5 34Q34 29 29 28.2L28.4 31Q33 32 34.5 35Z" fill="${look.accent}"/>` +
    `<rect x="16.5" y="21" width="7" height="8" rx="2" fill="${skin}"/><rect x="16.5" y="24" width="7" height="5" fill="#000" opacity=".18"/>` +
    `<circle cx="13.4" cy="18" r="1.5" fill="${skin}"/><circle cx="26.6" cy="18" r="1.5" fill="${skin}"/>` +
    `<ellipse cx="20" cy="17" rx="6.6" ry="7.8" fill="${skin}"/>` +
    `<rect x="16.2" y="16.6" width="2.2" height="1.3" rx=".6" fill="#1a1512"/><rect x="21.6" y="16.6" width="2.2" height="1.3" rx=".6" fill="#1a1512"/>` +
    (beard ? `<path d="M13.6 18.5Q14 25.6 20 25.6Q26 25.6 26.4 18.5Q25 23.2 20 23.2Q15 23.2 13.6 18.5Z" fill="${hair}"/>` : `<path d="M18.3 21.8H21.7" stroke="#0005" stroke-width=".8"/>`) +
    headgear +
    `</svg>`;
  portraits.set(key, svg);
  return svg;
}

/** One portrait on the Charge bar: dead struck through, your own outlined, with your side's health and carrier. */
function rosterCard(c: RosterCard): string {
  const hp = c.health === null ? '' : `<span class="hp${c.health <= 35 ? ' low' : ''}"><span style="width:${c.health}%"></span></span>`;
  return `<div class="ds-pc ds-t${c.team}${c.alive ? '' : ' dead'}${c.you ? ' you' : ''}">${portrait(c.name, c.team)}${c.carrier ? '<b class="carry">◆</b>' : ''}${hp}</div>`;
}

/** A player's name as HTML, with a BOT tag on bots, in their team's colour when given one. */
function playerName(name: string, bot: boolean, team?: number): string {
  const html = `${escape(name)}${bot ? '<span class="ds-bot">bot</span>' : ''}`;
  return team === undefined || !TEAMS[team] ? html : `<span class="ds-t${team}">${html}</span>`;
}

/** A column's head: the word, and the initial a narrow board shows in its place. */
const colHead = (word: string) => `<th><span class="w">${word}</span><span class="n" title="${word}">${word[0]}</span></th>`;

/** The held scoreboard: both teams side by side, or the free-for-all ranking; each row its Score, kills, deaths, assists and ping, the highest Score first. */
function boardHtml(state: HudState): string {
  const mode: ModeId = state.match?.status.mode ?? 'ffa';
  const board = scoreboard(state.scores, mode, state.pings, state.match?.status.teamScores ?? null);
  const levels = board.kind === 'ffa' && board.levels;
  const table = (rows: readonly BoardRow[]) =>
    `<table><tr><th>#</th><th>Player</th>${levels ? '<th>Gun</th>' : ''}<th>Score</th>${colHead('Kills')}${colHead('Deaths')}${colHead('Assists')}<th>Ping</th></tr>${rows
      .map(
        (r) =>
          `<tr class="${r.id === state.selfId ? 'you' : ''}"><td class="place">${r.place}</td><td>${playerName(r.name, r.bot)}</td>${levels ? `<td>${r.level}</td>` : ''}<td class="score">${figure(r.score)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td class="ping">${r.ping === null ? '–' : r.ping}</td></tr>`,
      )
      .join('')}</table>`;
  // The goal stays findable after the countdown: the board says what wins beside the mode's name.
  const goal = state.match ? `<span class="goal">${escape(goalLine(state.match.status))}</span>` : '';
  const header = `<header><b>${escape(MODE_NAMES[mode] ?? mode)}</b>${goal}<span class="ds-label">${state.scores.length} players</span></header>`;
  if (board.kind === 'ffa') return `${header}<div class="cols one"><div>${table(board.rows)}</div></div>`;
  return `${header}<div class="cols">${board.teams
    .map((t) => `<div><h3 class="ds-t${t.team}"><span>${TEAMS[t.team]!.mark} ${TEAMS[t.team]!.name}</span><span class="total">${t.score}</span></h3>${table(t.rows)}</div>`)
    .join('')}</div>`;
}
