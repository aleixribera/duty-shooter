import { GUN_GAME_KILLS_PER_GUN, GUN_GAME_LADDER_LENGTH, STATS, teamMode, type KillWeapon, type ModeId, type PlayerId, type Score, type TeamId, type Vec3 } from '@duty-shooter/fps-core';
import type { PresentedEvent } from '../session';
import { TEAMS } from '../ui/model';
import { pingCallout } from '../ui/pings';
import { rebootFeed } from '../ui/reboot';
import { killLeaderLine, squadWipedParts } from '../ui/royale';
import { dropAnnouncement } from '../ui/supply-drop';

/**
 * What an event says to the player in words: a line in the objective feed,
 * a kill feed row, the callout under the crosshair for an elimination, and a
 * toast. Pure, so what each event tells whom is testable without a scene;
 * the game sounds, shows and remembers the rest.
 */
export interface EventWords {
  readonly feed?: { readonly text: string; readonly team: number; readonly mine: boolean; readonly tail?: string };
  readonly kill?: {
    readonly killer: string | null;
    readonly victim: string;
    readonly headshot: boolean;
    readonly mine: boolean;
    readonly bots: { readonly killer?: boolean; readonly victim?: boolean };
    readonly weapon: string;
    readonly teams: { readonly killer?: number | undefined; readonly victim?: number | undefined };
    readonly down: boolean;
  };
  readonly eliminated?: { readonly victim: string; readonly headshot: boolean };
  readonly toast?: { readonly text: string; readonly seconds: number };
}

/** What the words need to know about the match beyond the event. */
export interface EventWordsContext {
  readonly selfId: PlayerId | null;
  readonly online: boolean;
  readonly mode: ModeId | null;
  readonly scores: readonly Score[];
  /** Your own soldier's team and whether it is alive, or null with none. */
  readonly self: { readonly team: TeamId; readonly alive: boolean } | null;
  nameOf(id: PlayerId): string;
  /** The island's grid cell under a point ('' off the island). */
  cell(position: Vec3): string;
  /** The key that uses things, as the player has bound it. */
  readonly useLabel: string;
  readonly serverTime: number;
  /** When a Battle Royale's Supply Drop of this stage lands (server time), if known. */
  dropLands(stage: number): number | undefined;
}

/** How a kill feed line names what did it. */
export function killedWith(cause: string, weapon: KillWeapon | null): string {
  if (cause === 'melee') return 'Melee';
  if (cause === 'ring') return 'The Ring';
  if (cause === 'bleedOut') return 'Bled out';
  if (cause === 'wipe') return 'Squad out';
  if (weapon === 'frag') return 'Frag';
  return weapon ? STATS.weapons[weapon].traits.name : '';
}

const NONE: EventWords = {};

/** The events that can say anything: the rest (shots, impacts, blasts...) are only seen and heard. */
export const WORDY: ReadonlySet<PresentedEvent['type']> = new Set<PresentedEvent['type']>(['kill', 'killFeed', 'revive', 'capture', 'drop', 'card', 'reboot', 'squadOut', 'killLeader', 'ping', 'loose', 'charge', 'level']);

export function eventWords(e: PresentedEvent, ctx: EventWordsContext): EventWords {
  const selfId = ctx.selfId;
  const teamOf = (id: PlayerId | null) => ctx.scores.find((s) => s.id === id)?.team;
  const isBot = (id: PlayerId | null) => ctx.scores.some((s) => s.id === id && s.bot);
  switch (e.type) {
    case 'kill': {
      // Offline, the kill itself is the feed; online the server sends a killFeed event.
      if (ctx.online) return NONE;
      const killer = e.killer === null || e.killer === e.victim ? null : ctx.nameOf(e.killer);
      const victim = ctx.nameOf(e.victim);
      const headshot = e.zone === 'head';
      return {
        kill: { killer, victim, headshot, mine: e.killer === selfId || e.victim === selfId, bots: {}, weapon: killedWith(e.cause, e.weapon), teams: {}, down: false },
        ...(e.killer === selfId && e.victim !== selfId ? { eliminated: { victim, headshot } } : {}),
      };
    }
    case 'killFeed':
      return {
        kill: {
          killer: e.killer === null || e.killer === e.victim ? null : e.killerName,
          victim: e.victimName,
          headshot: e.headshot,
          mine: e.killer === selfId || e.victim === selfId,
          bots: { killer: isBot(e.killer), victim: isBot(e.victim) },
          weapon: killedWith(e.cause, e.weapon),
          teams: teamMode(ctx.mode ?? 'ffa') ? { killer: teamOf(e.killer), victim: teamOf(e.victim) } : {},
          down: e.down ?? false,
        },
      };
    case 'revive': {
      // Only your own side hears who was brought back.
      const team = teamOf(e.target);
      if (team === undefined || team !== teamOf(selfId)) return NONE;
      return { feed: { text: `${ctx.nameOf(e.reviver)} Revived ${ctx.nameOf(e.target)}`, team, mine: e.reviver === selfId || e.target === selfId } };
    }
    case 'capture': {
      const team = TEAMS[e.team]?.name ?? 'A team';
      const lost = e.previous !== 0 ? ` from ${TEAMS[e.previous]?.name ?? 'the other team'}` : '';
      return { feed: { text: `${team} took ${e.zone}${lost}`, team: e.team, mine: ctx.self?.team === e.team || ctx.self?.team === e.previous } };
    }
    case 'drop': {
      const cell = ctx.cell(e.position);
      if (e.action === 'announce') {
        const lands = ctx.dropLands(e.stage);
        return { toast: { text: dropAnnouncement(cell, lands === undefined ? STATS.royale.supplyDrop.warning.value : lands - ctx.serverTime), seconds: 6 } };
      }
      if (e.action === 'open' && e.player !== null) {
        const mine = e.player === selfId;
        return { feed: { text: `${mine ? 'You' : ctx.nameOf(e.player)} took the sniper from the Supply Drop${cell ? ` in ${cell}` : ''}`, team: teamOf(e.player) ?? 0, mine } };
      }
      return NONE;
    }
    case 'card':
    case 'reboot': {
      const cell = ctx.cell(e.position);
      const line = rebootFeed(e, cell);
      const mine = e.player === selfId || (e.type === 'reboot' && e.seats.includes(selfId ?? ''));
      const feed = line ? { text: line, team: teamOf(e.player) ?? 0, mine } : undefined;
      let toast: EventWords['toast'];
      if (e.type === 'card' && e.action === 'take' && e.player === selfId) toast = { text: `You carry ${e.ownerName}'s Reboot Card: take it to a Beacon and hold ${ctx.useLabel}.`, seconds: 5 };
      else if (e.type === 'card' && e.action === 'drop' && e.owner !== selfId && teamOf(e.owner) === teamOf(selfId) && ctx.self?.alive)
        toast = { text: `${e.ownerName}'s Reboot Card lies where they fell${cell ? ` in ${cell}` : ''}: ${STATS.royale.reboot.cardTime.value} s to take it.`, seconds: 5 };
      else if (e.type === 'reboot' && e.action === 'done' && selfId !== null && e.seats.includes(selfId))
        toast = { text: `Rebooted by ${e.playerName}: back with ${STATS.royale.reboot.health.value} HP and ${STATS.royale.reboot.frags.value} frag.`, seconds: 5 };
      return { ...(feed ? { feed } : {}), ...(toast ? { toast } : {}) };
    }
    case 'squadOut': {
      // Duos and Trios only (the mode's call): in Solos the kill feed has said it.
      const ownTeam = teamOf(selfId);
      const byUs = e.by !== null && ctx.scores.some((s) => s.team === ownTeam && s.name === e.by);
      const [text, tail] = squadWipedParts(e);
      return { feed: { text, team: e.team, mine: e.team === ownTeam || byUs, tail } };
    }
    case 'killLeader': {
      const you = e.player === selfId;
      return {
        feed: { text: killLeaderLine(e.name, e.kills, you), team: e.team, mine: you },
        ...(you ? { toast: { text: `You are the Kill Leader: ${e.kills} eliminations, and everyone can see it.`, seconds: 4 } } : {}),
      };
    }
    case 'ping': {
      const mine = e.player === selfId;
      const name = mine ? 'You' : ctx.nameOf(e.player);
      // An enemy ping is a moving target: no grid cell for it.
      return { feed: { text: pingCallout(e.kind, name, e.kind === 'enemy' ? '' : ctx.cell(e.position)), team: e.team, mine } };
    }
    case 'loose':
      if (e.player !== selfId) return NONE;
      return { toast: { text: `${STATS.weapons[e.weapon].traits.name} in hand${e.left ? `; your ${STATS.weapons[e.left].traits.name} lies where it was` : ''}.`, seconds: 3 } };
    case 'charge': {
      const who = e.player === null ? null : e.player === selfId ? 'You' : ctx.nameOf(e.player);
      // Where the charge lies is the attackers' to know: defenders hear only of the plant and what follows.
      if (ctx.self?.team !== e.team && e.action !== 'plant' && e.action !== 'defuse' && e.action !== 'detonate') return NONE;
      const text =
        e.action === 'pickup'
          ? `${who} picked up the charge`
          : e.action === 'drop'
            ? `${who} dropped the charge`
            : e.action === 'plant'
              ? `${who} planted the charge at ${e.site}`
              : e.action === 'defuse'
                ? `${who} defused the charge`
                : `The charge detonated at ${e.site}`;
      return { feed: { text, team: e.team, mine: e.player === selfId } };
    }
    case 'level': {
      const gun = STATS.weapons[e.weapon].traits.name;
      const last = e.level === GUN_GAME_LADDER_LENGTH - 1;
      if (e.player === selfId) {
        const text = e.demoted ? `Clubbed: knocked back a gun's worth of kills, on gun ${e.level + 1}, the ${gun}.` : `Gun ${e.level + 1}: the ${gun}${last ? `. ${GUN_GAME_KILLS_PER_GUN} kills with it win.` : '.'}`;
        return { toast: { text, seconds: 3 } };
      }
      if (last && !e.demoted) return { feed: { text: `${ctx.nameOf(e.player)} is on the last gun`, team: 0, mine: false } };
      return NONE;
    }
    default:
      return NONE;
  }
}
