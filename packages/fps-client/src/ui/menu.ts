import { STATS, WIDE_SCALE, type GrenadeId, type Loadout, type ModeId, type PerkId, type TacticalId, type WeaponId } from '@duty-shooter/fps-core';
import { padName, type PadNav } from '../gamepad';
import { ACTIONS, ACTION_LABELS, atDefaults, bindingLabel, restoreDefaults, type Action, type Settings, type SettingsSection } from '../settings';
import { CROSSHAIR_COLOUR_NAMES, CROSSHAIR_LIMITS, CROSSHAIR_SHAPES, CROSSHAIR_SHAPE_NAMES, type CrosshairColour, type CrosshairOptions } from '../hud/crosshair';
import { HUD_SCALE_LIMITS } from '../hud/scale';
import { QUALITY, QUALITY_CHOICES, type QualityChoice } from '../quality';
import { COLOUR_VISIONS, COLOUR_VISION_NAMES } from '../team-colours';
import { SECTION_NAMES, SETTINGS_SCREEN_CSS, capChoices, crosshairPreview, sectionOrder, teamPreview, videoPreview, type VideoStatus } from './settings-screen';
import { MODE_NAMES, connectionError, kitCard, loadoutOptions, lobbyTile, pauseActions, weaponCard, type LobbyInfo } from './model';
import { escapeHtml, hint, icon, installTheme } from './theme';
import { PROFILE_SCREEN_CSS, profileHtml, rankLineHtml } from './profile-screen';
import { TOUCH_GLYPHS, type TouchGlyph } from '../touch/controls';
import { touchMode } from '../touch/mode';
import { clearHintMemory, hintsSeen } from '../hint-store';
import type { ProfileStore } from '../profile/store';

export type { LobbyInfo } from './model';

/** The menus' stylesheet. */
export const MENU_CSS = `
.ds-menu { position: fixed; inset: 0; z-index: 20; font: 400 var(--ds-type-body)/1.4 var(--ds-font); color: var(--ds-text); }
.ds-menu[hidden] { display: none; }
.ds-screen { position: absolute; inset: 0; }
/* The same screen drawn again (a tab, a new key, the server's status) does not fade in again. */

/* The main menu: a title card over the map's fly-through. The wordmark and the name at the top, the destinations in display type with their live readouts at the foot, key hints and the version under them. */
.ds-home { position: absolute; inset: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; padding: 40px var(--ds-gutter) 22px;
  background: linear-gradient(90deg, rgb(7 9 13 / 0.92) 0%, rgb(7 9 13 / 0.62) 32%, rgb(7 9 13 / 0) 60%), linear-gradient(0deg, rgb(7 9 13 / 0.8) 0%, rgb(7 9 13 / 0) 34%), linear-gradient(180deg, rgb(7 9 13 / 0.55) 0%, rgb(7 9 13 / 0) 18%); }
.ds-home .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.ds-brand h1 { margin: 0; font-size: var(--ds-type-title); line-height: 0.9; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-brand p { margin: 10px 0 0; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-name { width: 270px; }
.ds-name label { display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 14px; margin-top: 6px; background: var(--ds-scrim-soft); border: 1px solid var(--ds-line-2); transition: border-color var(--ds-fast); }
.ds-name label:focus-within { border-color: var(--ds-signal); }
.ds-name input { flex: 1; min-width: 0; background: none; border: 0; color: var(--ds-text); font: 700 var(--ds-type-body) var(--ds-font); letter-spacing: 0.02em; outline: none; }
.ds-name .ds-icon { color: var(--ds-text-2); flex: none; }
.ds-name .ds-label { color: var(--ds-text); text-shadow: 0 1px 3px rgba(0,0,0,0.7); }
/* Destinations: display type, a readout under each, the lit one marked by a signal bar at its left edge. */
.ds-dests { align-self: end; display: flex; flex-direction: column; width: min(720px, 100%); margin-bottom: 22px; }
.ds-dest { position: relative; display: block; padding: 10px 0 12px 22px; text-align: left; background: none; border: 0; color: var(--ds-text); }
.ds-dest::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 14px; width: 4px; background: var(--ds-line-2); transform-origin: left; transition: background-color var(--ds-fast), transform var(--ds-fast) var(--ds-ease); }
.ds-dest.lit::before { background: var(--ds-signal); }
.ds-dest b { display: block; font-size: var(--ds-type-display); line-height: 0.92; font-weight: 700; letter-spacing: 0.015em; text-transform: uppercase; transition: transform var(--ds-fast) var(--ds-ease), color var(--ds-fast); }
.ds-dest .readout { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; margin-top: 6px; font-size: var(--ds-type-body); color: var(--ds-text-2); font-variant-numeric: tabular-nums; }
.ds-dest .readout em { font-style: normal; color: var(--ds-text); }
.ds-dest:hover::before, .ds-dest:focus-visible::before, .ds-dest[data-pad-focus]::before { background: var(--ds-signal); transform: scaleX(2); }
.ds-dest:hover b, .ds-dest:focus-visible b, .ds-dest[data-pad-focus] b { transform: translateX(10px); }
.ds-dest:focus-visible, .ds-dest[data-pad-focus] { outline: none; }
.ds-dest:focus-visible b, .ds-dest[data-pad-focus] b { color: var(--ds-signal-hi); }
.ds-dest.minor { margin-top: 14px; padding-top: 18px; border-top: 1px solid var(--ds-line); }
.ds-dest.minor::before { top: 20px; }
.ds-dest.minor b { font-size: var(--ds-type-heading); letter-spacing: 0.12em; }
.ds-dest.minor .readout { display: none; }
.ds-dot { display: inline-flex; align-items: center; gap: 8px; color: var(--ds-text); }
.ds-dot::before { content: ''; width: 9px; height: 9px; border-radius: 50%; background: var(--ds-alert); }
.ds-dot.up::before { background: var(--ds-signal); }
.ds-home footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ds-version { font-size: var(--ds-type-small); color: var(--ds-text-2); letter-spacing: 0.08em; font-variant-numeric: tabular-nums; }
/* The first time the menu shows, the destinations rise in one after another; never on a redraw. */
@keyframes ds-rise { from { opacity: 0; transform: translateY(14px); } }
.ds-home.enter .ds-dest { animation: ds-rise var(--ds-slow) var(--ds-ease) both; animation-delay: calc(var(--i, 0) * 50ms); }
.ds-home.enter .ds-brand { animation: ds-rise var(--ds-slow) var(--ds-ease) both; }
@media (prefers-reduced-motion: reduce) {
  @keyframes ds-rise { from { opacity: 0; } }
  .ds-dest b, .ds-dest::before { transition: none; }
}
/* Small windows: everything in one scrolling column. */
@media (max-width: 900px), (max-height: 600px) {
  .ds-home { display: flex; flex-direction: column; gap: 18px; padding: 20px var(--ds-gutter); overflow-y: auto;
    background: linear-gradient(0deg, rgb(7 9 13 / 0.94) 0%, rgb(7 9 13 / 0.78) 55%, rgb(7 9 13 / 0.45) 100%); }
  .ds-home .top { flex-direction: column; gap: 14px; }
  .ds-name { width: min(270px, 100%); }
  .ds-dests { margin: auto 0 0; align-self: flex-start; }
  .ds-dest { padding: 8px 0 10px 18px; }
  .ds-dest .readout { font-size: var(--ds-type-body); }
  .ds-home footer .ds-hints { display: none; }
}
/* A phone on its side (ticket 26): the name and the Rank stand right of the list, as on a desktop, so the list starts under the title and four destinations show at once. */
@media (max-height: 520px) and (min-width: 641px) {
  .ds-home { display: grid; grid-template-columns: minmax(0, 1fr) min(270px, 36%); grid-template-rows: auto auto auto; align-content: start; gap: 8px 24px; padding: 14px var(--ds-gutter) 12px; }
  .ds-home .top { display: contents; }
  .ds-brand { grid-column: 1; grid-row: 1; }
  .ds-name { grid-column: 2; grid-row: 1 / span 2; width: auto; }
  .ds-dests { grid-column: 1; grid-row: 2; align-self: start; margin: 0; width: 100%; }
  .ds-home footer { grid-column: 1 / -1; grid-row: 3; }
  .ds-dest { padding: 3px 0 5px 18px; }
  .ds-dest .readout { margin-top: 2px; }
  .ds-dest.minor { margin-top: 6px; padding-top: 10px; min-height: 44px; }
  .ds-dest.minor::before { top: 12px; }
}

/* Page content: columns, cards, facts and fields. */
.ds-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); gap: 40px; align-items: start; }
.ds-box { padding: 18px; background: rgb(18 22 29 / 0.88); }
.ds-box + .ds-box { margin-top: 16px; }
.ds-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); margin: 0 0 24px; }
.ds-facts div { background: var(--ds-panel); padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ds-facts span:last-child { font-size: var(--ds-type-heading); line-height: 1.1; font-weight: 700; letter-spacing: 0.01em; overflow-wrap: anywhere; }
.ds-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.ds-mode { padding: 12px 14px; text-align: left; background: var(--ds-panel); border: 1px solid var(--ds-line); transition: border-color var(--ds-fast), background-color var(--ds-fast); }
.ds-mode b { display: block; font-size: var(--ds-type-body); line-height: 1.1; text-transform: uppercase; letter-spacing: 0.03em; }
.ds-mode span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-mode:hover { background: var(--ds-raised); }
.ds-mode.on { border-color: var(--ds-signal); box-shadow: inset 4px 0 0 var(--ds-signal); }
.ds-mode:focus-visible, .ds-mode[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: 2px; }
.ds-field { display: block; margin: 0 0 16px; }
.ds-field input { display: block; width: 100%; height: 46px; padding: 0 14px; background: var(--ds-ink); color: var(--ds-text); border: 1px solid var(--ds-line-2); border-radius: 0; font: 700 var(--ds-type-body) var(--ds-font); letter-spacing: 0.02em; transition: border-color var(--ds-fast); }
.ds-field input:focus { border-color: var(--ds-signal); outline: none; }
.ds-field-note { display: block; margin-top: 6px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-error { color: var(--ds-alert); min-height: 20px; font-size: var(--ds-type-body); }
.ds-sub { margin: 6px 0 0; color: var(--ds-text-2); }
.ds-gap { height: 20px; }

/* Settings: tabs in the header, rows of label and control. */
.ds-tabs { display: flex; gap: 2px; }
.ds-tabs button { position: relative; height: 44px; padding: 0 18px; background: transparent; border: 0; color: var(--ds-text-2); font-size: var(--ds-type-body); font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; transition: color 100ms, background-color 100ms; }
.ds-tabs button::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; background: var(--ds-signal); transform: scaleX(0); transition: transform 140ms var(--ds-ease); }
.ds-tabs button:hover { color: var(--ds-text); background: rgb(243 241 234 / 0.04); }
.ds-tabs button.on { color: var(--ds-text); }
.ds-tabs button.on::after { transform: none; }
.ds-tabs button:focus-visible, .ds-tabs button[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: -2px; }
/* Settings: a block a section, its name at heading size with a line on what it covers, then a row a setting, the control on the right. */
.ds-rows { max-width: 980px; }
.ds-rows section + section { margin-top: 36px; }
.ds-rows h3 { margin: 0 0 6px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ds-text); }
.ds-rows .ds-sub { margin: 0 0 12px; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-rows .list { display: grid; gap: 1px; background: var(--ds-line); }
.ds-row { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: center; min-height: 56px; padding: 6px 16px 6px 20px; background: var(--ds-panel); transition: background-color var(--ds-fast), box-shadow var(--ds-fast); }
.ds-row:hover, .ds-row:focus-within { background: var(--ds-raised); box-shadow: inset 4px 0 0 var(--ds-signal); }
.ds-row > label { font-size: var(--ds-type-body); }
.ds-slider { display: flex; align-items: center; gap: 12px; }
.ds-slider input { flex: 1; min-width: 0; height: 32px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; cursor: pointer; }
.ds-slider input::-webkit-slider-runnable-track { height: 4px; background: linear-gradient(90deg, var(--ds-signal) var(--p, 50%), var(--ds-line-2) var(--p, 50%)); border-radius: 0; }
.ds-slider input::-moz-range-track { height: 4px; background: linear-gradient(90deg, var(--ds-signal) var(--p, 50%), var(--ds-line-2) var(--p, 50%)); border-radius: 0; }
.ds-slider input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 20px; margin-top: -8px; background: var(--ds-text); border: 0; border-radius: 0; box-shadow: 0 0 0 3px rgb(7 9 13 / 0.6); }
.ds-slider input::-moz-range-thumb { width: 14px; height: 20px; background: var(--ds-text); border: 0; border-radius: 0; }
/* A thumb's reach: the whole row height on touch, with a bigger thumb, so a slider is not a 20px strip to hit. */
@media (pointer: coarse) { .ds-slider input { height: 44px; } .ds-slider input::-webkit-slider-thumb { width: 22px; height: 30px; margin-top: -13px; } .ds-row select, .ds-bind { min-height: 44px; } }
.ds-slider input:focus { outline: none; }
.ds-slider input:focus-visible::-webkit-slider-thumb, .ds-slider input[data-pad-focus]::-webkit-slider-thumb { background: var(--ds-signal); }
.ds-slider .val { min-width: 64px; height: 34px; display: inline-flex; align-items: center; justify-content: center; background: var(--ds-ink); border: 1px solid var(--ds-line); font-size: var(--ds-type-body); font-weight: 700; color: var(--ds-text); }
.ds-row select, .ds-bind { width: 100%; height: 40px; padding: 0 36px 0 12px; background: var(--ds-ink); color: var(--ds-text); border: 1px solid var(--ds-line-2); border-radius: 0; font: 700 var(--ds-type-body) var(--ds-font); letter-spacing: 0.08em; text-transform: uppercase; text-align: left; }
.ds-row select { appearance: none; -webkit-appearance: none; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238fe3c8' stroke-width='1.8'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
.ds-row select option { background: var(--ds-panel); text-transform: none; }
.ds-row select:focus, .ds-bind:focus, .ds-row select[data-pad-focus], .ds-bind[data-pad-focus] { border-color: var(--ds-signal); outline: none; }
.ds-bind { padding-right: 12px; cursor: pointer; }
.ds-saved { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-bind:hover { border-color: var(--ds-signal); }
.ds-bind.wait { border-color: var(--ds-signal); color: var(--ds-signal); background: var(--ds-signal-dim); }

/* Loadout: weapon tiles by slot, and the focused weapon's card. */
.ds-kit { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 24px; }
.ds-kit .ds-mode { min-height: 74px; display: flex; flex-direction: column; justify-content: flex-end; }
.ds-kit .ds-mode b { font-size: var(--ds-type-body); }
.ds-kit .ds-mode span { display: block; margin-top: 2px; font-size: var(--ds-type-small); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-text-3); }
.ds-gun .name { font-size: var(--ds-type-title); line-height: 1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.ds-gun .role { margin: 8px 0 18px; color: var(--ds-text-2); font-size: var(--ds-type-body); }
.ds-bars { display: grid; grid-template-columns: 110px 1fr 82px; gap: 12px 12px; align-items: center; font-size: var(--ds-type-small); }
.ds-bars .k { color: var(--ds-text-3); text-transform: uppercase; font-size: var(--ds-type-small); letter-spacing: 0.14em; }
.ds-bars .bar { height: 6px; background: rgb(255 255 255 / 0.08); overflow: hidden; }
.ds-bars .bar i { display: block; height: 100%; background: var(--ds-signal); transition: width 160ms var(--ds-ease); }
.ds-bars .v { text-align: right; font-weight: 700; color: var(--ds-text); }

/* Pause: a column of actions over the paused game, and the controls beside it. */
.ds-pause { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(300px, 440px) minmax(0, 1fr); gap: 56px; padding: 56px;
  background: linear-gradient(90deg, rgb(7 9 13 / 0.94) 0%, rgb(7 9 13 / 0.78) 40%, rgb(7 9 13 / 0.55) 100%); overflow-y: auto; }
/* The HUD under it goes: its readouts would sit behind the actions and the key hints. */
body:has(.ds-menu:not([hidden]) .ds-pause) .ds-hud { opacity: 0; }
.ds-pause .col { display: flex; flex-direction: column; gap: 6px; }
.ds-pause h1 { margin: 6px 0 24px; font-size: var(--ds-type-title); line-height: 0.95; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
/* Its actions are the main menu's destinations at display size: a 4px bar at the left, lit in signal for Resume and for the one under the pointer or the pad. */
.ds-pause .ds-item { position: relative; display: grid; align-items: center; min-height: 64px; padding: 8px 0 8px 22px; text-align: left; color: var(--ds-text); background: none; border: 0; cursor: pointer; }
.ds-pause .ds-item::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 4px; background: var(--ds-line-2); transform-origin: left; transition: background-color var(--ds-fast), transform var(--ds-fast) var(--ds-ease); }
.ds-pause .ds-item b { font-size: var(--ds-type-display); line-height: 0.95; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; transition: transform var(--ds-fast) var(--ds-ease), color var(--ds-fast); }
.ds-pause .ds-item.primary::before { background: var(--ds-signal); }
.ds-pause .ds-item:hover::before, .ds-pause .ds-item:focus-visible::before, .ds-pause .ds-item[data-pad-focus]::before { background: var(--ds-signal); transform: scaleX(2); }
.ds-pause .ds-item:hover b, .ds-pause .ds-item:focus-visible b, .ds-pause .ds-item[data-pad-focus] b { transform: translateX(10px); }
.ds-pause .ds-item:focus-visible, .ds-pause .ds-item[data-pad-focus] { outline: none; }
.ds-pause .ds-item:focus-visible b, .ds-pause .ds-item[data-pad-focus] b { color: var(--ds-signal-hi); }
.ds-pause .ds-error { margin: -12px 0 12px; }
.ds-keys { align-self: end; justify-self: end; width: min(560px, 100%); padding: 18px 20px; background: rgb(12 15 21 / 0.86); }
.ds-keys dl { display: grid; grid-template-columns: max-content 1fr max-content 1fr; gap: 8px 14px; margin: 0; align-items: center; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-keys dt { justify-self: start; }
.ds-keys dd { margin: 0; }
.ds-keys .pad-list { display: none; }
.pad .ds-keys .key-list { display: none; } .pad .ds-keys .pad-list { display: grid; }
/* On touch the list names the controls on the glass, each by the mark drawn on it. */
.ds-keys .touch-list { display: none; }
html.ds-touch .ds-keys .key-list, html.ds-touch .ds-keys .pad-list, html.ds-touch .ds-keys h2 small { display: none; }
html.ds-touch .ds-keys .touch-list { display: grid; }
.ds-tg { display: inline-grid; place-items: center; min-width: 26px; height: 26px; padding: 0 4px; border: 1px solid var(--ds-line-2); border-radius: 13px; font-size: var(--ds-type-small); font-style: normal; font-weight: 700; color: var(--ds-text); }
.ds-tg svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ds-pause footer { grid-column: 1 / -1; align-self: end; }

/* Dialogs: loading, connecting, errors, tips. Set like a title card at the lower left over the world, as the main menu is, the scrim heavy where the words are. */
.ds-dim { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(7 9 13 / 0.94) 0%, rgb(7 9 13 / 0.8) 45%, rgb(7 9 13 / 0.5) 100%); }
.ds-panel { position: absolute; left: var(--ds-gutter); bottom: 72px; width: min(620px, calc(100vw - 2 * var(--ds-gutter))); max-height: calc(100vh - 96px); overflow: auto; animation: ds-in var(--ds-slow) var(--ds-ease) both; }
.ds-panel.error { padding-left: 24px; box-shadow: inset 4px 0 0 var(--ds-alert); }
.ds-panel h2 { margin: 0 0 16px; font-size: var(--ds-type-title); line-height: 0.92; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; overflow-wrap: anywhere; }
.ds-panel p { margin: 0 0 22px; max-width: 56ch; font-size: var(--ds-type-body); line-height: 1.45; color: var(--ds-text-2); }
.ds-panel .figure { display: flex; align-items: baseline; gap: 14px; margin: 0 0 12px; }
.ds-panel .figure b { font-size: calc(var(--ds-type-display) * 1.4); line-height: 0.85; font-weight: 700; min-width: 3ch; }
.ds-panel .figure span { font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-btns { display: flex; flex-wrap: wrap; gap: 10px; }
.ds-btns .ds-btn { min-width: 180px; }
.ds-progress { height: 4px; background: var(--ds-line-2); overflow: hidden; margin: 0 0 20px; }
.ds-progress i { display: block; height: 100%; width: 0; background: var(--ds-text); transition: width 200ms ease-out; }
.ds-progress.busy i { width: 30%; animation: ds-busy 1.1s ease-in-out infinite; }
@keyframes ds-busy { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .ds-progress.busy i { animation: none; width: 100%; opacity: 0.4; } .ds-panel { animation: none; } }
/* Connecting's steps: a short mark each, lit for the one under way, as on the Battle Royale screen. */
.ds-steps { display: grid; gap: 8px; list-style: none; margin: 0 0 26px; padding: 0; font-size: var(--ds-type-body); }
.ds-steps li { display: flex; align-items: center; gap: 12px; color: var(--ds-text-2); }
.ds-steps li::before { content: ''; flex: none; width: 18px; height: 2px; background: var(--ds-line-2); }
.ds-steps li.done::before { background: var(--ds-text-2); }
.ds-steps li.now { color: var(--ds-text); font-weight: 700; }
.ds-steps li.now::before { background: var(--ds-signal); }
.ds-menu.pad .ds-panel [data-pad-focus], .ds-menu.pad .ds-field input[data-pad-focus] { outline: 2px solid var(--ds-signal); outline-offset: 2px; }

@media (max-width: 960px) {
  .ds-cols { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .ds-row { grid-template-columns: 1fr; gap: 6px; padding: 10px 12px 12px 16px; }
  .ds-facts span:last-child { font-size: var(--ds-type-body); }
  .ds-dim { background: var(--ds-scrim); }
  .ds-panel { bottom: 32px; }
  .ds-panel .figure b { font-size: var(--ds-type-display); }
  .ds-btns .ds-btn { flex: 1 1 140px; min-width: 0; }
  .ds-kit { grid-template-columns: repeat(2, 1fr); }
  .ds-tabs { order: 3; flex-basis: 100%; overflow-x: auto; }
  .ds-tabs button { flex: 1 0 auto; padding: 0 10px; font-size: var(--ds-type-small); letter-spacing: 0.08em; }
  .ds-pause { grid-template-columns: 1fr; padding: 20px 16px; gap: 24px; background: var(--ds-scrim); }
  .ds-pause h1 { font-size: var(--ds-type-title); } .ds-pause .ds-item { min-height: 54px; }
  .ds-keys { justify-self: stretch; }
  .ds-keys dl { grid-template-columns: max-content 1fr; }
}
/* A phone on its side: the controls stand beside the actions, as on a desktop, instead of under the fold. */
@media (max-height: 520px) and (min-width: 641px) {
  .ds-pause { grid-template-columns: minmax(200px, 280px) minmax(0, 1fr); gap: 20px; padding: 12px 16px; }
  .ds-pause h1 { margin: 4px 0 8px; }
  .ds-pause .ds-item { min-height: 48px; }
  .ds-keys { align-self: start; padding: 12px 14px; }
  .ds-keys dl { grid-template-columns: max-content 1fr max-content 1fr; }
}
/* An upright phone: the tabs wrap onto rows; a strip that scrolls sideways hid the last ones with no sign of them. */
@media (max-width: 640px) { .ds-ui .ds-tabs { flex-wrap: wrap; overflow-x: visible; row-gap: 4px; } .ds-ui .ds-tabs button { flex: 0 1 auto; } }
/* Neighbours a thumb could mix up stand 8px apart. */
html.ds-touch .ds-tabs { gap: 8px; }
html.ds-touch .ds-pause .col { gap: 8px; }
`;

/** The touch controls for the pause screen's reference: the mark on each, then what it does. */
const TOUCH_KEYS: readonly (readonly [TouchGlyph | 'use', string])[] = [
  ['stick', 'Move: left thumb (all the way up: sprint)'],
  ['drag', 'Look: drag the right half'],
  ['fire', 'Fire (drag it to aim)'],
  ['ads', 'Aim'],
  ['jump', 'Jump / mantle'],
  ['crouch', 'Crouch / slide (hold: prone)'],
  ['reload', 'Reload'],
  ['switchWeapon', 'Switch weapon'],
  ['grenade', 'Grenade'],
  ['melee', 'Melee'],
  ['use', 'Shows when there is something to use'],
  ['ping', 'Ping (hold and drag: the wheel)'],
  ['scoreboard', 'Scores'],
  ['pause', 'Menu'],
];

/** The controller's actions for the pause screen's reference, in the Default layout. */
const PAD_KEYS: readonly (readonly [string, string])[] = [
  ['R2', 'Fire'],
  ['L2', 'Aim'],
  ['L3', 'Sprint (press again: walk)'],
  ['○', 'Crouch / slide (hold: prone)'],
  ['✕', 'Jump / mantle'],
  ['□', 'Reload (hold: inspect)'],
  ['R3', 'Melee'],
  ['△', 'Switch weapon'],
  ['R1', 'Grenade'],
  ['L1', 'Use'],
  ['Pad', 'Scores'],
  ['Opt', 'Menu'],
];

export interface MenuCallbacks {
  /** Practice on the range, offline. */
  practiceRange(): void;
  /** The Battle Royale screen: its own lobby, on the server or against Local bots. */
  battleRoyale(): void;
  /** Bot Match's setup: the lobby page, offline. */
  botMatch(): void;
  /** Join the server with this name and passphrase; `mode` and `bots` (a side) are the choices for an empty server, null for its own. */
  playOnline(name: string, passphrase: string, mode: ModeId | null, bots: number | null): void;
  /** Ask the lobby status endpoint again (Play Online, Retry). */
  refreshLobby(): Promise<LobbyInfo | null>;
  /** Give up joining. */
  cancelJoin(): void;
  /** Close the pause menu and take the pointer again. */
  resume(): void;
  /** Leave the current game for the main menu. */
  leave(): void;
  /** Settings changed (already validated); persist and apply them. A new `loadout` goes to the game too. */
  changeSettings(settings: Settings): void;
  /** Wait for the next key or mouse button, for rebinding; null cancels. */
  captureKey(): Promise<string | null>;
}

/**
 * Where online play is. `server`: this page's own game server, with a
 * passphrase or as one public lobby. `link`: a copy of the page without a
 * server (GitHub Pages), which hides Play Online.
 */
export type Lobby = { readonly kind: 'server'; readonly public: boolean; status?: LobbyInfo | null } | { readonly kind: 'link'; readonly url: string };

type Screen = 'main' | 'online' | 'loading' | 'connecting' | 'error' | 'pause' | 'settings' | 'tip' | 'loadout' | 'profile';

type El = (tag: string, text?: string, cls?: string) => HTMLElement;

/** What names a control on its screen: its label, or what it says. The focus finds it again by this after the screen is rebuilt. */
function controlName(e: Element | null): string {
  return e ? (e.getAttribute('aria-label') ?? e.textContent ?? '').trim() : '';
}

/**
 * Every screen outside play: the main menu over the map's fly-through,
 * Play Online, loading and connecting with their progress, the connection
 * errors, pause, loadout, settings and the Profile. Plain DOM built on the theme's page
 * shell (Bot Match's setup is the lobby page); the range app decides what
 * each choice does. Mouse, keyboard (Esc goes back) and controller reach
 * every control, and every screen is built at once, with nothing to load.
 */
export class Menu {
  readonly #root: HTMLDivElement;
  readonly #callbacks: MenuCallbacks;
  #settings: Settings;
  #screen: Screen = 'main';
  /** Where the settings screen's Back goes; `close` hides the menu (over the lobby). */
  #back: Screen | 'close' = 'main';
  /** The Settings section showing; null until the screen first opens (Touch where a finger plays, Controls elsewhere). */
  #tab: SettingsSection | null = null;
  /** What the page knows of the picture, for Settings > Video. */
  readonly #video: () => VideoStatus | null;
  /** Redraws what a changed setting shows beside its row (a preview, the Restore button); null off the Settings screen. */
  #afterChange: (() => void) | null = null;
  #error = '';
  /** The connection failure being shown: the driver's status, or null for a server that did not answer. */
  #failure: string | null = null;
  #lobby: Lobby | null;
  readonly #version: string;
  #mode: ModeId = 'tdm';
  /** An empty server's bots a side, as picked; null keeps the server's own fill. */
  #onlineBots: number | null = null;
  /** Loading: what, and how far (0-1, or null when unknown). */
  #loading: { title: string; progress: number | null } = { title: '', progress: null };
  /** Connecting: which step is under way. */
  #step = 0;
  /** The main menu has shown once: its entrance doesn't play again. */
  #entered = false;
  #afterTip: (() => void) | null = null;
  /** The loadout screen: where Done goes (the pause menu, or back into the game) and when a change applies. */
  #loadoutBack: 'pause' | 'game' | 'lobby' = 'pause';
  #loadoutNote = '';
  #matchMode: ModeId | null = null;
  readonly #padName: () => string | null;
  /** This browser's Profile: the main menu's Rank line and the Profile screen read it. Null where none is kept. */
  readonly #profile: ProfileStore | null;
  /** The Profile screen is asking whether to erase it. */
  #askReset = false;
  /** A pointer is pressed on the menu: a status redraw waits for the release, or the click would land on a button that is gone. */
  #pressed = false;
  #redrawAfterPress = false;
  /** The control that had the focus on each screen when another opened over it: coming back lands on it. */
  readonly #left = new Map<Screen, string>();
  /** What had the focus outside the menu when it opened (a lobby button): it gets the focus back when the menu closes. */
  #opener: HTMLElement | null = null;

  constructor(settings: Settings, callbacks: MenuCallbacks, options: { lobby: Lobby | null; version: string; padName?: () => string | null; profile?: ProfileStore | null; video?: () => VideoStatus | null }) {
    this.#settings = settings;
    this.#callbacks = callbacks;
    this.#lobby = options.lobby;
    this.#version = options.version;
    this.#padName = options.padName ?? (() => null);
    this.#profile = options.profile ?? null;
    this.#video = options.video ?? (() => null);
    installTheme();
    if (!document.getElementById('ds-menu-css')) {
      const style = document.createElement('style');
      style.id = 'ds-menu-css';
      style.textContent = MENU_CSS + PROFILE_SCREEN_CSS + SETTINGS_SCREEN_CSS;
      document.head.append(style);
    }
    this.#root = document.createElement('div');
    this.#root.className = 'ds-menu ds-ui';
    document.body.append(this.#root);
    // The focus ring is for the controller; the mouse hides it again.
    this.#root.addEventListener('mousemove', () => this.#root.classList.remove('pad'));
    this.#root.addEventListener('pointerdown', () => (this.#pressed = true));
    const release = () => {
      if (!this.#pressed) return;
      this.#pressed = false;
      // After the click this release makes, which comes in the same task.
      if (this.#redrawAfterPress) setTimeout(() => this.#statusChanged(), 0);
    };
    addEventListener('pointerup', release, true);
    addEventListener('pointercancel', release, true);
    // Esc goes back, as the footer says; not from pause or the tip (taking the pointer needs a click) nor while a key is being bound.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.defaultPrevented || !this.open || this.#screen === 'pause' || this.#screen === 'loading' || this.#screen === 'tip' || this.#root.querySelector('.ds-bind.wait')) return;
      const back = this.#root.querySelector<HTMLButtonElement>('[data-back]');
      if (!back) return;
      e.preventDefault();
      back.click();
    });
    this.#render();
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** The screen showing (whatever it is while hidden). */
  get screen(): Screen {
    return this.#screen;
  }

  set settings(settings: Settings) {
    this.#settings = settings;
  }

  /** The picture changed under the Settings screen (Auto settled on a tier, the engine came up): Video shows it. */
  videoChanged(): void {
    if (this.open && this.#screen === 'settings') this.#afterChange?.();
  }

  show(screen: Screen, error = ''): void {
    const from = this.open ? this.#screen : null;
    const active = document.activeElement;
    if (from === null) this.#opener = active instanceof HTMLElement && active !== document.body && !this.#root.contains(active) ? active : null;
    else if (from !== screen) this.#left.set(from, controlName(this.#root.contains(active) ? active : null));
    // The main menu as the page opens takes no focus: nothing asked for it yet.
    const first = screen === 'main' && !this.#entered;
    this.#screen = screen;
    this.#error = error;
    this.#root.hidden = false;
    this.#render();
    if (from !== screen && !first) this.#focusOpened(screen);
  }

  hide(): void {
    const held = this.open && this.#root.contains(document.activeElement);
    this.#root.hidden = true;
    this.#left.clear();
    const opener = this.#opener;
    this.#opener = null;
    // Closed over a page (the lobby's Loadout or Settings): the button that opened the menu has the focus again.
    if (held && opener?.isConnected && opener.offsetParent !== null) opener.focus({ preventScroll: true });
  }

  /**
   * The focus on a screen that just opened: back on the control that led away
   * from it, or on what the screen put it on itself, or else on its way on
   * (the chosen tab, the primary button, the first control). Queued after the
   * screen's own focus, which is queued the same way.
   */
  #focusOpened(screen: Screen): void {
    const back = this.#left.get(screen);
    this.#left.delete(screen);
    queueMicrotask(() => {
      if (!this.open || this.#screen !== screen) return;
      const controls = this.#controls();
      const returned = back ? controls.find((c) => controlName(c) === back) : undefined;
      if (returned) returned.focus();
      else if (!this.#root.contains(document.activeElement) || document.activeElement === document.body) {
        // On touch never a field: the focus there brings the keyboard up over the page before anyone asked to type.
        const touch = document.documentElement.classList.contains('ds-touch');
        const typed = (c: HTMLElement) => c instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(c.type);
        const way = this.#root.querySelector<HTMLElement>('.ds-tabs button.on') ?? this.#root.querySelector<HTMLElement>('.ds-btn.primary:not(:disabled), .ds-item.primary:not(:disabled)') ?? (touch ? controls.find((c) => !typed(c)) : controls[0]);
        way?.focus({ preventScroll: true });
      }
      if (this.#root.classList.contains('pad')) this.#markFocus();
    });
  }

  /** The loading screen, or its progress (0-1; null while unknown). */
  loading(title: string, progress: number | null): void {
    const same = this.#screen === 'loading' && this.open && this.#loading.title === title;
    this.#loading = { title, progress };
    if (!same) this.show('loading');
    const figure = this.#root.querySelector<HTMLElement>('.ds-panel .figure b');
    if (figure) figure.textContent = progress === null ? '…' : `${Math.round(progress * 100)}%`;
    const bar = this.#root.querySelector<HTMLElement>('.ds-progress');
    if (bar) {
      bar.classList.toggle('busy', progress === null);
      (bar.firstElementChild as HTMLElement).style.width = progress === null ? '' : `${Math.round(progress * 100)}%`;
    }
  }

  /** The connecting screen at step 0 (reaching the server), 1 (loading the map) or 2 (joining). */
  connecting(step: number): void {
    if (this.#screen === 'connecting' && this.open && step === this.#step) return;
    this.#step = step;
    this.show('connecting');
  }

  /** A failed or dropped connection, explained: the driver's status line, or null when the server did not answer. */
  failed(status: string | null): void {
    this.#failure = status;
    this.show('error');
  }

  /** New lobby status: the Play Online tile and screen follow it. */
  setLobby(lobby: Lobby | null): void {
    this.#lobby = lobby;
    this.#statusChanged();
  }

  /** New lobby status: the Play Online tile and screen follow it. */
  updateLobby(status: LobbyInfo | null): void {
    if (this.#lobby?.kind !== 'server') return;
    const changed = JSON.stringify(lobbyTile(this.#lobby.status ?? null)) !== JSON.stringify(lobbyTile(status));
    this.#lobby.status = status;
    // Only when what the screen shows changed, and keeping what is being typed.
    if (changed) this.#statusChanged();
  }

  /** The lobby's status changed: the screens that show it are drawn again, once no press is under way. */
  #statusChanged(): void {
    if (this.#pressed) {
      this.#redrawAfterPress = true;
      return;
    }
    this.#redrawAfterPress = false;
    if (this.open && (this.#screen === 'main' || this.#screen === 'online')) this.#rerender();
  }

  /** Renders the same screen again, keeping the text in its fields and the focused field's caret. */
  #rerender(): void {
    const before = [...this.#root.querySelectorAll('input')];
    const values = before.map((i) => i.value);
    const focused = before.findIndex((i) => i === document.activeElement);
    const caret = focused >= 0 ? before[focused]!.selectionStart : null;
    this.#render();
    const after = [...this.#root.querySelectorAll('input')];
    if (after.length !== before.length) return;
    after.forEach((i, k) => (i.value = values[k]!));
    if (focused < 0) return;
    // After the screen's own autofocus, which is queued the same way.
    queueMicrotask(() => {
      const input = after[focused]!;
      input.focus();
      if (caret !== null) input.setSelectionRange(caret, caret);
    });
  }

  /**
   * Controller navigation: up and down (left and right outside sliders and
   * lists) move the focus, left and right change the focused slider or list,
   * Cross activates, Circle goes back and Options resumes from the pause menu.
   */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    this.#navigate(nav);
    this.#markFocus();
  }

  #controls(): HTMLElement[] {
    return [...this.#root.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled);
  }

  #navigate(nav: PadNav): void {
    const items = this.#controls();
    const focused = items.indexOf(document.activeElement as HTMLElement);
    const current = items[focused];
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    const step = (d: 1 | -1) => {
      if (current instanceof HTMLInputElement && current.type === 'range') {
        if (d > 0) current.stepUp();
        else current.stepDown();
        current.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (current instanceof HTMLSelectElement) {
        const i = Math.max(0, Math.min(current.options.length - 1, current.selectedIndex + d));
        if (i !== current.selectedIndex) {
          current.selectedIndex = i;
          current.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else focus(focused < 0 ? 0 : focused + d);
    };
    switch (nav) {
      case 'up':
        focus(focused < 0 ? 0 : focused - 1);
        return;
      case 'down':
        focus(focused < 0 ? 0 : focused + 1);
        return;
      case 'left':
        step(-1);
        return;
      case 'right':
        step(1);
        return;
      case 'accept': {
        if (!current) {
          focus(0);
          return;
        }
        const screen = this.#screen;
        if (current instanceof HTMLInputElement && current.type !== 'range') {
          if (current.form) current.form.requestSubmit();
          else focus(focused + 1);
        } else if (current instanceof HTMLButtonElement || current instanceof HTMLAnchorElement) current.click();
        // A click that re-rendered the screen keeps the focus where it was on the same screen.
        if (this.open && !this.#root.contains(document.activeElement)) {
          const next = this.#controls();
          next[this.#screen === screen ? Math.min(focused, next.length - 1) : 0]?.focus();
        }
        return;
      }
      case 'back':
        if (this.#screen === 'pause') this.#callbacks.resume();
        else this.#root.querySelector<HTMLButtonElement>('[data-back]')?.click();
        return;
      case 'start':
        if (this.#screen === 'pause') this.#callbacks.resume();
        return;
    }
  }

  /**
   * The loadout screen, from the pause menu (Done goes back to it) or from
   * the death screen or the range's station (Done goes back into the game).
   */
  loadout(back: 'pause' | 'game' | 'lobby'): void {
    this.#loadoutBack = back;
    this.show('loadout');
  }

  /** The settings screen over the lobby: Back closes the menu again. */
  lobbySettings(): void {
    this.#back = 'close';
    this.show('settings');
  }

  /** When a loadout change applies in the game being played, as the loadout screen says it. */
  set loadoutNote(text: string) {
    this.#loadoutNote = text;
  }

  /** The mode being played, or null: the pause screen lists only the keys it has (the island map in a Battle Royale). */
  set matchMode(mode: ModeId | null) {
    this.#matchMode = mode;
  }

  /** Shows the one-time tip (Firefox has no raw mouse input), then runs `then`. */
  tip(then: () => void): void {
    this.#afterTip = then;
    this.show('tip');
  }

  #change(patch: Partial<Settings>): void {
    this.#settings = { ...this.#settings, ...patch };
    this.#callbacks.changeSettings(this.#settings);
    this.#afterChange?.();
  }

  #render(): void {
    const root = this.#root;
    this.#afterChange = null;
    root.replaceChildren();
    const screen = document.createElement('div');
    screen.className = 'ds-screen';
    root.append(screen);
    const h: El = (tag, text = '', cls = '') => {
      const e = document.createElement(tag);
      if (text) e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
    const button = (p: HTMLElement, text: string, onClick: () => void, kind: 'primary' | 'back' | 'big' | '' = '', iconName = '') => {
      const b = h('button', '', kind === 'primary' || kind === 'big' ? `ds-btn primary${kind === 'big' ? ' big' : ''}` : 'ds-btn') as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `${iconName ? icon(iconName) : ''}${escapeHtml(text)}`;
      if (kind === 'back') b.dataset['back'] = '';
      b.addEventListener('click', onClick);
      p.append(b);
      return b;
    };
    /** A title card at the lower left over the dimmed game, for the screens that come and go on their own. */
    const panel = (title: string, cls = '') => {
      screen.append(h('div', '', 'ds-dim'));
      const p = h('div', '', `ds-panel ${cls}`);
      p.setAttribute('role', cls === 'error' ? 'alertdialog' : 'dialog');
      p.setAttribute('aria-label', title);
      p.append(h('h2', title));
      screen.append(p);
      return p;
    };
    switch (this.#screen) {
      case 'main':
        this.#renderMain(screen, h);
        break;
      case 'online':
        this.#renderOnline(screen, h, button);
        break;
      case 'loading': {
        const p = panel(this.#loading.title);
        // The screen's one figure: how much of the map is in, or a quiet line while that is unknown.
        const figure = h('div', '', 'figure');
        figure.innerHTML = `<b>${this.#loading.progress === null ? '…' : `${Math.round(this.#loading.progress * 100)}%`}</b><span>Building the map and its baked lighting</span>`;
        p.append(figure);
        const bar = h('div', '', `ds-progress${this.#loading.progress === null ? ' busy' : ''}`);
        const fill = h('i');
        if (this.#loading.progress !== null) fill.style.width = `${Math.round(this.#loading.progress * 100)}%`;
        bar.append(fill);
        p.append(bar);
        break;
      }
      case 'connecting': {
        const p = panel('Connecting');
        const bar = h('div', '', 'ds-progress busy');
        bar.append(h('i'));
        p.append(bar);
        const steps = h('ol', '', 'ds-steps');
        ['Reaching the server', 'Loading the map', 'Joining the match'].forEach((label, i) => steps.append(h('li', label, i < this.#step ? 'done' : i === this.#step ? 'now' : '')));
        p.append(steps);
        const row = h('div', '', 'ds-btns');
        p.append(row);
        button(row, 'Cancel', () => this.#callbacks.cancelJoin(), 'back');
        break;
      }
      case 'error': {
        const e = connectionError(this.#failure);
        const p = panel(e.title, 'error');
        p.append(h('p', e.body));
        const row = h('div', '', 'ds-btns');
        p.append(row);
        if (e.kind === 'version' || e.kind === 'gpu') button(row, 'Reload', () => location.reload(), 'primary');
        else if (e.kind === 'down' || e.kind === 'full') button(row, 'Try again', () => this.#openOnline(), 'primary');
        // No server: the bots are a way to play now, not a sentence to follow.
        if (e.kind === 'down') button(row, 'Bot Match', () => this.#callbacks.botMatch());
        else if (e.kind === 'idle') button(row, 'Join again', () => this.#openOnline(), 'primary');
        else button(row, 'Play Online', () => this.show('online'), 'primary');
        // Without graphics there is no going on: only Reload.
        if (e.kind !== 'gpu') button(row, 'Main menu', () => this.show('main'), 'back');
        // The way on has the focus, so Enter does what the lit button says.
        if (!this.#root.classList.contains('pad')) queueMicrotask(() => row.querySelector('button')?.focus({ preventScroll: true }));
        break;
      }
      case 'pause':
        this.#renderPause(screen, h);
        break;
      case 'loadout':
        this.#renderLoadout(screen, h, button);
        break;
      case 'tip': {
        const p = panel('Tip for Firefox');
        p.append(
          h(
            'p',
            'Firefox cannot give the game raw mouse input, so Windows mouse acceleration applies. For consistent aim, turn off "Enhance pointer precision" in Windows mouse settings, or play in Chrome or Edge.',
          ),
        );
        const row = h('div', '', 'ds-btns');
        p.append(row);
        button(
          row,
          'Got it',
          () => {
            this.#change({ firefoxTipShown: true });
            this.hide();
            this.#afterTip?.();
          },
          'primary',
        ).dataset['back'] = '';
        break;
      }
      case 'settings':
        this.#renderSettings(screen, h, button);
        break;
      case 'profile':
        this.#renderProfile(screen, h, button);
        break;
    }
    // Keep the controller's focus on screen: the first control of a new screen.
    // Queued last, after any focus a screen sets itself.
    if (this.#root.classList.contains('pad')) {
      queueMicrotask(() => {
        if (!this.#root.contains(document.activeElement) || document.activeElement === document.body) this.#controls()[0]?.focus();
        this.#markFocus();
      });
    }
  }

  /** The theme's page shell: breadcrumb and title (with `aside` beside it), a scrolling body and a footer for the actions. */
  #page(screen: HTMLElement, h: El, crumb: string, title: string, tag: 'div' | 'form' = 'div'): { page: HTMLElement; aside: HTMLElement; body: HTMLElement; footer: HTMLElement } {
    const page = h(tag, '', 'ds-page');
    const header = h('header');
    const heading = h('div', '', 'heading');
    heading.append(h('div', crumb, 'ds-crumb'), h('h1', title));
    const aside = h('div', '', 'aside');
    header.append(heading, aside);
    const body = h('div', '', 'body');
    const footer = h('footer');
    page.append(header, body, footer);
    screen.append(page);
    return { page, aside, body, footer };
  }

  /** The key hints for a footer, taking the space between its buttons. */
  #hints(h: El, ...hints: string[]): HTMLElement {
    const el = h('div', '', 'ds-hints grow');
    el.innerHTML = hints.join('');
    return el;
  }

  #renderMain(screen: HTMLElement, h: El): void {
    const home = h('div', '', 'ds-home');
    screen.append(home);
    const top = h('div', '', 'top');
    const brand = h('div', '', 'ds-brand');
    brand.innerHTML = `<h1>Duty Shooter</h1>`;
    top.append(brand);

    // The name, remembered between visits.
    const nameBox = h('div', '', 'ds-name');
    const label = h('label');
    label.innerHTML = icon('user');
    const name = h('input') as HTMLInputElement;
    name.maxLength = 16;
    name.placeholder = 'Your name…';
    name.value = this.#settings.name;
    name.setAttribute('aria-label', 'Name');
    name.setAttribute('autocomplete', 'nickname');
    name.spellcheck = false;
    name.addEventListener('change', () => this.#change({ name: name.value.trim().slice(0, 16) }));
    label.append(name);
    nameBox.append(h('div', 'Name', 'ds-label'), label);
    // Under the name, the Rank it has earned in this browser: the way into the Profile.
    if (this.#profile) {
      const rank = h('button', '', 'ds-rankline') as HTMLButtonElement;
      rank.type = 'button';
      rank.innerHTML = rankLineHtml(this.#profile.profile);
      rank.addEventListener('click', () => {
        this.#askReset = false;
        this.show('profile');
      });
      nameBox.append(rank);
    }
    top.append(nameBox);
    home.append(top);

    const lobby = this.#lobby;
    const nav = h('nav', '', 'ds-dests');
    nav.setAttribute('aria-label', 'Main menu');
    // The title is each destination's first text: scripts find the buttons by the text they start with.
    const dest = (title: string, readout: string, onClick: () => void, lit = false, minor = false) => {
      const b = h('button', '', `ds-dest${lit ? ' lit' : ''}${minor ? ' minor' : ''}`) as HTMLButtonElement;
      b.type = 'button';
      b.style.setProperty('--i', String(nav.children.length));
      b.innerHTML = `<b>${escapeHtml(title)}</b><span class="readout">${readout}</span>`;
      b.addEventListener('click', onClick);
      nav.append(b);
      return b;
    };
    // Play Online leads, with its server's state: the Pages copy has no server of its own and sends you to the public lobby's page.
    const server = lobby?.kind === 'server';
    const link = lobby?.kind === 'link' ? lobby.url : null;
    const t = lobbyTile(server ? (lobby.status ?? null) : null);
    // The public lobby joins in one click under the name above (typed first if there is none); a private server asks for its passphrase.
    const playOnline = () => {
      if (link) return location.assign(link);
      if (!server || !lobby.public) return this.#openOnline();
      const n = name.value.trim().slice(0, 16);
      if (!n) {
        name.focus();
        return;
      }
      this.#change({ name: n });
      this.#callbacks.playOnline(n, '', null, null);
    };
    const onlineReadout = link
      ? '<span class="ds-dot up">Public lobby, on its own page</span>'
      : !server
        ? '<span class="ds-dot">No game server answers this page</span>'
        : t.online
          ? `<span class="ds-dot up">${t.full ? 'Full' : 'Online'}</span><span><em>${escapeHtml(t.players)}</em> players${t.bots > 0 ? ` + ${t.bots} bots` : ''}</span><span>${escapeHtml(t.mode)}${t.hvb ? ' vs bots' : ''} on ${escapeHtml(t.map)}</span>`
          : '<span class="ds-dot">Server offline</span><span>Try again in a minute</span>';
    dest('Play Online', onlineReadout, playOnline, server);
    dest('Battle Royale', `<span><em>${WIDE_SCALE.seats}</em> seats</span><span>Zero Island</span><span>Solos, Duos or Trios</span>`, () => this.#callbacks.battleRoyale());
    dest('Bot Match', '<span>Your own lobby against bots: any map, any mode</span><span>Offline</span>', () => this.#callbacks.botMatch(), !server);
    dest('Practice Range', '<span>Lanes, dummies and the movement course</span><span>Offline</span>', () => this.#callbacks.practiceRange());
    dest(
      'Settings',
      '',
      () => {
        this.#back = 'main';
        this.show('settings');
      },
      false,
      true,
    );
    home.append(nav);
    // The destinations rise in the first time the menu shows, and never on a redraw.
    if (!this.#entered) {
      this.#entered = true;
      home.classList.add('enter');
    }
    const footer = h('footer');
    footer.append(this.#hints(h, hint('↑↓', '✥', 'Move'), hint('Enter', '✕', 'Select')), h('div', this.#version, 'ds-version'));
    home.append(footer);
  }

  /** Play Online, opened from outside the menu (an invite link). */
  openOnline(): void {
    this.#openOnline();
  }

  /** Play Online: asks for a fresh status first, so the screen shows the server as it is now. */
  #openOnline(): void {
    this.show('online');
    void this.#callbacks.refreshLobby().then((status) => this.updateLobby(status));
  }

  #renderOnline(screen: HTMLElement, h: El, button: (p: HTMLElement, text: string, onClick: () => void, kind?: 'primary' | 'back' | 'big' | '', iconName?: string) => HTMLButtonElement): void {
    const lobby = this.#lobby;
    const open = lobby?.kind === 'server' && lobby.public;
    const t = lobbyTile(lobby?.kind === 'server' ? (lobby.status ?? null) : null);
    const { page, aside, body, footer } = this.#page(screen, h, 'Online · Play', 'Play Online', 'form');
    const form = page as HTMLFormElement;
    const chip = h('span', '', 'ds-chip');
    chip.append(h('span', t.online ? (t.full ? 'Server full' : 'Server online') : 'Server not answering', `ds-dot${t.online ? ' up' : ''}`));
    aside.append(chip);
    const cols = h('div', '', 'ds-cols');
    body.append(cols);
    const left = h('section');
    const right = h('section');
    cols.append(left, right);
    left.append(h('h2', 'The server', 'ds-h2'));
    const facts = h('div', '', 'ds-facts');
    facts.innerHTML = `<div><span class="ds-label">Players</span><span>${t.players}${t.bots > 0 ? ` + ${t.bots} bots` : ''}</span></div><div><span class="ds-label">Mode</span><span>${escapeHtml(t.mode)}${t.hvb ? ' · vs bots' : ''}</span></div><div><span class="ds-label">Map</span><span>${escapeHtml(t.map)}</span></div>`;
    left.append(facts);
    if (t.pickMode) {
      left.append(h('span', 'The server is empty: pick the mode', 'ds-field-label'));
      const modes = h('div', '', 'ds-modes');
      for (const [mode, desc] of [
        ['tdm', 'Two teams, first to 75 kills.'],
        ['ffa', 'Everyone for themselves, first to 30.'],
        ['outposts', 'Hold the zones, first to 200 points.'],
        ['charge', 'Plant or defuse in rounds, first to 4.'],
        ['gungame', 'Every kill a new gun, first up the ladder.'],
      ] as const) {
        const b = h('button', '', `ds-mode${this.#mode === mode ? ' on' : ''}`) as HTMLButtonElement;
        b.type = 'button';
        b.innerHTML = `<b>${MODE_NAMES[mode]}</b><span>${desc}</span>`;
        b.addEventListener('click', () => {
          this.#mode = mode;
          for (const m of modes.children) m.classList.toggle('on', m === b);
        });
        modes.append(b);
      }
      left.append(modes);
      if (t.maxBotsPerTeam > 0) {
        left.append(h('div', '', 'ds-gap'), h('span', 'Fill with bots', 'ds-field-label'));
        const chosen = this.#onlineBots ?? Math.min(t.botsPerTeam, t.maxBotsPerTeam);
        const sizes = [0, ...Array.from({ length: t.maxBotsPerTeam }, (_, i) => i + 1)];
        left.append(this.#choices(h, sizes, chosen, (n) => (n === 0 ? 'No bots' : `Up to ${n}v${n}`), (n) => (this.#onlineBots = n)));
      }
    } else if (t.online) {
      left.append(h('p', open ? 'Join and you go straight into the match or its lobby.' : 'Join with the passphrase you were given.', 'ds-sub'));
    } else {
      left.append(h('p', 'The game server is not answering. It may be restarting: check again in a moment. Bot Match and the Practice Range work offline meanwhile.', 'ds-sub'));
    }
    right.append(h('h2', 'Your details', 'ds-h2'));
    const box = h('div', '', 'ds-box');
    right.append(box);
    const field = (label: string, input: HTMLInputElement) => {
      const wrap = h('label', '', 'ds-field');
      wrap.append(h('span', label, 'ds-field-label'), input);
      box.append(wrap);
    };
    const name = h('input') as HTMLInputElement;
    name.maxLength = 16;
    name.required = true;
    name.value = this.#settings.name;
    name.setAttribute('autocomplete', 'nickname');
    name.spellcheck = false;
    const pass = h('input') as HTMLInputElement;
    pass.type = 'password';
    pass.value = this.#settings.passphrase;
    pass.autocomplete = 'current-password';
    field('Name', name);
    if (!open) {
      field('Passphrase', pass);
      pass.after(h('span', 'Whoever runs this server gives it out.', 'ds-field-note'));
    }
    box.append(h('div', this.#error, 'ds-error'));
    button(footer, 'Back', () => this.show('main'), 'back', 'back');
    footer.append(t.online ? this.#hints(h, hint('Enter', '✕', 'Join'), hint('Esc', '○', 'Back')) : this.#hints(h, hint('Esc', '○', 'Back')));
    const go = h('button', 'Join', 'ds-btn primary big') as HTMLButtonElement;
    go.type = 'submit';
    go.disabled = t.full || !t.online;
    // With no server the one thing that works has the primary slot: a dead Join there read as the way forward.
    if (t.online) footer.append(go);
    else button(footer, 'Check again', () => this.#openOnline(), 'big');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // With no server Enter does what the footer's button does: it looks again.
      if (!t.online) return this.#openOnline();
      const n = name.value.trim().slice(0, 16);
      if (!n) {
        name.focus();
        return;
      }
      this.#change(open ? { name: n } : { name: n, passphrase: pass.value });
      this.#callbacks.playOnline(n, open ? '' : pass.value, t.pickMode ? this.#mode : null, t.pickMode && t.maxBotsPerTeam > 0 ? this.#onlineBots : null);
    });
    // Not on a phone: a field with the focus brings the keyboard up over the page before anyone asked to type.
    if (!this.#root.classList.contains('pad') && !document.documentElement.classList.contains('ds-touch')) queueMicrotask(() => (name.value && !open ? pass : name).focus());
  }

  /** A segmented row picking one of `values`, `current` lit; `set` hears each pick. */
  #choices<T>(h: El, values: readonly T[], current: T, label: (v: T) => string, set: (v: T) => void): HTMLElement {
    const row = h('div', '', 'ds-seg');
    for (const v of values) {
      const b = h('button', label(v), v === current ? 'on' : '') as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => {
        set(v);
        for (const c of row.children) c.classList.toggle('on', c === b);
      });
      row.append(b);
    }
    return row;
  }

  /** Pause: Resume and the rest down the left, the controls as bound on the right. */
  #renderPause(screen: HTMLElement, h: El): void {
    const wrap = h('div', '', 'ds-pause');
    screen.append(wrap);
    const col = h('div', '', 'col');
    col.append(h('div', 'Match', 'ds-crumb'), h('h1', 'Paused'));
    if (this.#error) col.append(h('div', this.#error, 'ds-error'));
    const item = (title: string, onClick: () => void, primary = false) => {
      const b = h('button', '', `ds-item${primary ? ' primary' : ''}`) as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `<b>${escapeHtml(title)}</b>`;
      b.addEventListener('click', onClick);
      col.append(b);
      return b;
    };
    item('Resume', () => this.#callbacks.resume(), true);
    item('Loadout', () => this.loadout('pause'));
    item('Settings', () => {
      this.#back = 'pause';
      this.show('settings');
    });
    item('Leave', () => this.#callbacks.leave());
    wrap.append(col);
    const keys = h('div', '', 'ds-keys');
    const b = this.#settings.bindings;
    const cap = (text: string) => `<i class="ds-kbd">${escapeHtml(text)}</i>`;
    const list = (cls: string, rows: readonly (readonly [string, string])[]) => `<dl class="${cls}">${rows.map(([k, v]) => `<dt>${cap(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
    const move = `${bindingLabel(b.forward)}${bindingLabel(b.left)}${bindingLabel(b.back)}${bindingLabel(b.right)}`;
    const keyRows: (readonly [string, string])[] = [
      [move.length === 4 ? move : 'Move', 'Move'],
      ...pauseActions(this.#matchMode).map((a) => [bindingLabel(b[a]), ACTION_LABELS[a].replace(/ \(.*\)$/, '')] as const),
      ['Esc', 'Menu'],
    ];
    const touchRows = [...TOUCH_KEYS, ...(this.#matchMode === 'battle-royale' ? ([['map', 'Map']] as const) : [])];
    const touchList = `<dl class="touch-list">${touchRows.map(([g, v]) => `<dt><i class="ds-tg">${g === 'use' ? 'Use' : TOUCH_GLYPHS[g]}</i></dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>`;
    keys.innerHTML = `<h2 class="ds-h2">Controls <small class="ds-label">Rebind in Settings</small></h2>${list('key-list', keyRows)}${list('pad-list', PAD_KEYS)}${touchList}`;
    wrap.append(keys);
    const footer = h('footer');
    footer.append(this.#hints(h, hint('↑↓', '✥', 'Move'), hint('Enter', '✕', 'Select'), `<span><i class="ds-kbd pad">○</i><i class="ds-kbd key">Click</i>Resume</span>`));
    wrap.append(footer);
    if (!this.#root.classList.contains('pad')) queueMicrotask(() => (col.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true }));
  }

  /**
   * Primary, secondary and grenade as rows of tiles, and a card with the
   * focused (or chosen) weapon's role and bars. A choice is kept at once.
   */
  #renderLoadout(screen: HTMLElement, h: El, button: (p: HTMLElement, text: string, onClick: () => void, kind?: 'primary' | 'back' | 'big' | '', iconName?: string) => HTMLButtonElement): void {
    const crumb = this.#loadoutBack === 'pause' ? 'Paused' : this.#loadoutBack === 'lobby' ? 'Lobby' : 'Match';
    const { aside, body, footer } = this.#page(screen, h, crumb, 'Loadout');
    aside.append(h('span', this.#loadoutNote || 'Applies from your next spawn.', 'ds-chip'));
    const cols = h('div', '', 'ds-cols');
    body.append(cols);
    const left = h('section');
    const right = h('section');
    cols.append(left, right);
    const options = loadoutOptions();
    const card = h('div', '', 'ds-gun ds-box');
    const showCard = (id: WeaponId) => {
      const c = weaponCard(id);
      const bars = c.bars.map((b) => `<span class="k">${escapeHtml(b.label)}</span><span class="bar"><i style="width:${Math.round(b.value * 100)}%"></i></span><span class="v">${escapeHtml(b.text)}</span>`);
      card.innerHTML = `<div class="ds-label">${id === this.#settings.loadout.primary || id === this.#settings.loadout.secondary ? 'Equipped' : 'Preview'}</div><div class="name">${escapeHtml(c.name)}</div><p class="role">${escapeHtml(c.role)}</p><div class="ds-bars">${bars.join('')}</div>`;
    };
    const showKit = (id: TacticalId | PerkId | null, slot: 'tactical' | 'perk') => {
      const c = kitCard(id, slot);
      card.innerHTML = `<div class="ds-label">${(this.#settings.loadout[slot] ?? null) === id ? 'Equipped' : 'Preview'}</div><div class="name">${escapeHtml(c.name)}</div><p class="role">${escapeHtml(c.text)}</p>`;
    };
    const preview = (slot: keyof Loadout, choice: WeaponId | GrenadeId | TacticalId | PerkId | null) => {
      if (slot === 'tactical' || slot === 'perk') showKit(choice as TacticalId | PerkId | null, slot);
      else if (slot !== 'grenade') showCard(choice as WeaponId);
    };
    const row = <T extends WeaponId | GrenadeId | TacticalId | PerkId | null>(title: string, slot: keyof Loadout, choices: readonly T[], label: (c: T) => [string, string]) => {
      left.append(h('h2', title, 'ds-h2'));
      const tiles = h('div', '', 'ds-kit');
      for (const choice of choices) {
        const b = h('button', '', `ds-mode${(this.#settings.loadout[slot] ?? null) === choice ? ' on' : ''}`) as HTMLButtonElement;
        b.type = 'button';
        const [name, detail] = label(choice);
        b.innerHTML = `<b>${escapeHtml(name)}</b><span>${escapeHtml(detail)}</span>`;
        b.addEventListener('click', () => {
          this.#change({ loadout: { ...this.#settings.loadout, [slot]: choice } });
          for (const t of tiles.children) t.classList.toggle('on', t === b);
          preview(slot, choice);
        });
        if (slot !== 'grenade') {
          const show = () => preview(slot, choice);
          b.addEventListener('focus', show);
          b.addEventListener('mouseenter', show);
        }
        tiles.append(b);
      }
      left.append(tiles);
    };
    const weapon = (id: WeaponId): [string, string] => {
      const t = STATS.weapons[id].traits;
      return [t.name, t.sight === 'scope' ? 'scoped' : t.fireMode];
    };
    row('Primary', 'primary', options.primary, weapon);
    row('Secondary', 'secondary', options.secondary, weapon);
    row('Grenade', 'grenade', options.grenade, (g) => (g ? ['Frag', `${STATS.grenade.perLife.value} a life`] : ['None', 'hands free']));
    const kit = (slot: 'tactical' | 'perk') => (id: TacticalId | PerkId | null): [string, string] => {
      const c = kitCard(id, slot);
      return [c.name, c.short];
    };
    row('Tactical', 'tactical', options.tactical, kit('tactical'));
    row('Perk', 'perk', options.perk, kit('perk'));
    showCard(this.#settings.loadout.primary);
    // Back to the equipped weapon once the pointer leaves the tiles, not on every gap between two of them.
    left.addEventListener('mouseleave', () => showCard(this.#settings.loadout.primary));
    right.append(h('h2', 'Details', 'ds-h2'), card);
    footer.append(this.#hints(h, hint('↑↓', '✥', 'Move'), hint('Enter', '✕', 'Equip'), hint('Esc', '○', 'Done')));
    const done = button(footer, 'Done', () => (this.#loadoutBack === 'pause' ? this.show('pause') : this.#loadoutBack === 'lobby' ? this.hide() : this.#callbacks.resume()), 'big');
    done.dataset['back'] = '';
    if (!this.#root.classList.contains('pad')) queueMicrotask(() => done.focus({ preventScroll: true }));
  }

  /**
   * The Profile: Rank and XP, the lifetime strip, today's Challenges and the
   * weapons with their Mastery, all read from this browser's store. Erasing it
   * is asked twice, in the footer, with the way out focused.
   */
  #renderProfile(screen: HTMLElement, h: El, button: (p: HTMLElement, text: string, onClick: () => void, kind?: 'primary' | 'back' | 'big' | '', iconName?: string) => HTMLButtonElement): void {
    const store = this.#profile;
    const { body, footer } = this.#page(screen, h, 'Main menu', 'Profile');
    if (!store) return;
    const view = h('div', '', 'ds-prof');
    view.innerHTML = profileHtml(store.profile, store.today);
    body.append(view);
    const again = (ask: boolean) => {
      this.#askReset = ask;
      this.#render();
    };
    button(footer, 'Back', () => this.show('main'), 'back', 'back');
    if (this.#askReset) {
      footer.append(h('span', 'Erase your Rank, your numbers and today\'s Challenges? It can\'t be undone.', 'ds-ask'));
      const keep = button(footer, 'Keep it', () => again(false));
      button(footer, 'Erase profile', () => {
        store.reset();
        again(false);
      }).classList.add('danger');
      queueMicrotask(() => keep.focus({ preventScroll: true }));
    } else {
      footer.append(this.#hints(h, hint('↑↓', '✥', 'Move'), hint('Enter', '✕', 'Select'), hint('Esc', '○', 'Back')));
      button(footer, 'Reset profile', () => again(true));
    }
  }

  /** Marks the focused control for the controller's focus ring (the page may not have window focus, so :focus is not enough). */
  #markFocus(): void {
    for (const e of this.#root.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.#root.contains(active)) active.dataset['padFocus'] = '';
  }

  #renderSettings(screen: HTMLElement, h: El, button: (p: HTMLElement, text: string, onClick: () => void, kind?: 'primary' | 'back' | 'big' | '', iconName?: string) => HTMLButtonElement): void {
    const s = this.#settings;
    const crumb = this.#back === 'pause' ? 'Paused' : this.#back === 'close' ? 'Lobby' : 'Main menu';
    const { aside, body, footer } = this.#page(screen, h, crumb, 'Settings');
    const order = sectionOrder(touchMode());
    const tab = (this.#tab ??= order[0]!);
    const tabs = h('div', '', 'ds-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const id of order) {
      const b = h('button', SECTION_NAMES[id], this.#tab === id ? 'on' : '') as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(this.#tab === id));
      b.addEventListener('click', () => {
        if (this.#tab === id) return;
        this.#tab = id;
        this.#render();
        // The same tab keeps the focus, so the keyboard and the controller can step on through the tabs.
        (this.#root.querySelectorAll('.ds-tabs button')[[...tabs.children].indexOf(b)] as HTMLElement | undefined)?.focus();
      });
      tabs.append(b);
    }
    aside.append(tabs);
    // The rows on the left; what they change, shown, on the right (ticket 22).
    const set = h('div', '', 'ds-set solo');
    const rows = h('div', '', 'ds-rows');
    set.append(rows);
    body.append(set);
    const preview = (el: HTMLElement, after = false) => {
      set.classList.remove('solo');
      if (after) el.classList.add('after');
      set.append(el);
    };
    /** Draws the screen again with the same control in hand: for a choice that changes which rows can be used. */
    const redraw = (label: string) => {
      this.#render();
      this.#root.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.focus();
    };
    let list = h('div', '', 'list');
    /** A row: its label (with `note` under it in small type), and its control. */
    let notes = 0;
    const row = (label: string, control: HTMLElement, note = '') => {
      const r = h('div', '', 'ds-row');
      const l = h('label', label);
      if (note) {
        // The control is named by its own label; the note (or why it is off) is read out after it.
        const small = h('small', note);
        small.id = `ds-row-note-${++notes}`;
        l.append(small);
        (control.matches('input, select, button, a') ? control : control.querySelector('input, select, button'))?.setAttribute('aria-describedby', small.id);
      }
      r.append(l, control);
      list.append(r);
    };
    /** A block of settings: its name, a line on what it covers, then its rows. */
    const section = (title: string, sub: string) => {
      const block = h('section');
      list = h('div', '', 'list');
      block.append(h('h3', title), h('p', sub, 'ds-sub'), list);
      rows.append(block);
    };
    /** `off`, where given, is why the control cannot be used: it is disabled and its label says so. */
    const slider = (label: string, value: number, min: number, max: number, step: number, format: (v: number) => string, set: (v: number) => void, note = '', off = '') => {
      const wrap = h('div', '', 'ds-slider');
      const input = h('input') as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.setAttribute('aria-label', label);
      const fill = (v: number) => input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      fill(value);
      const val = h('span', format(value), 'val');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = format(v);
        fill(v);
        set(v);
      });
      wrap.append(input, val);
      input.disabled = off !== '';
      row(label, wrap, off || note);
    };
    const select = <T extends string>(label: string, value: T, options: readonly (readonly [T, string])[], set: (v: T) => void, note = '', off = '') => {
      const el = h('select') as HTMLSelectElement;
      el.setAttribute('aria-label', label);
      el.disabled = off !== '';
      for (const [v, text] of options) {
        const o = h('option', text) as HTMLOptionElement;
        o.value = v;
        o.selected = v === value;
        el.append(o);
      }
      el.addEventListener('change', () => set(el.value as T));
      row(label, el, off || note);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void, note = '', off = '') =>
      select(label, value ? 'on' : 'off', [
        ['on', 'On'],
        ['off', 'Off'],
      ], (v) => set(v === 'on'), note, off);
    const percent = (v: number) => `${Math.round(v * 100)}%`;

    /** The touch controls' own settings (ticket 23): first on a phone, last everywhere else. */
    const touchRows = () => {
      section('Touch', 'For a phone or a tablet: how far a drag turns you, and the two helps a thumb gets. Aim and Crouch are always taps here.');
      slider('Touch sensitivity', s.touchSensitivity, 1, 20, 0.5, (v) => v.toFixed(1), (v) => this.#change({ touchSensitivity: v }));
      slider('Touch aim-down-sights sensitivity', s.touchAdsMultiplier, 0.1, 2, 0.05, (v) => v.toFixed(2), (v) => this.#change({ touchAdsMultiplier: v }));
      toggle('Auto-fire (fires when the crosshair rests on an enemy)', s.touchAutoFire, (v) => this.#change({ touchAutoFire: v }));
      toggle('Aim slowdown over enemies', s.touchAimAssist, (v) => this.#change({ touchAimAssist: v }));
    };
    if (tab === 'controls') {
      section('Aim, crouch and sprint', 'Whether each button is held down or pressed once, on the keyboard, the mouse and a controller.');
      select('Aim down sights', s.adsMode, [
        ['hold', 'Hold'],
        ['toggle', 'Toggle'],
      ], (v) => this.#change({ adsMode: v }));
      select('Crouch', s.crouchMode, [
        ['toggle', 'Toggle'],
        ['hold', 'Hold'],
      ], (v) => this.#change({ crouchMode: v }));
      select('Sprint', s.sprintMode, [
        ['toggle', 'Toggle'],
        ['hold', 'Hold'],
      ], (v) => this.#change({ sprintMode: v }));
      section('Keyboard and mouse', 'Click an action, then press the key or mouse button for it. Esc cancels. A key already in use swaps over.');
      for (const action of ACTIONS) row(ACTION_LABELS[action], this.#bindButton(action, h));
    } else if (tab === 'mouse') {
      section('Mouse', 'How far a mouse move turns you, from the hip and down the sights.');
      slider('Mouse sensitivity', s.sensitivity, 0.5, 20, 0.05, (v) => v.toFixed(2), (v) => this.#change({ sensitivity: v }));
      slider('Aim-down-sights sensitivity', s.adsMultiplier, 0.1, 2, 0.01, (v) => v.toFixed(2), (v) => this.#change({ adsMultiplier: v }));
      toggle('Invert vertical mouse look', s.invertY, (v) => this.#change({ invertY: v }));
      const pad = this.#padName();
      section('Controller', pad ? `Connected: ${padName(pad)}.` : 'None detected. Connect a controller and press any button.');
      select('Button layout', s.padLayout, [
        ['default', 'Default'],
        ['tactical', 'Tactical (crouch on R3, melee on ○)'],
      ], (v) => this.#change({ padLayout: v }));
      slider('Horizontal stick sensitivity', s.padSensitivityX, 1, 20, 1, (v) => String(v), (v) => this.#change({ padSensitivityX: v }));
      slider('Vertical stick sensitivity', s.padSensitivityY, 1, 20, 1, (v) => String(v), (v) => this.#change({ padSensitivityY: v }));
      slider('Controller aim-down-sights sensitivity', s.padAdsMultiplier, 0.1, 2, 0.05, (v) => v.toFixed(2), (v) => this.#change({ padAdsMultiplier: v }));
      slider('Stick deadzone', s.padDeadzone, 0, 0.3, 0.01, (v) => v.toFixed(2), (v) => this.#change({ padDeadzone: v }));
      toggle('Invert vertical look', s.padInvertY, (v) => this.#change({ padInvertY: v }));
    } else if (tab === 'touch') {
      touchRows();
    } else if (tab === 'video') {
      section('Quality', 'How much the picture spends. Auto measures this machine once and keeps the highest tier that holds the frame rate. A new tier takes a moment to build; grass and scatter follow at the next map.');
      select('Quality', s.quality, QUALITY_CHOICES.map((c) => [c, c === 'auto' ? 'Auto' : QUALITY[c].name] as const), (v: QualityChoice) => {
        this.#change({ quality: v });
        redraw('Quality');
      });
      const again = h('button', '', 'ds-btn') as HTMLButtonElement;
      again.type = 'button';
      const measurable = () => {
        const status = this.#video();
        // Behind the main menu the map is the measurement; with a match or a lobby behind this screen, it waits for play.
        const measuring = this.#back === 'main' ? 'Measuring now' : 'Measures once you are back in play';
        const why = this.#settings.quality !== 'auto' ? 'Quality is picked by hand' : !status ? 'The map is still loading' : status.searching ? measuring : '';
        again.textContent = why || 'Measure again';
        again.disabled = why !== '';
      };
      measurable();
      again.addEventListener('click', () => {
        this.#change({ autoTier: null, autoAdapter: '' });
        redraw('Quality');
      });
      row("Auto's measurement", again);
      section('Frame rate', 'The browser draws in step with the display: V-sync is its to decide, and cannot be turned off from here. A cap draws fewer frames than the display shows.');
      toggle('Dynamic resolution', s.dynamicResolution, (v) => this.#change({ dynamicResolution: v }), 'Renders smaller when frames run long, and back up when there is room. The HUD stays sharp.');
      select('Frame-rate cap', String(s.fpsCap), capChoices(), (v) => this.#change({ fpsCap: Number(v) }));
      toggle('FPS counter', s.showFps, (v) => this.#change({ showFps: v }), 'With the render scale beside it while dynamic resolution is on.');
      section('View', 'How wide you see, and whether aiming narrows it with your field of view.');
      slider('Field of view', s.fov, STATS.input.minFov.value, STATS.input.maxFov.value, 1, (v) => `${v}°`, (v) => this.#change({ fov: v }));
      select('Aim-down-sights field of view', s.adsFov, [
        ['affected', 'Affected'],
        ['independent', 'Independent'],
      ], (v) => this.#change({ adsFov: v }));
      section('Benchmark', 'How smoothly this machine runs each map: a fly-through at the tier you pick, with a verdict, the frame times and a line to copy.');
      const bench = h('a', 'Open the benchmark', 'ds-btn') as HTMLAnchorElement;
      // The same backend as this page, where it was forced.
      bench.href = `${location.pathname}?benchmark${new URLSearchParams(location.search).has('webgl') ? '&webgl' : ''}`;
      bench.target = '_blank';
      bench.rel = 'noopener';
      row('Benchmark', bench, 'Opens in a new tab.');
      const shown = videoPreview(h, () => ({ settings: this.#settings, status: this.#video() }));
      preview(shown.root, true);
      this.#afterChange = () => {
        shown.refresh();
        measurable();
        restorable();
      };
    } else if (tab === 'audio') {
      section('Audio', 'The master sets everything. Under it, the score, the world, the announcer and the menus each have their own level.');
      slider('Master volume', s.volume, 0, 1, 0.01, percent, (v) => this.#change({ volume: v }));
      slider('Music', s.musicVolume, 0, 1, 0.01, percent, (v) => this.#change({ musicVolume: v }));
      slider('Effects', s.effectsVolume, 0, 1, 0.01, percent, (v) => this.#change({ effectsVolume: v }));
      slider('Announcer', s.voiceVolume, 0, 1, 0.01, percent, (v) => this.#change({ voiceVolume: v }));
      slider('Interface sounds', s.uiVolume, 0, 1, 0.01, percent, (v) => this.#change({ uiVolume: v }));
    } else if (tab === 'hud') {
      section('HUD', 'The readouts drawn over play, and how large they stand.');
      // A narrow screen has its own HUD layout, sized for a thumb: the scale is for the desktop one.
      const narrow = matchMedia('(max-width: 1000px)').matches;
      slider('HUD size', s.hudScale, HUD_SCALE_LIMITS[0], HUD_SCALE_LIMITS[1], 0.05, percent, (v) => this.#change({ hudScale: v }), 'Health, ammo, the feed, the match bar and the prompts. The crosshair keeps its own size.', narrow ? 'A screen this narrow keeps its own layout.' : '');
      toggle('Ping counter', s.showPing, (v) => this.#change({ showPing: v }));
      toggle('Range overlay', s.showRangeOverlay, (v) => this.#change({ showRangeOverlay: v }));
      // The first-match hints (ticket 26) keep their own memory, not a setting: this forgets it.
      const again = h('button', 'Show them again', 'ds-btn') as HTMLButtonElement;
      again.type = 'button';
      again.disabled = !hintsSeen();
      const forgotten = 'They will show again from your next spawn.';
      again.addEventListener('click', () => {
        clearHintMemory();
        again.disabled = true;
        again.closest('.ds-row')?.querySelector('small')?.replaceChildren(forgotten);
      });
      row('First-match hints', again, hintsSeen() ? 'One line at a time on how to move, aim, reload and the rest, each until you have done it once.' : 'Nothing learned yet: they show as you play.');
      section('Crosshair', 'Its shape, its colour and its size, in screen pixels.');
      const cross = (patch: Partial<CrosshairOptions>) => this.#change({ crosshair: { ...this.#settings.crosshair, ...patch } });
      const c = s.crosshair;
      const px = (v: number) => `${v} px`;
      select('Crosshair shape', c.shape, CROSSHAIR_SHAPES.map((v) => [v, CROSSHAIR_SHAPE_NAMES[v]] as const), (v) => {
        cross({ shape: v });
        redraw('Crosshair shape');
      });
      select('Crosshair colour', c.colour, (Object.keys(CROSSHAIR_COLOUR_NAMES) as CrosshairColour[]).map((v) => [v, CROSSHAIR_COLOUR_NAMES[v]] as const), (v) => cross({ colour: v }));
      const armless = c.shape === 'circle' ? 'A circle has no arms.' : c.shape === 'dot' ? 'A dot has no arms.' : '';
      const dotted = c.shape === 'dot';
      slider('Arm length', c.size, CROSSHAIR_LIMITS.size[0], CROSSHAIR_LIMITS.size[1], 1, px, (v) => cross({ size: v }), '', armless);
      slider('Gap', c.gap, CROSSHAIR_LIMITS.gap[0], CROSSHAIR_LIMITS.gap[1], 1, px, (v) => cross({ gap: v }), 'From the centre to where it starts.', dotted ? 'A dot has no gap.' : '');
      slider('Thickness', c.thickness, CROSSHAIR_LIMITS.thickness[0], CROSSHAIR_LIMITS.thickness[1], 0.5, px, (v) => cross({ thickness: v }));
      toggle('Centre dot', c.dot, (v) => cross({ dot: v }), '', dotted ? 'The dot is the crosshair.' : '');
      toggle('Opens with movement and fire', c.dynamic, (v) => cross({ dynamic: v }), 'Off, it keeps its gap whatever you do.', dotted ? 'A dot does not open.' : '');
      const shown = crosshairPreview(h, c);
      shown.root.classList.add('pinned');
      preview(shown.root);
      this.#afterChange = () => {
        shown.refresh(this.#settings.crosshair);
        restorable();
      };
    } else {
      section('Motion', 'How much the view and the weapon move with your body. At 0% the view stays level and still: nothing bobs, leans, dips or shakes.');
      slider('Camera motion', s.cameraMotion, 0, 1, 0.05, percent, (v) => this.#change({ cameraMotion: v }), 'The bob of a walk, the lean of a strafe, the dip of a landing, the sway of the weapon.');
      slider('Shake and FOV kick', s.fovEffects, 0, 1, 0.05, percent, (v) => this.#change({ fovEffects: v }), 'The shake of a shot, a hit and a blast, and the wider view of a sprint.');
      section('Colour', 'The two team colours and the enemy marker, in a set that stays apart for your eyes. The teams keep their names.');
      select('Colour vision', s.colourVision, COLOUR_VISIONS.map((v) => [v, v === 'off' ? 'Standard' : COLOUR_VISION_NAMES[v]] as const), (v) => this.#change({ colourVision: v }));
      section('Captions', "The announcer's lines as text, whatever the voice's volume.");
      toggle('Announcer captions', s.captions, (v) => this.#change({ captions: v }));
      const shown = teamPreview(h, s.colourVision);
      preview(shown.root);
      this.#afterChange = () => {
        shown.refresh(this.#settings.colourVision);
        restorable();
      };
    }
    button(footer, 'Back', () => (this.#back === 'close' ? this.hide() : this.show(this.#back)), 'back', 'back');
    // One section back as it came. With nothing changed there is nothing to press, and the button says so.
    const restore = button(footer, '', () => {
      this.#change(restoreDefaults(this.#settings, tab));
      this.#render();
      this.#root.querySelector<HTMLElement>('.ds-tabs button.on')?.focus();
    });
    const restorable = () => {
      restore.disabled = atDefaults(this.#settings, tab);
      // A phone's footer has no room for the section's name, which the tab above already carries.
      const [wide, narrow] = restore.disabled ? [`${SECTION_NAMES[tab]}: all at defaults`, 'All at defaults'] : [`Restore ${SECTION_NAMES[tab]} defaults`, 'Restore defaults'];
      restore.replaceChildren(h('span', wide, 'wide'), h('span', narrow, 'narrow'));
      restore.setAttribute('aria-label', wide);
    };
    restorable();
    this.#afterChange ??= restorable;
    tabs.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    footer.append(this.#hints(h, hint('↑↓', '✥', 'Move'), hint('←→', '✥', 'Adjust'), hint('Esc', '○', 'Back')));
    footer.append(h('span', 'Changes save as you make them', 'ds-saved'));
    footer.classList.add('ds-set-foot');
  }

  #bindButton(action: Action, h: El): HTMLElement {
    const b = h('button', bindingLabel(this.#settings.bindings[action]), 'ds-bind') as HTMLButtonElement;
    b.type = 'button';
    b.dataset['action'] = action;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.textContent = 'Press a key…';
      b.classList.add('wait');
      // Let this click finish before listening, or it would bind itself.
      await new Promise((r) => setTimeout(r, 0));
      const code = await this.#callbacks.captureKey();
      if (code && code !== 'Escape') {
        // A key bound elsewhere is swapped, so no action is left unbound.
        const bindings = { ...this.#settings.bindings };
        const clash = ACTIONS.find((a) => a !== action && bindings[a] === code);
        if (clash) bindings[clash] = bindings[action];
        bindings[action] = code;
        this.#change({ bindings });
      }
      this.#render();
      // Back on the same action, so the next one is a step away.
      this.#root.querySelector<HTMLElement>(`.ds-bind[data-action="${action}"]`)?.focus();
    });
    return b;
  }

  dispose(): void {
    this.#root.remove();
  }
}
