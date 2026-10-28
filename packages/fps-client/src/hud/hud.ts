import { STATS, type ChargeState, type MatchStatus, type ModeId, type PlayerOutput, type RoundReason, type Score } from '@duty-shooter/fps-core';
import { END_REASONS, MODE_NAMES, TEAMS, endSummary, matchBar, ordinal, scoreboard, type BoardRow, type RosterCard } from '../ui/model';
import { escapeHtml as escape, installTheme } from '../ui/theme';

const CSS = `
.ds-hud { position: fixed; inset: 0; pointer-events: none; font: 400 14px/1.2 var(--ds-font); color: var(--ds-text); text-shadow: 0 1px 2px rgb(0 0 0 / 0.7); user-select: none; z-index: 5; }
.ds-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: opacity 80ms linear; }
.ds-cross i { position: absolute; background: #fff; box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.55); }
.ds-cross i.h { width: 9px; height: 2px; top: -1px; }
.ds-cross i.v { width: 2px; height: 9px; left: -1px; }
.ds-cross b { position: absolute; left: -1px; top: -1px; width: 2px; height: 2px; background: #fff; box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.5); }
.ds-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
.ds-hit i { position: absolute; width: 11px; height: 2.4px; background: #fff; left: -5.5px; top: -1.2px; box-shadow: 0 0 2px rgb(0 0 0 / 0.6); }
.ds-hit.kill i { background: var(--ds-alert); }
.ds-hit.head i { width: 15px; left: -7.5px; height: 3px; }
.ds-elim { position: absolute; left: 50%; top: calc(50% + 64px); transform: translateX(-50%); text-align: center; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0; white-space: nowrap; }
.ds-elim .what { font-size: 12px; color: var(--ds-alert); }
.ds-elim .what.head { color: var(--ds-signal); }
.ds-elim .who { font-size: 20px; font-weight: 700; letter-spacing: 0.06em; }
.ds-dmg { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.ds-dmg div { position: absolute; left: -70px; top: -230px; width: 140px; height: 40px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; border-top: 6px solid rgb(255 97 89 / 0.85); filter: blur(0.6px); transform-origin: 70px 230px; }
.ds-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgb(140 0 0 / 0.75) 100%); opacity: 0; }
.ds-plate { background: linear-gradient(180deg, rgb(12 15 21 / 0.8), rgb(12 15 21 / 0.64)); border: 1px solid rgb(243 241 234 / 0.08); border-radius: 2px; text-shadow: none; }
.ds-ammo { position: absolute; right: 0; bottom: 0; min-width: 300px; padding: 0 32px 26px 60px; text-align: right; background: radial-gradient(ellipse at 100% 100%, rgb(7 9 13 / 0.62), rgb(7 9 13 / 0) 70%); }
.ds-ammo .mag { font-size: 54px; font-weight: 700; line-height: 0.9; letter-spacing: 0.01em; }
.ds-ammo .mag.low { color: var(--ds-alert); }
.ds-ammo .res { font-size: 20px; color: var(--ds-text-2); margin-left: 8px; }
.ds-ammo .gun { display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; margin-bottom: 4px; font-size: 15px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-ammo .gun small { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; padding: 2px 5px 1px; border: 1px solid var(--ds-line-2); color: var(--ds-text-2); }
.ds-ammo .nade { display: inline-flex; align-items: center; gap: 5px; margin-right: 16px; padding: 3px 8px; border: 1px solid var(--ds-line-2); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: var(--ds-text); vertical-align: 10px; }
.ds-ammo .nade.none { color: var(--ds-text-3); opacity: 0.45; }
.ds-ammo .nade.cook { color: var(--ds-alert); border-color: var(--ds-alert); }
.ds-scope { position: absolute; inset: 0; display: none; background: radial-gradient(circle at center, transparent 0, transparent 38vmin, rgb(0 0 0 / 0.55) 38.3vmin, #000 39vmin); }
.ds-scope i { position: absolute; background: #000; }
.ds-scope i.h { left: calc(50% - 38vmin); right: calc(50% - 38vmin); top: calc(50% - 1px); height: 2px; }
.ds-scope i.v { top: calc(50% - 38vmin); bottom: calc(50% - 38vmin); left: calc(50% - 1px); width: 2px; }
.ds-scope i.h.thick { left: calc(50% - 38vmin); right: calc(50% + 8vmin); height: 5px; top: calc(50% - 2.5px); }
.ds-scope i.h.thick.r { left: calc(50% + 8vmin); right: calc(50% - 38vmin); }
.ds-scope i.v.thick { top: calc(50% + 8vmin); bottom: calc(50% - 38vmin); width: 5px; left: calc(50% - 2.5px); }
.ds-ammo .bar, .ds-health .bar { position: relative; height: 5px; background: rgb(243 241 234 / 0.16); margin-top: 10px; overflow: hidden; }
.ds-health .bar::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), rgb(7 9 13 / 0.85) calc(10% - 2px) 10%); }
.ds-ammo .bar { width: 220px; margin-left: auto; }
.ds-ammo .bar i, .ds-health .bar i { display: block; height: 100%; width: 100%; background: var(--ds-text); transform-origin: 0 50%; transition: transform 120ms linear; }
.ds-ammo .mag.low ~ .bar i { background: var(--ds-alert); }
.ds-health { position: absolute; left: 0; bottom: 0; min-width: 300px; padding: 0 60px 26px 32px; background: radial-gradient(ellipse at 0% 100%, rgb(7 9 13 / 0.62), rgb(7 9 13 / 0) 70%); }
.ds-health .ds-label { display: flex; align-items: center; gap: 8px; color: var(--ds-text-2); }
.ds-health .ds-label::before { content: '✚'; font-size: 13px; color: var(--ds-signal); }
.ds-health.low .ds-label::before { color: var(--ds-alert); }
.ds-health .bar { width: 236px; }
.ds-health .hp { font-size: 48px; font-weight: 700; line-height: 0.9; margin-top: 6px; }
.ds-health.low .hp { color: var(--ds-alert); }
.ds-health.low .bar i { background: var(--ds-alert); }
.ds-feed { position: absolute; right: 24px; top: 24px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ds-feed div { display: flex; align-items: center; background: linear-gradient(270deg, rgb(12 15 21 / 0.8), rgb(12 15 21 / 0.55)); padding: 5px 12px; border-radius: 2px; text-shadow: none; font-size: 14px; transition: opacity 400ms linear; animation: ds-slide 160ms ease-out; }
.ds-hud.rostered .ds-feed { top: 84px; }
.ds-feed .you { box-shadow: inset 3px 0 0 var(--ds-signal); background: linear-gradient(270deg, rgb(143 227 200 / 0.22), rgb(12 15 21 / 0.7)); }
.ds-bot { display: inline-block; margin-left: 5px; padding: 0 3px; border: 1px solid currentColor; border-radius: 2px; color: var(--ds-text-3); font-size: 9px; line-height: 12px; letter-spacing: 0.08em; vertical-align: 1px; }
.ds-zones { position: absolute; left: 50%; top: 86px; transform: translateX(-50%); display: flex; gap: 6px; }
.ds-zones .zone { position: relative; width: 40px; height: 40px; border: 2px solid currentColor; border-radius: 2px; background: rgb(11 14 19 / 0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: var(--ds-text-3); }
.ds-zones .zone.ds-t1 { color: var(--ds-blue); background: rgb(61 139 255 / 0.28); }
.ds-zones .zone.ds-t2 { color: var(--ds-orange); background: rgb(255 154 60 / 0.28); }
.ds-zones .zone b { font-size: 17px; line-height: 1; color: var(--ds-text); }
.ds-zones .zone .mark { font-size: 9px; line-height: 1; margin-top: 2px; }
.ds-zones .zone i { position: absolute; left: 0; bottom: 0; height: 4px; background: currentColor; }
.ds-zones .zone.here { box-shadow: 0 0 0 2px rgb(243 241 234 / 0.5); }
.ds-zones .zone.contested { animation: ds-blink 0.6s steps(2) infinite; }
@keyframes ds-blink { 50% { border-color: var(--ds-alert); } }
.ds-marker { position: absolute; left: 0; top: 0; will-change: transform; display: flex; flex-direction: column; align-items: center; color: var(--ds-text-3); }
.ds-marker b { width: 26px; height: 26px; border: 2px solid currentColor; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--ds-text); background: rgb(11 14 19 / 0.5); }
.ds-marker.ds-t1 { color: var(--ds-blue); }
.ds-marker.ds-t2 { color: var(--ds-orange); }
.ds-marker.ds-t1 b { background: rgb(61 139 255 / 0.4); }
.ds-marker.ds-t2 b { background: rgb(255 154 60 / 0.4); }
.ds-marker small { font-size: 11px; margin-top: 2px; color: var(--ds-text-2); }
.ds-marker.contested b { border-color: var(--ds-alert); }
.ds-marker.site b { border-radius: 4px; }
.ds-marker.target b { border-color: var(--ds-signal); }
.ds-marker.charge b { border-color: var(--ds-alert); color: var(--ds-alert); }
.ds-marker.planted b { border-color: var(--ds-alert); color: var(--ds-alert); animation: ds-blink 0.5s steps(2) infinite; }
.ds-charge { position: absolute; left: 50%; top: 86px; transform: translateX(-50%); padding: 6px 14px; text-align: center; white-space: nowrap; }
.ds-charge .side { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-charge .what { font-size: 15px; margin-top: 3px; }
.ds-charge .what.alert { color: var(--ds-alert); }
.ds-action { position: absolute; left: 50%; top: calc(50% + 48px); transform: translateX(-50%); width: 220px; padding: 8px 12px; text-align: center; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
.ds-action .bar { height: 5px; margin-top: 6px; background: rgb(243 241 234 / 0.18); border-radius: 2px; overflow: hidden; }
.ds-action .bar i { display: block; height: 100%; background: var(--ds-signal); }
.ds-round { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; animation: ds-in 160ms ease-out; }
.ds-round .sub { font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text); text-shadow: 0 1px 8px rgb(0 0 0 / 0.85); }
.ds-round h2 { margin: 6px 0 0; font-size: 46px; line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 2px 12px rgb(0 0 0 / 0.6); }
.ds-feed .gun { color: var(--ds-text-3); margin: 0 8px; font-size: 12px; letter-spacing: 0.08em; }
.ds-stats { position: absolute; left: 24px; top: 20px; padding: 3px 8px; background: rgb(7 9 13 / 0.45); font-size: 12px; font-weight: 700; color: var(--ds-text-2); letter-spacing: 0.08em; text-shadow: none; }
.ds-stats:empty { display: none; }
.ds-match { position: absolute; left: 50%; top: 24px; transform: translateX(-50%); width: max-content; display: flex; align-items: stretch; gap: 0; padding: 0; overflow: hidden; }
.ds-match > div { padding: 6px 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ds-match .score { font-size: 30px; font-weight: 700; line-height: 1; }
.ds-match .team { min-width: 92px; }
.ds-match .team.mine { background: linear-gradient(0deg, rgb(243 241 234 / 0.1), rgb(243 241 234 / 0.02)); }
.ds-match .team { position: relative; }
.ds-match .team .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgb(243 241 234 / 0.12); }
.ds-match .team .prog i { display: block; height: 100%; background: currentColor; }
.ds-match .team.r .prog i { margin-left: auto; }
.ds-match .mid { border-left: 1px solid var(--ds-line); border-right: 1px solid var(--ds-line); min-width: 96px; }
.ds-match .clock { font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
.ds-match .clock.low { color: var(--ds-alert); }
.ds-match .sub { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); margin-top: 2px; }
.ds-match > .roster { flex-direction: row; gap: 4px; padding: 6px 8px; }
.ds-match > .roster.l { flex-direction: row-reverse; }
.ds-pc { position: relative; width: 34px; height: 38px; border-radius: 3px; overflow: hidden; box-shadow: inset 0 -2px 0 currentColor; }
.ds-pc.ds-t1 { background: linear-gradient(#24406a, #14223a); }
.ds-pc.ds-t2 { background: linear-gradient(#5e3b1c, #2e1d0f); }
.ds-pc svg { position: absolute; left: 0; bottom: 0; width: 34px; height: 34px; }
.ds-pc.you { box-shadow: inset 0 -2px 0 currentColor, inset 0 0 0 1px var(--ds-signal); }
.ds-pc.dead { box-shadow: none; background: #191c22; }
.ds-pc.dead svg { filter: grayscale(1) brightness(0.45); opacity: 0.8; }
.ds-pc.dead::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top right, transparent calc(50% - 1.2px), var(--ds-alert) calc(50% - 1.2px), var(--ds-alert) calc(50% + 1.2px), transparent calc(50% + 1.2px)); opacity: 0.9; }
.ds-pc .carry { position: absolute; right: 2px; top: 1px; font-size: 10px; line-height: 1; color: var(--ds-alert); text-shadow: 0 0 2px #000; }
.ds-pc .hp { position: absolute; left: 3px; right: 3px; bottom: 4px; height: 2px; background: rgb(0 0 0 / 0.55); }
.ds-pc .hp span { display: block; height: 100%; background: var(--ds-text); }
.ds-pc .hp.low span { background: var(--ds-alert); }
.ds-match .name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.ds-prompt { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); padding: 6px 12px; font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; }
.ds-prompt[hidden] { display: none; }
.ds-dmgnum { position: absolute; transform: translate(-50%, -100%); text-align: center; pointer-events: none; text-shadow: 0 1px 4px rgb(0 0 0 / 0.8); animation: ds-dmgnum 1.4s ease-out forwards; }
.ds-dmgnum b { display: block; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ds-dmgnum.head b { color: var(--ds-alert); }
.ds-dmgnum small { display: block; font-size: 11px; letter-spacing: 0.1em; color: var(--ds-text-2); }
@keyframes ds-dmgnum { 0% { opacity: 0; margin-top: 6px; } 10% { opacity: 1; margin-top: 0; } 70% { opacity: 1; } 100% { opacity: 0; margin-top: -34px; } }
.ds-center { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: 22px; letter-spacing: 0.16em; text-transform: uppercase; text-align: center; white-space: pre-line; line-height: 1.6; }
.ds-overlay { position: absolute; left: 24px; bottom: 112px; padding: 10px 12px; font-size: 13px; display: grid; grid-template-columns: auto auto; gap: 2px 14px; align-items: center; }
.ds-overlay canvas { grid-column: 1 / 3; margin-top: 6px; background: rgb(0 0 0 / 0.35); }
.ds-overlay .k { color: var(--ds-text-3); text-transform: uppercase; font-size: 11px; letter-spacing: 0.16em; }
.ds-board { position: absolute; z-index: 2; left: 50%; top: 142px; max-height: calc(100vh - 290px); overflow: hidden; transform: translateX(-50%); width: min(920px, calc(100vw - 64px)); padding: 0; display: none; background: rgb(12 15 21 / 0.92); border: 1px solid var(--ds-line); border-top: 3px solid var(--ds-signal); text-shadow: none; animation: ds-fade 100ms ease-out; }
.ds-board > header { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 20px 12px; border-bottom: 1px solid var(--ds-line); }
.ds-board > header b { font-size: 20px; letter-spacing: 0.06em; text-transform: uppercase; }
.ds-board .cols { padding: 14px 20px 18px; }
.ds-board.end { top: auto; bottom: 56px; }
.ds-board .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.ds-board .cols.one { grid-template-columns: 1fr; }
.ds-board h3 { margin: 0 0 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; font-size: 17px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: linear-gradient(90deg, currentColor -400%, transparent 140%); border-left: 3px solid currentColor; }
.ds-board h3 > span:first-child { color: var(--ds-text); }
.ds-board h3 .total { font-size: 28px; line-height: 1; }
.ds-board table { width: 100%; border-collapse: collapse; }
.ds-board th { text-align: right; font-size: 11px; font-weight: 400; letter-spacing: 0.16em; color: var(--ds-text-3); padding: 4px 8px; text-transform: uppercase; }
.ds-board th:nth-child(-n+2), .ds-board td:nth-child(-n+2) { text-align: left; }
.ds-board td { padding: 7px 8px; border-top: 1px solid var(--ds-line); text-align: right; font-size: 15px; }
.ds-board td:nth-child(2) { font-weight: 700; }
.ds-board td.place { color: var(--ds-text-3); width: 36px; }
.ds-board tr.you td { background: rgb(143 227 200 / 0.14); }
.ds-board tr.you td:first-child { box-shadow: inset 3px 0 0 var(--ds-signal); }
.ds-board .ping { color: var(--ds-text-2); }
.ds-end { position: absolute; left: 50%; top: 56px; transform: translateX(-50%); width: min(880px, calc(100vw - 112px)); text-align: center; display: none; animation: ds-in 160ms ease-out; }
.ds-end .result { font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-end h2 { margin: 6px 0 14px; font-size: 52px; line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; text-shadow: 0 2px 12px rgb(0 0 0 / 0.6); }
.ds-end .mystats { display: flex; justify-content: center; gap: 0; margin: 0 auto 14px; width: fit-content; }
.ds-end .mystats > div { padding: 8px 20px; border-left: 1px solid var(--ds-line); }
.ds-end .mystats > div:first-child { border-left: 0; }
.ds-end .mystats b { display: block; font-size: 26px; }
.ds-end .vote { margin: 0 auto; width: min(560px, 100%); padding: 12px 14px; text-align: left; }
.ds-end .vote header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.ds-end .vote .clock { font-size: 22px; font-weight: 700; color: var(--ds-signal); }
.ds-votes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; pointer-events: auto; }
.ds-votes button { position: relative; overflow: hidden; font: inherit; color: inherit; text-align: left; background: var(--ds-raised); border: 1px solid var(--ds-line); border-radius: 4px; padding: 10px 12px; cursor: pointer; }
.ds-votes button:hover { border-color: var(--ds-text-2); }
.ds-votes button.mine { border-color: var(--ds-signal); box-shadow: 0 0 0 1px var(--ds-signal); }
.ds-votes button > span { display: block; }
.ds-votes button .key { font-size: 11px; letter-spacing: 0.16em; color: var(--ds-text-3); }
.ds-votes button .mode { display: block; font-size: 18px; font-weight: 700; text-transform: uppercase; margin: 2px 0 6px; }
.ds-votes button .tally { height: 4px; background: rgb(243 241 234 / 0.12); border-radius: 2px; overflow: hidden; }
.ds-votes button .tally i { display: block; height: 100%; background: var(--ds-signal); transition: width 200ms ease-out; }
.ds-votes button .n { position: absolute; right: 12px; top: 10px; font-size: 22px; font-weight: 700; }
.ds-end .next { margin-top: 8px; font-size: 13px; color: var(--ds-text-2); }
.ds-toast { position: absolute; left: 50%; bottom: 128px; transform: translateX(-50%); max-width: 560px; background: rgb(12 15 21 / 0.92); border: 1px solid var(--ds-line); border-left: 3px solid var(--ds-signal); padding: 10px 16px; font-size: 14px; line-height: 1.4; opacity: 0; transition: opacity 300ms; text-shadow: none; }
`;

export interface HudState {
  readonly self: PlayerOutput | null;
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
  /** A centred message (e.g. "connecting"), or null. */
  readonly message: string | null;
  /** The Outposts zones, or none. */
  readonly zones?: readonly ZoneMarker[];
  /** The Charge round, or null outside Charge. */
  readonly charge?: ChargeHud | null;
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

export type HitKind = 'hit' | 'kill' | 'headshot' | 'headshotKill';

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
  readonly #cross: HTMLDivElement;
  readonly #arms: HTMLElement[];
  readonly #hit: HTMLDivElement;
  #hitAge = 1;
  #hitLife = 0.28;
  readonly #elim: HTMLDivElement;
  #elimAge = 10;
  readonly #dmg: HTMLDivElement;
  readonly #indicators: Indicator[] = [];
  readonly #vignette: HTMLDivElement;
  readonly #mag: HTMLSpanElement;
  readonly #gun: HTMLElement;
  readonly #nade: HTMLElement;
  readonly #scope: HTMLDivElement;
  readonly #health: HTMLDivElement;
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
  readonly #zones: HTMLDivElement;
  readonly #markers = new Map<string, HTMLDivElement>();
  readonly #charge: HTMLDivElement;
  readonly #action: HTMLDivElement;
  readonly #round: HTMLDivElement;
  readonly #chargeMarkers = new Map<string, HTMLDivElement>();
  /** Called when a vote button is pressed. */
  onVote: ((mode: ModeId) => void) | null = null;
  readonly #toast: HTMLDivElement;
  #toastTime = 0;
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
      style.textContent = CSS;
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
    this.#cross = el('div', 'ds-cross', this.root, '<i class="h"></i><i class="h"></i><i class="v"></i><i class="v"></i><b></b>');
    this.#arms = [...this.#cross.querySelectorAll('i')] as HTMLElement[];
    this.#hit = el('div', 'ds-hit', this.root, '<i></i><i></i><i></i><i></i>');
    [...this.#hit.querySelectorAll('i')].forEach((i, n) => {
      const a = 45 + n * 90;
      (i as HTMLElement).style.transform = `rotate(${a}deg) translateX(12px)`;
    });
    this.#elim = el('div', 'ds-elim', this.root);
    this.#dmg = el('div', 'ds-dmg', this.root);
    this.#health = el('div', 'ds-health', this.root, '<div class="ds-label">Health</div><div class="hp">100</div><div class="bar"><i></i></div>');
    this.#hp = this.#health.querySelector('.hp') as HTMLElement;
    this.#hpBar = this.#health.querySelector('.bar i') as HTMLElement;
    const ammo = (this.#ammo = el('div', 'ds-ammo', this.root, '<div class="gun">M4A1</div><span class="nade">◆ 1</span><span class="mag">30</span><span class="res">/ ∞</span><div class="bar"><i></i></div>'));
    this.#mag =ammo.querySelector('.mag') as HTMLSpanElement;
    this.#gun = ammo.querySelector('.gun') as HTMLElement;
    this.#nade = ammo.querySelector('.nade') as HTMLElement;
    this.#bar = ammo.querySelector('.bar i') as HTMLElement;
    this.#feed = el('div', 'ds-feed', this.root);
    this.#stats = el('div', 'ds-stats', this.root);
    this.#center = el('div', 'ds-center', this.root);
    this.#prompt = el('div', 'ds-prompt ds-plate', this.root);
    this.#overlay = el(
      'div',
      'ds-overlay ds-plate',
      this.root,
      '<span class="k">TTK</span><span class="ttk">–</span><span class="k">Distance</span><span class="dist">–</span><span class="k">Shots / hits</span><span class="shots">–</span><span class="k">Last hit</span><span class="last-hit">–</span><canvas width="180" height="150"></canvas>',
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
    this.#round = el('div', 'ds-round', this.root);
    this.#end = el('div', 'ds-end', this.root);
    this.#end.addEventListener('click', (e) => {
      const mode = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset['mode'];
      if (mode === 'tdm' || mode === 'ffa') this.onVote?.(mode);
    });
    this.#toast = el('div', 'ds-toast', this.root);
  }

  set visible(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }

  hitMarker(kind: HitKind): void {
    const kill = kind === 'kill' || kind === 'headshotKill';
    this.#hit.className = `ds-hit${kill ? ' kill' : ''}${kind === 'headshot' || kind === 'headshotKill' ? ' head' : ''}`;
    this.#hitAge = 0;
    this.#hitLife = kill ? 0.5 : 0.28;
  }

  /** The callout under the crosshair for a kill you made. */
  eliminated(victim: string, headshot: boolean): void {
    this.#elim.innerHTML = `<div class="what${headshot ? ' head' : ''}">${headshot ? 'Headshot' : 'Eliminated'}</div><div class="who">${escape(victim)}</div>`;
    this.#elimAge = 0;
  }

  /** A hit taken from an attacker at world yaw `worldYaw` (the direction from you to them). */
  damage(worldYaw: number): void {
    const div = document.createElement('div');
    this.#dmg.append(div);
    this.#indicators.push({ el: div, worldYaw, age: 0 });
    this.#flash = 1;
  }

  /** A kill feed line; `bots` marks which side of it is a bot, `gun` names what did it, and `teams` colours each name by its team (team modes). */
  killFeed(
    killer: string | null,
    victim: string,
    headshot: boolean,
    involvesYou: boolean,
    bots: { readonly killer?: boolean; readonly victim?: boolean } = {},
    gun = 'M4A1',
    teams: { readonly killer?: number | undefined; readonly victim?: number | undefined } = {},
  ): void {
    const row = document.createElement('div');
    if (involvesYou) row.className = 'you';
    const k = killer === null ? '' : playerName(killer, bots.killer === true, teams.killer);
    row.innerHTML = `${k}<span class="gun">${killer ? escape(headshot ? `✛ ${gun}` : gun) : '☠'}</span>${playerName(victim, bots.victim === true, teams.victim)}`;
    this.#feed.append(row);
    while (this.#feed.children.length > 6) this.#feed.firstElementChild?.remove();
    setTimeout(() => (row.style.opacity = '0'), 5000);
    setTimeout(() => row.remove(), 5500);
  }

  /** A line in the kill feed about the objectives (a zone taken), in `team`'s colour. */
  objectiveFeed(text: string, team: number, involvesYou: boolean): void {
    const row = document.createElement('div');
    if (involvesYou) row.className = 'you';
    row.innerHTML = `<span class="ds-t${team}">${TEAMS[team]?.mark ?? ''} ${escape(text)}</span>`;
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
    ctx.strokeStyle = 'rgb(255 255 255 / 0.15)';
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    const first = this.#traceShots[0];
    if (!first) return;
    // 1 degree = 9 px; the first shot sits near the bottom, the climb goes up.
    const k = 9 * (180 / Math.PI);
    ctx.fillStyle = '#f2c14e';
    ctx.strokeStyle = 'rgb(242 193 78 / 0.5)';
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
    // Crosshair: spread-sized, hidden on ADS and while sprinting, as in MW2019.
    const w = self?.weapon;
    const sprinting = self?.movement === 'sprint' || self?.movement === 'tacticalSprint';
    const hide = !self || !self.alive || (w?.ads ?? 0) > 0.35 || sprinting || w?.action === 'inspect';
    this.#style(this.#cross, 'opacity', hide ? '0' : '1');
    const gap = Math.round(Math.max(4, (w?.spread ?? 2) * state.pixelsPerDegree) * 2) / 2;
    const [left, right, up, down] = this.#arms;
    if (left && right && up && down) {
      this.#style(left, 'left', `${-gap - 9}px`);
      this.#style(right, 'left', `${gap}px`);
      this.#style(up, 'top', `${-gap - 9}px`);
      this.#style(down, 'top', `${gap}px`);
    }

    this.#hitAge += dt;
    this.#style(this.#hit, 'opacity', fixed(Math.max(0, 1 - this.#hitAge / this.#hitLife)));
    // The marker pops out and settles over its first moments.
    this.#style(this.#hit, 'transform', `scale(${fixed(1 + Math.max(0, 0.12 - this.#hitAge) * 2.5)})`);
    this.#elimAge += dt;
    this.#style(this.#elim, 'opacity', fixed(Math.max(0, Math.min(1, this.#elimAge / 0.06, (1.6 - this.#elimAge) / 0.4))));

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
    this.#style(this.#vignette, 'opacity', fixed(Math.min(1, hurt * 0.9 + this.#flash * 0.35)));

    const health = self ? Math.max(0, Math.round(self.health)) : 0;
    this.#style(this.#health, 'display', self ? '' : 'none');
    this.#text(this.#hp, String(health));
    this.#style(this.#hpBar, 'transform', `scaleX(${health / 100})`);
    this.#health.classList.toggle('low', health <= 35);

    this.#style(this.#ammo, 'display', self ? '' : 'none');
    if (w && self) {
      const row = STATS.weapons[w.id];
      const size = row.handling.magazineSize.value;
      this.#set(this.#gun, `${escape(row.traits.name)}<small>${row.traits.sight === 'scope' ? 'scoped' : row.traits.fireMode}</small>`);
      this.#text(this.#mag, String(w.ammo));
      this.#mag.classList.toggle('low', w.ammo <= Math.max(1, Math.floor(size / 5)));
      this.#style(this.#bar, 'transform', `scaleX(${fixed(w.ammo / size)})`);
      const cooking = self.grenade?.phase === 'cook';
      this.#text(this.#nade, cooking ? `◆ ${Math.max(0, STATS.grenade.fuse.value - (self.grenade?.time ?? 0)).toFixed(1)}` : `◆ ${self.grenades}`);
      const nade = `nade${cooking ? ' cook' : self.grenades === 0 ? ' none' : ''}`;
      if (this.#nade.className !== nade) this.#nade.className = nade;
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
    const waiting = charge ? `\nBack next round${charge.spectating ? `\nWatching ${charge.spectating}` : ''}` : respawn;
    const banner = charge && (charge.state.phase === 'over' || charge.state.phase === 'freeze');
    this.#text(this.#center, state.message ?? (self && !self.alive && !banner ? `You died${waiting}` : ''));
    const prompt = state.message ? null : (state.prompt ?? null);
    this.#prompt.hidden = prompt === null;
    if (prompt !== null) this.#text(this.#prompt, prompt);

    this.#style(this.#overlay, 'display', state.showOverlay ? '' : 'none');
    if (state.showOverlay) this.#text(this.#dist, state.targetDistance === null ? '–' : `${state.targetDistance.toFixed(1)} m`);

    this.#updateMatch(state);
    this.#updateZones(state);
    this.#updateCharge(state);
    this.#updateCountdown(state);
    // The scoreboard is held open on Tab, and stays up for the vote after a match.
    const voting = state.match?.status.phase === 'vote';
    const board = (state.showScoreboard || voting) && state.scores.length > 0;
    this.#style(this.#board, 'display', board ? 'block' : 'none');
    this.#board.classList.toggle('end', voting);
    if (board) this.#set(this.#board, boardHtml(state));

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
      this.#set(this.#round, `<div class="sub">Round ${s.round} · ${c.attacking ? 'Attack' : 'Defend'} · change your loadout now</div><h2>${Math.max(1, Math.ceil(s.remaining))}</h2>`);
    } else if (s.phase === 'over' && s.outcome) {
      const won = TEAMS[s.outcome.winner];
      this.#set(this.#round, `<div class="sub">${ROUND_REASONS[s.outcome.reason]}</div><h2 class="ds-t${s.outcome.winner}">${won?.mark ?? ''} ${won?.name ?? 'Team'} wins the round</h2>`);
    }
  }

  /** The match's opening countdown, big in the middle as Charge's freeze is (Charge has no countdown of its own). */
  #updateCountdown(state: HudState): void {
    const view = state.match;
    const left = view?.status.phase === 'playing' ? (view.countdown ?? null) : null;
    if (left === null || left <= 0) {
      if (!state.charge) this.#style(this.#round, 'display', 'none');
      return;
    }
    this.#style(this.#round, 'display', '');
    this.#set(this.#round, `<div class="sub">${escape(MODE_NAMES[view!.status.mode] ?? view!.status.mode)} · change your loadout now</div><h2>${Math.max(1, Math.ceil(left))}</h2>`);
  }

  /** The match bar (team scores or the leader, the clock, the mode) and, after a match, the result, your line and the vote. */
  #updateMatch(state: HudState): void {
    const view = state.match;
    this.#style(this.#match, 'display', view && view.status.phase === 'playing' ? 'flex' : 'none');
    this.#style(this.#end, 'display', view && (view.status.phase === 'nuke' || view.status.phase === 'vote') ? 'block' : 'none');
    // The Charge portraits widen the bar into the kill feed's corner, so the feed steps down under it.
    this.root.classList.toggle('rostered', view?.status.phase === 'playing' && (state.charge?.roster.length ?? 0) > 0);
    if (!view) return;
    const s = view.status;
    const left = view.secondsLeft === null ? '' : clock(view.secondsLeft);
    if (s.phase === 'playing') {
      const bar = matchBar(s, state.scores, state.selfId, view.team);
      // The last half minute in red, but not Charge's countdown to a round.
      const low = view.secondsLeft !== null && view.secondsLeft <= 30 && state.charge?.state.phase !== 'freeze';
      const mid = `<div class="mid"><span class="clock${low ? ' low' : ''}">${left || '–'}</span><span class="sub">${MODE_SHORT[s.mode] ?? s.mode.toUpperCase()}${bar.limit === null ? '' : ` · ${bar.limit}`}</span></div>`;
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
      return;
    }
    const end = endSummary(s.result, s.mode, state.scores, state.selfId);
    const h = end.headline;
    const headline =
      h.kind === 'draw'
        ? 'Draw'
        : h.kind === 'team'
          ? `<span class="ds-t${h.team}">${TEAMS[h.team]?.mark ?? ''} ${TEAMS[h.team]?.name ?? 'Team'} wins</span>`
          : h.kind === 'player'
            ? h.you
              ? 'You win'
              : `${escape(h.name)} wins`
            : 'Match over';
    const sub = h.kind === 'team' && view.team !== null ? (h.won ? 'Victory' : 'Defeat') : `${MODE_NAMES[s.mode]} · ${s.result ? END_REASONS[s.result.reason] : 'over'}`;
    let html = `<div class="result">${sub}</div><h2>${headline}</h2>`;
    if (end.you) {
      const y = end.you;
      html += `<div class="mystats ds-plate"><div><span class="ds-label">Kills</span><b>${y.kills}</b></div><div><span class="ds-label">Deaths</span><b>${y.deaths}</b></div><div><span class="ds-label">K/D</span><b>${y.ratio}</b></div><div><span class="ds-label">Place</span><b>${ordinal(y.place)}<small> / ${y.of}</small></b></div></div>`;
    }
    if (s.phase === 'nuke') html += `<div class="next">Scoreboard in ${left}</div>`;
    else if (s.lobby) html += `<div class="next">Back to the lobby in ${left}</div>`;
    else if (s.phase === 'vote') {
      const total = Math.max(1, s.votes.tdm + s.votes.ffa);
      html += `<div class="vote ds-plate"><header><span class="ds-label">Vote for the next mode</span><span class="clock">${left}</span></header><div class="ds-votes">`;
      for (const [i, mode] of (['tdm', 'ffa'] as const).entries()) {
        html += `<button data-mode="${mode}" class="${view.myVote === mode ? 'mine' : ''}"><span class="key">[${i + 1}] · D-PAD ${i === 0 ? '◀' : '▶'}</span><span class="mode">${MODE_NAMES[mode]}</span><span class="n">${s.votes[mode]}</span><span class="tally"><i style="width:${(s.votes[mode] / total) * 100}%"></i></span></button>`;
      }
      html += `</div><div class="next">Next match: ${MODE_NAMES[s.next]}${s.votes.tdm + s.votes.ffa === 0 ? ' (no votes: the mode stays)' : ''}</div></div>`;
    }
    this.#set(this.#end, html);
  }

  /**
   * Replaces an element's markup only when it changed: rebuilt every frame,
   * the vote buttons would be swapped out between a mouse press and its release.
   */
  #set(el: HTMLElement, html: string): void {
    if (this.#html.get(el) === html) return;
    this.#html.set(el, html);
    el.innerHTML = html;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Portrait colours by team, after the soldiers' looks (players-view.ts). */
const PORTRAIT_LOOKS: Readonly<Record<number, { readonly uniform: string; readonly vest: string; readonly helmet: string; readonly accent: string }>> = {
  1: { uniform: '#40577a', vest: '#26364d', helmet: '#2f4362', accent: '#3d8bff' },
  2: { uniform: '#8a6544', vest: '#5b412c', helmet: '#6e4c30', accent: '#ff9a3c' },
};
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
  const key = `${team}:${name}`;
  const cached = portraits.get(key);
  if (cached) return cached;
  const h = nameHash(name);
  const look = PORTRAIT_LOOKS[team] ?? PORTRAIT_LOOKS[1]!;
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
  const html = `${escape(name)}${bot ? '<span class="ds-bot">BOT</span>' : ''}`;
  return team === undefined || !TEAMS[team] ? html : `<span class="ds-t${team}">${html}</span>`;
}

/** The held scoreboard: both teams side by side, or the free-for-all ranking, with kills, deaths and ping. */
function boardHtml(state: HudState): string {
  const mode: ModeId = state.match?.status.mode ?? 'ffa';
  const board = scoreboard(state.scores, mode, state.pings, state.match?.status.teamScores ?? null);
  const levels = board.kind === 'ffa' && board.levels;
  const table = (rows: readonly BoardRow[]) =>
    `<table><tr><th>#</th><th>Player</th>${levels ? '<th>Gun</th>' : ''}<th>K</th><th>D</th><th>Ping</th></tr>${rows
      .map(
        (r) =>
          `<tr class="${r.id === state.selfId ? 'you' : ''}"><td class="place">${r.place}</td><td>${playerName(r.name, r.bot)}</td>${levels ? `<td>${r.level}</td>` : ''}<td>${r.kills}</td><td>${r.deaths}</td><td class="ping">${r.ping === null ? '–' : r.ping}</td></tr>`,
      )
      .join('')}</table>`;
  const header = `<header><b>${escape(MODE_NAMES[mode] ?? mode)}</b><span class="ds-label">${state.scores.length} players</span></header>`;
  if (board.kind === 'ffa') return `${header}<div class="cols one"><div>${table(board.rows)}</div></div>`;
  return `${header}<div class="cols">${board.teams
    .map((t) => `<div><h3 class="ds-t${t.team}"><span>${TEAMS[t.team]!.mark} ${TEAMS[t.team]!.name}</span><span class="total">${t.score}</span></h3>${table(t.rows)}</div>`)
    .join('')}</div>`;
}
