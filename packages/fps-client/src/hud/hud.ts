import type { PlayerOutput, Score } from '@duty-shooter/fps-core';

const CSS = `
.ds-hud { position: fixed; inset: 0; pointer-events: none; font: 600 14px/1.2 'Rajdhani', 'Segoe UI', system-ui, sans-serif; color: #f2f4f5; text-shadow: 0 1px 2px rgb(0 0 0 / 0.8); user-select: none; z-index: 5; }
.ds-hud * { box-sizing: border-box; }
.ds-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: opacity 80ms linear; }
.ds-cross i { position: absolute; background: #fff; box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.55); }
.ds-cross i.h { width: 9px; height: 2px; top: -1px; }
.ds-cross i.v { width: 2px; height: 9px; left: -1px; }
.ds-cross b { position: absolute; left: -1px; top: -1px; width: 2px; height: 2px; background: #fff; box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.5); }
.ds-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
.ds-hit i { position: absolute; width: 11px; height: 2.4px; background: #fff; left: -5.5px; top: -1.2px; box-shadow: 0 0 2px rgb(0 0 0 / 0.6); }
.ds-hit.kill i { background: #ff2a2a; }
.ds-hit.head i { width: 15px; left: -7.5px; height: 3px; }
.ds-dmg { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.ds-dmg div { position: absolute; left: -70px; top: -230px; width: 140px; height: 40px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; border-top: 6px solid rgb(255 40 30 / 0.85); filter: blur(0.6px); transform-origin: 70px 230px; }
.ds-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgb(140 0 0 / 0.75) 100%); opacity: 0; }
.ds-ammo { position: absolute; right: 42px; bottom: 34px; text-align: right; }
.ds-ammo .mag { font-size: 44px; font-weight: 700; letter-spacing: 1px; }
.ds-ammo .mag.low { color: #ff5a4a; }
.ds-ammo .res { font-size: 20px; opacity: 0.75; margin-left: 6px; }
.ds-ammo .name { font-size: 13px; letter-spacing: 3px; opacity: 0.7; text-transform: uppercase; }
.ds-ammo .bar { height: 3px; background: rgb(255 255 255 / 0.25); margin-top: 6px; }
.ds-ammo .bar i { display: block; height: 100%; background: #f2f4f5; }
.ds-feed { position: absolute; left: 24px; top: 70px; display: flex; flex-direction: column; gap: 4px; }
.ds-feed div { background: rgb(10 12 14 / 0.55); padding: 4px 10px; border-left: 3px solid #f2c14e; transition: opacity 400ms linear; }
.ds-feed .you { border-left-color: #6bd4ff; }
.ds-feed .gun { opacity: 0.7; margin: 0 6px; font-size: 12px; }
.ds-stats { position: absolute; right: 16px; top: 12px; font-size: 12px; opacity: 0.85; text-align: right; font-variant-numeric: tabular-nums; }
.ds-center { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); font-size: 22px; letter-spacing: 2px; text-transform: uppercase; text-align: center; }
.ds-overlay { position: absolute; left: 24px; bottom: 26px; background: rgb(10 12 14 / 0.6); border: 1px solid rgb(255 255 255 / 0.12); padding: 10px 12px; font-size: 13px; display: grid; grid-template-columns: auto auto; gap: 2px 14px; align-items: center; font-variant-numeric: tabular-nums; }
.ds-overlay canvas { grid-column: 1 / 3; margin-top: 6px; background: rgb(0 0 0 / 0.35); }
.ds-overlay .k { opacity: 0.65; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
.ds-board { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); min-width: 420px; background: rgb(10 12 14 / 0.82); padding: 14px 18px; display: none; }
.ds-board table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.ds-board th { text-align: left; font-size: 11px; letter-spacing: 1.5px; opacity: 0.6; padding: 4px 6px; }
.ds-board td { padding: 5px 6px; border-top: 1px solid rgb(255 255 255 / 0.08); }
.ds-board tr.you td { color: #6bd4ff; }
.ds-toast { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); max-width: 560px; background: rgb(10 12 14 / 0.85); border: 1px solid rgb(242 193 78 / 0.6); padding: 10px 14px; font-size: 14px; line-height: 1.4; opacity: 0; transition: opacity 300ms; }
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
  readonly selfId: string | null;
  readonly showScoreboard: boolean;
  /** A centred message (e.g. "connecting"), or null. */
  readonly message: string | null;
  readonly dt: number;
}

export type HitKind = 'hit' | 'kill' | 'headshot' | 'headshotKill';

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
  readonly #dmg: HTMLDivElement;
  readonly #indicators: Indicator[] = [];
  readonly #vignette: HTMLDivElement;
  readonly #mag: HTMLSpanElement;
  readonly #reserve: HTMLSpanElement;
  readonly #bar: HTMLElement;
  readonly #feed: HTMLDivElement;
  readonly #stats: HTMLDivElement;
  readonly #center: HTMLDivElement;
  readonly #overlay: HTMLDivElement;
  readonly #ttk: HTMLSpanElement;
  readonly #dist: HTMLSpanElement;
  readonly #shots: HTMLSpanElement;
  readonly #trace: HTMLCanvasElement;
  readonly #board: HTMLDivElement;
  readonly #toast: HTMLDivElement;
  #toastTime = 0;
  #traceShots: { yaw: number; pitch: number }[] = [];
  #flash = 0;

  constructor(parent: HTMLElement) {
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
    this.root = el('div', 'ds-hud', parent);
    this.#vignette = el('div', 'ds-vignette', this.root);
    this.#cross = el('div', 'ds-cross', this.root, '<i class="h"></i><i class="h"></i><i class="v"></i><i class="v"></i><b></b>');
    this.#arms = [...this.#cross.querySelectorAll('i')] as HTMLElement[];
    this.#hit = el('div', 'ds-hit', this.root, '<i></i><i></i><i></i><i></i>');
    [...this.#hit.querySelectorAll('i')].forEach((i, n) => {
      const a = 45 + n * 90;
      (i as HTMLElement).style.transform = `rotate(${a}deg) translateX(12px)`;
    });
    this.#dmg = el('div', 'ds-dmg', this.root);
    const ammo = el('div', 'ds-ammo', this.root, '<div class="name">M4A1</div><span class="mag">30</span><span class="res">90</span><div class="bar"><i></i></div>');
    this.#mag = ammo.querySelector('.mag') as HTMLSpanElement;
    this.#reserve = ammo.querySelector('.res') as HTMLSpanElement;
    this.#bar = ammo.querySelector('.bar i') as HTMLElement;
    this.#feed = el('div', 'ds-feed', this.root);
    this.#stats = el('div', 'ds-stats', this.root);
    this.#center = el('div', 'ds-center', this.root);
    this.#overlay = el(
      'div',
      'ds-overlay',
      this.root,
      '<span class="k">TTK</span><span class="ttk">–</span><span class="k">Distance</span><span class="dist">–</span><span class="k">Shots / hits</span><span class="shots">–</span><canvas width="180" height="150"></canvas>',
    );
    this.#ttk = this.#overlay.querySelector('.ttk') as HTMLSpanElement;
    this.#dist = this.#overlay.querySelector('.dist') as HTMLSpanElement;
    this.#shots = this.#overlay.querySelector('.shots') as HTMLSpanElement;
    this.#trace = this.#overlay.querySelector('canvas') as HTMLCanvasElement;
    this.#board = el('div', 'ds-board', this.root);
    this.#toast = el('div', 'ds-toast', this.root);
  }

  set visible(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }

  hitMarker(kind: HitKind): void {
    this.#hit.className = `ds-hit${kind === 'kill' || kind === 'headshotKill' ? ' kill' : ''}${kind === 'headshot' || kind === 'headshotKill' ? ' head' : ''}`;
    this.#hitAge = 0;
  }

  /** A hit taken from an attacker at world yaw `worldYaw` (the direction from you to them). */
  damage(worldYaw: number): void {
    const div = document.createElement('div');
    this.#dmg.append(div);
    this.#indicators.push({ el: div, worldYaw, age: 0 });
    this.#flash = 1;
  }

  killFeed(killer: string | null, victim: string, headshot: boolean, involvesYou: boolean): void {
    const row = document.createElement('div');
    if (involvesYou) row.className = 'you';
    const k = killer ?? '';
    row.innerHTML = `${escape(k)}<span class="gun">${killer ? (headshot ? '✛ M4A1' : 'M4A1') : '☠'}</span>${escape(victim)}`;
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
    this.#cross.style.opacity = hide ? '0' : '1';
    const gap = Math.max(4, (w?.spread ?? 2) * state.pixelsPerDegree);
    const [left, right, up, down] = this.#arms;
    if (left && right && up && down) {
      left.style.left = `${-gap - 9}px`;
      right.style.left = `${gap}px`;
      up.style.top = `${-gap - 9}px`;
      down.style.top = `${gap}px`;
    }

    this.#hitAge += dt;
    this.#hit.style.opacity = String(Math.max(0, 1 - this.#hitAge / 0.28));
    const scale = 1 + Math.max(0, 0.12 - this.#hitAge) * 2.5;
    this.#hit.style.transform = `scale(${scale})`;

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
    this.#vignette.style.opacity = String(Math.min(1, hurt * 0.9 + this.#flash * 0.35));

    if (w) {
      this.#mag.textContent = String(w.ammo);
      this.#mag.classList.toggle('low', w.ammo <= 6);
      this.#reserve.textContent = String(w.reserve);
      this.#bar.style.width = `${(w.ammo / 30) * 100}%`;
    }

    const stats: string[] = [];
    if (state.showFps) stats.push(`${Math.round(state.fps)} FPS`);
    if (state.showPing && state.ping !== null) stats.push(`${Math.round(state.ping)} ms`);
    this.#stats.textContent = stats.join('  ·  ');
    this.#center.textContent = state.message ?? (self && !self.alive ? 'You died' : '');

    this.#overlay.style.display = state.showOverlay ? '' : 'none';
    this.#dist.textContent = state.targetDistance === null ? '–' : `${state.targetDistance.toFixed(1)} m`;

    this.#board.style.display = state.showScoreboard && state.scores.length > 0 ? 'block' : 'none';
    if (state.showScoreboard) {
      this.#board.innerHTML = `<table><tr><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>K/D</th></tr>${state.scores
        .map((s) => `<tr class="${s.id === state.selfId ? 'you' : ''}"><td>${escape(s.name)}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${(s.kills / Math.max(1, s.deaths)).toFixed(2)}</td></tr>`)
        .join('')}</table>`;
    }

    if (this.#toastTime > 0) {
      this.#toastTime -= dt;
      if (this.#toastTime <= 0) this.#toast.style.opacity = '0';
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
