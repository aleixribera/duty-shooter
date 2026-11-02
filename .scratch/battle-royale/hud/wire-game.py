p = 'packages/fps-client/src/game.ts'
s = open(p, encoding='utf8').read()


def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:80], s.count(a))
    s = s.replace(a, b)


rep("""import { ZoneRings } from './zone-rings';""", """import { ZoneRings } from './zone-rings';
import { RingWall } from './ring-wall';
import { RingSounds } from './ring-sounds';
import { Spectator } from './spectate';
import type { RoyaleHudState } from './hud/royale-hud';
import { heading, placement, ringNow, ringStatus, type RingPhase } from './ui/royale';""")
rep("""  type ChargeState,
""", """  type BattleRoyaleState,
  type ChargeState,
""")
rep("""  /** The teammate a dead player watches in Charge, while they live. */
  #watching: PlayerId | null = null;""", """  /** Who a player out of the fight watches (Charge, Battle Royale), and where the camera following them stood last frame. */
  readonly #spectator = new Spectator();
  #follow: { eye: Vec3; yaw: number; pitch: number; id: PlayerId } | null = null;
  /** Who last put the local player out, for the spectator. */
  #killer: PlayerId | null = null;
  /** The Battle Royale's wall in the world and its sound (Zero Island only), and what the Ring was doing last frame. */
  readonly #ringWall: RingWall | null;
  readonly #ringSounds = new RingSounds();
  #ringPhase: RingPhase | null = null;""")
rep("""    this.#zoneRings = new ZoneRings(this.#worldView.scene, this.#zones);
""", """    this.#zoneRings = new ZoneRings(this.#worldView.scene, this.#zones);
    this.#ringWall = options.content.places && options.content.terrain ? new RingWall(this.#worldView.scene) : null;
""")
rep("""    this.hud = new Hud(document.body);
""", """    this.hud = new Hud(document.body);
    if (options.content.places && options.content.terrain) this.hud.setIsland({ terrain: options.content.terrain, colors: options.content.terrainColors ?? [0x808080], places: options.content.places });
""")
rep("""    const pieces: Object3D[] = [...this.#zoneRings.meshes];""", """    const pieces: Object3D[] = [...this.#zoneRings.meshes];
    if (this.#ringWall) pieces.push(this.#ringWall.mesh);""")
rep("""    const watched = this.#spectated();
    if (watched) {
      // Dead in Charge: the camera rides behind the watched teammate, pulled in short of any wall.
      const head: Vec3 = [watched.position[0], watched.position[1] + watched.eyeHeight + 0.35, watched.position[2]];
      const back = viewDirection(watched.yaw, 0);
      const want: Vec3 = [head[0] - back[0] * 2.6, head[1] + 0.4, head[2] - back[2] * 2.6];
      const hit = raycastWorld(this.#world, head, want);
      const t = hit ? Math.max(0, hit.t - 0.1) : 1;
      eye = [head[0] + (want[0] - head[0]) * t, head[1] + (want[1] - head[1]) * t, head[2] + (want[2] - head[2]) * t];
      const pitch = Math.max(-0.5, Math.min(0.4, watched.pitch)) - 0.12;
      const cam = this.#camera.camera;
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.rotation.set(pitch, watched.yaw, 0);
      forward = viewDirection(watched.yaw, pitch);
      this.#viewmodel.root.visible = false;
    }""", """    const watched = this.overviewOnly ? null : this.#spectated();
    if (watched) {
      // Out of the fight: the camera rides behind the watched player, pulled in short of any wall, and eases after them.
      const head: Vec3 = [watched.position[0], watched.position[1] + watched.eyeHeight + 0.35, watched.position[2]];
      const back = viewDirection(watched.yaw, 0);
      const want: Vec3 = [head[0] - back[0] * 2.6, head[1] + 0.4, head[2] - back[2] * 2.6];
      const hit = raycastWorld(this.#world, head, want);
      const t = hit ? Math.max(0, hit.t - 0.1) : 1;
      const target: Vec3 = [head[0] + (want[0] - head[0]) * t, head[1] + (want[1] - head[1]) * t, head[2] + (want[2] - head[2]) * t];
      const targetPitch = Math.max(-0.5, Math.min(0.4, watched.pitch)) - 0.12;
      // A new player to watch cuts to them; the same one is followed smoothly.
      const same = this.#follow?.id === watched.id ? this.#follow : null;
      const k = same ? 1 - Math.exp(-dt * 12) : 1;
      const from = same ?? { eye: target, yaw: watched.yaw, pitch: targetPitch };
      eye = [from.eye[0] + (target[0] - from.eye[0]) * k, from.eye[1] + (target[1] - from.eye[1]) * k, from.eye[2] + (target[2] - from.eye[2]) * k];
      const yaw = from.yaw + angleDelta(from.yaw, watched.yaw) * k;
      const pitch = from.pitch + (targetPitch - from.pitch) * k;
      this.#follow = { eye, yaw, pitch, id: watched.id };
      const cam = this.#camera.camera;
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.rotation.set(pitch, yaw, 0);
      forward = viewDirection(yaw, pitch);
      this.#viewmodel.root.visible = false;
      this.#worldView.follow(watched.position);
    } else this.#follow = null;""")
rep("""    this.#zoneRings.update(driver?.match?.phase === 'playing' && objective?.kind === 'outposts' ? objective.zones : null, performance.now() / 1000);""", """    this.#zoneRings.update(driver?.match?.phase === 'playing' && objective?.kind === 'outposts' ? objective.zones : null, performance.now() / 1000);
    this.#updateRing(driver, eye);""")
rep("""  /** The living teammate a dead player watches in Charge (the same one while they live), or null. */
  #spectated(): PlayerOutput | null {
    const self = this.#cur;
    if (!self || self.alive || !this.#charge) {
      this.#watching = null;
      return null;
    }
    const mates = this.#others.filter((p) => p.alive && p.kind === 'player' && p.team === self.team).sort((a, b) => (a.id < b.id ? -1 : 1));
    const watched = mates.find((p) => p.id === this.#watching) ?? mates[0] ?? null;
    this.#watching = watched?.id ?? null;
    return watched;
  }""", """  /** Who a player out of the fight watches (see Spectator), or null. Charge's dead wait for the next round; Battle Royale's are out for the match. */
  #spectated(): PlayerOutput | null {
    const match = this.#driver?.match;
    const mode = match?.mode ?? null;
    const playing = match?.phase === 'playing' && (mode !== 'charge' || this.#charge !== null);
    const id = this.#spectator.update({ mode, playing, self: this.#cur, players: this.#others, killer: this.#killer });
    return id === null ? null : (this.#others.find((p) => p.id === id) ?? null);
  }

  /** The Battle Royale in play, or null. */
  get #royale(): BattleRoyaleState | null {
    const match = this.#driver?.match;
    return match?.phase === 'playing' && match.objective?.kind === 'battle-royale' ? match.objective : null;
  }

  /** The Ring's wall where it stands now, its hum and crackle round the listener, and its warning as it starts to close. */
  #updateRing(driver: GameDriver | null, listener: Vec3): void {
    if (!this.#ringWall) return;
    const state = this.#royale;
    const ring = state && driver ? ringNow(state, driver.serverTime) : null;
    const now = performance.now() / 1000;
    this.#ringWall.update(ring, now);
    for (const c of this.#ringSounds.update(ring, now, listener)) this.#play(c.event, c.params);
    const phase = state && driver ? ringStatus(state, driver.serverTime, null).phase : null;
    if (phase === 'closing' && this.#ringPhase === 'hold') {
      this.#play('ringShift');
      this.hud.toast('The Ring is closing.', 3);
    }
    this.#ringPhase = phase;
  }

  /** The Battle Royale HUD: the Ring, the compass from where the view stands, the count, your placement and who you watch. */
  #royaleHud(forward: Vec3): RoyaleHudState | null {
    const state = this.#royale;
    const driver = this.#driver;
    if (!state || !driver) return null;
    const self = this.#cur;
    const watched = this.#spectator.watching === null ? null : this.#playerById(this.#spectator.watching);
    const view = self?.alive ? self : watched;
    const team = self?.team ?? null;
    const mates = team === null ? [] : this.#others.filter((p) => p.alive && p.kind === 'player' && p.team === team && p.id !== view?.id);
    return {
      status: ringStatus(state, driver.serverTime, self?.alive ? self.position : null),
      ring: ringNow(state, driver.serverTime),
      next: state.next,
      alive: state.alive,
      squads: state.squads,
      kills: driver.scores.find((s) => s.id === driver.selfId)?.kills ?? 0,
      heading: heading(Math.atan2(-forward[0], -forward[2])),
      at: view ? { x: view.position[0], z: view.position[2] } : null,
      mates: mates.map((p) => ({ name: driver.nameOf(p.id), x: p.position[0], z: p.position[2], downed: p.downed !== null })),
      placement: placement(driver.scores, driver.selfId),
      out: !self?.alive,
      watching: watched ? driver.nameOf(watched.id) : null,
      mapKey: bindingLabel(this.#settings.bindings.map),
      leaveKey: 'Esc',
      mapOpen: this.input.mapOpen,
    };
  }""")
rep("""    const watched = this.#watching;
    return {""", """    const watched = this.#spectator.watching;
    return {""")
rep("""      charge: this.#chargeHud(eye),
      dt,""", """      charge: this.#chargeHud(eye),
      royale: this.#royaleHud(forward),
      dt,""")
rep("""      case 'killFeed':
""", """      case 'killFeed':
        if (e.victim === selfId && !e.down) this.#killer = e.killer === selfId ? null : e.killer;
""")
rep("""      case 'matchStart':
        this.hud.toast('New match.', 3);""", """      case 'matchStart':
        this.#killer = null;
        this.hud.toast('New match.', 3);""")
rep("""    this.#zoneRings.dispose();
""", """    this.#zoneRings.dispose();
    this.#ringWall?.dispose();
""")
open(p, 'w', encoding='utf8').write(s)
print('ok')
