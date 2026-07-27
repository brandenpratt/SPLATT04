import {
  ANNOUNCER_CALLOUTS,
  ARENA_SLUG,
  BOT_NAMES,
  Coverage,
  GameEvent,
  INTERMISSION_SECONDS,
  MARKERS,
  MarkerId,
  NetPlayer,
  NetProjectile,
  PaintOwner,
  PlayerInput,
  PlayerRoundSummary,
  PlayerState,
  ProjectileState,
  RECONNECT_GRACE_MS,
  ROOM_SIZE,
  ROUND_SECONDS,
  RESPAWN_SECONDS,
  RoundPhase,
  SPAWNS,
  TeamId,
  cellsToPercent,
  computeCoverage,
  createGrid,
  createPlayerState,
  createProjectile,
  emptyInput,
  generateToken,
  markerUnlocked,
  stampCircle,
  stepPlayer,
  stepProjectile,
  tryFire,
  worldToCol,
  worldToRow,
  cellIndex,
  computeRoundReward,
} from '@splat04/shared';
import { BotBrain, hashString, personalityFor } from './bots.js';

export interface ServerPlayer extends PlayerState {
  guestId: string;
  reconnectToken: string;
  brain: BotBrain | null;
  /** null for bots and for humans currently in their reconnect grace window. */
  send: ((message: unknown) => void) | null;
  lastInput: PlayerInput;
  lastAckSeq: number;
  disconnectedAt: number;
  unlockAll: boolean;
  matchesCompleted: number;
  challengeId: string | null;
  round: {
    tags: number;
    splatted: number;
    cellsGained: number;
    assists: number;
    /** True once the player has been present for a full round. */
    presentAtStart: boolean;
  };
  /** Time of this player's last shot, used to award assists. */
  lastShotAt: number;
}

let projectileSequence = 1;

/**
 * One continuous broadcast: 90-second rounds separated by 8-second intermissions,
 * with bots keeping every slot full. The room owns all authoritative state.
 */
export class Room {
  readonly grid: Uint8Array = createGrid();
  readonly players = new Map<string, ServerPlayer>();
  readonly projectiles: ProjectileState[] = [];

  phase: RoundPhase = 'active';
  phaseEndsAt: number;
  coverage: Coverage = { cyan: 0, magenta: 0, neutral: 100 };

  private dirty = new Set<number>();
  private events: GameEvent[] = [];
  private playerSequence = 0;
  private calloutState = { lastTen: false, bigSplat: 0, repaint: false };
  private lastRoundSummaries: PlayerRoundSummary[] = [];

  constructor(
    readonly id: string,
    private readonly now: () => number = Date.now,
    /** Injectable so tests can run the whole room deterministically. */
    private readonly random: () => number = Math.random,
  ) {
    this.phaseEndsAt = this.now() + ROUND_SECONDS * 1000;
    this.fillWithBots();
  }

  // --- population --------------------------------------------------------

  get humanCount(): number {
    let count = 0;
    for (const p of this.players.values()) if (!p.isBot) count++;
    return count;
  }

  get connectedHumanCount(): number {
    let count = 0;
    for (const p of this.players.values()) if (!p.isBot && p.send) count++;
    return count;
  }

  teamCount(team: TeamId): number {
    let count = 0;
    for (const p of this.players.values()) if (p.team === team) count++;
    return count;
  }

  hasCapacityForHuman(): boolean {
    // A room is joinable while any slot is free *or* held by a bot.
    if (this.players.size < ROOM_SIZE) return true;
    for (const p of this.players.values()) if (p.isBot) return true;
    return false;
  }

  /**
   * Smaller team wins; ties are broken deterministically from room state so two
   * simultaneous joins cannot both pick the same side.
   */
  pickTeam(preferred?: TeamId): TeamId {
    const cyan = this.teamCount(TeamId.Cyan);
    const magenta = this.teamCount(TeamId.Magenta);
    if (preferred !== undefined) {
      const preferredCount = preferred === TeamId.Cyan ? cyan : magenta;
      if (preferredCount < ROOM_SIZE / 2) return preferred;
    }
    if (cyan < magenta) return TeamId.Cyan;
    if (magenta < cyan) return TeamId.Magenta;
    return this.players.size % 2 === 0 ? TeamId.Cyan : TeamId.Magenta;
  }

  private spawnPointFor(team: TeamId, index: number): { x: number; z: number } {
    const options = SPAWNS[team];
    return options[index % options.length];
  }

  private fillWithBots(): void {
    let index = 0;
    while (this.players.size < ROOM_SIZE) {
      const team = this.pickTeam();
      const used = new Set(Array.from(this.players.values()).map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `BOT_${index}`;
      this.addBot(name, team, index++);
    }
  }

  private addBot(name: string, team: TeamId, index: number): ServerPlayer {
    const id = `bot_${++this.playerSequence}`;
    const personality = personalityFor(name, index);
    const base = createPlayerState(id, name, team, true, this.spawnPointFor(team, index));
    base.marker = personality.marker;
    const bot: ServerPlayer = {
      ...base,
      guestId: id,
      reconnectToken: '',
      brain: new BotBrain(personality, hashString(name) ^ index),
      send: null,
      lastInput: emptyInput(personality.marker),
      lastAckSeq: 0,
      disconnectedAt: 0,
      unlockAll: true,
      matchesCompleted: 99,
      challengeId: null,
      round: { tags: 0, splatted: 0, cellsGained: 0, assists: 0, presentAtStart: true },
      lastShotAt: 0,
    };
    this.players.set(id, bot);
    return bot;
  }

  /**
   * Seat a human. Reuses a preserved slot on reconnect, otherwise takes a bot's place
   * on the smaller team. Returns the seated player.
   */
  joinHuman(options: {
    guestId: string;
    displayName: string;
    marker: MarkerId;
    unlockAll: boolean;
    matchesCompleted: number;
    preferredTeam?: TeamId;
    reconnectToken?: string;
    challengeId?: string;
    send: (message: unknown) => void;
  }): ServerPlayer {
    const existing = this.findReconnectable(options.guestId, options.reconnectToken);
    if (existing) {
      existing.send = options.send;
      existing.connected = true;
      existing.disconnectedAt = 0;
      existing.brain = null;
      existing.name = options.displayName;
      existing.unlockAll = options.unlockAll;
      existing.matchesCompleted = options.matchesCompleted;
      this.applyMarker(existing, options.marker);
      return existing;
    }

    const team = this.pickTeam(options.preferredTeam);
    const victim = this.pickBotToReplace(team);
    const id = `p_${++this.playerSequence}`;
    const spawnIndex = this.teamCount(team);
    const base = createPlayerState(
      id,
      options.displayName,
      team,
      false,
      victim ? { x: victim.x, z: victim.z } : this.spawnPointFor(team, spawnIndex),
    );

    const player: ServerPlayer = {
      ...base,
      guestId: options.guestId,
      reconnectToken: generateToken(),
      brain: null,
      send: options.send,
      lastInput: emptyInput(options.marker),
      lastAckSeq: 0,
      disconnectedAt: 0,
      unlockAll: options.unlockAll,
      matchesCompleted: options.matchesCompleted,
      challengeId: options.challengeId ?? null,
      round: {
        tags: 0,
        splatted: 0,
        cellsGained: 0,
        assists: 0,
        presentAtStart: this.phase === 'intermission',
      },
      lastShotAt: 0,
    };
    this.applyMarker(player, options.marker);

    if (victim) {
      // Humans take a bot's slot at a safe boundary: during intermission, or while the
      // bot is already splatted. Otherwise the bot is popped into a harmless paint burst
      // so the seat frees up inside the 2s respawn window.
      const safeNow = this.phase === 'intermission' || !victim.alive;
      if (safeNow) {
        this.players.delete(victim.id);
        player.alive = true;
        const spawn = this.spawnPointFor(team, spawnIndex);
        player.x = spawn.x;
        player.z = spawn.z;
      } else {
        this.splat(victim, null);
        this.players.delete(victim.id);
        player.alive = false;
        player.respawnAt = this.now() + RESPAWN_SECONDS * 1000;
      }
    }

    this.players.set(id, player);
    this.events.push({ e: 'join', name: player.name });
    this.fillWithBots();
    return player;
  }

  private pickBotToReplace(team: TeamId): ServerPlayer | null {
    if (this.players.size < ROOM_SIZE) return null;
    let fallback: ServerPlayer | null = null;
    for (const p of this.players.values()) {
      if (!p.isBot) continue;
      if (p.team === team) {
        if (!p.alive) return p; // already at a safe boundary
        fallback ??= p;
      }
    }
    if (fallback) return fallback;
    // Room is full of humans on this team; take any bot at all.
    for (const p of this.players.values()) if (p.isBot) return p;
    return null;
  }

  private findReconnectable(guestId: string, token?: string): ServerPlayer | null {
    if (!token) return null;
    for (const p of this.players.values()) {
      if (p.isBot || p.send) continue;
      if (p.guestId === guestId && p.reconnectToken === token) return p;
    }
    return null;
  }

  /** Preserve the slot for ~20s and let a bot drive it in the meantime. */
  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    player.send = null;
    player.connected = false;
    player.disconnectedAt = this.now();
    player.brain = new BotBrain(
      personalityFor(player.name, this.players.size),
      hashString(player.id),
    );
    this.events.push({ e: 'leave', name: player.name });
  }

  private reapAbandonedSlots(now: number): void {
    for (const [id, player] of this.players) {
      if (player.isBot || player.send) continue;
      if (now - player.disconnectedAt > RECONNECT_GRACE_MS) {
        this.players.delete(id);
      }
    }
    if (this.players.size < ROOM_SIZE) this.fillWithBots();
  }

  applyMarker(player: ServerPlayer, marker: MarkerId): void {
    // Marker ownership is enforced server-side; an unowned pick silently stays on Compressor.
    if (markerUnlocked(marker, player.matchesCompleted, player.unlockAll)) {
      player.marker = marker;
    }
  }

  setInput(playerId: string, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot || !player.send) return;
    // Out-of-order or replayed packets are dropped rather than rewinding the sim.
    if (input.seq <= player.lastAckSeq) return;
    player.lastInput = input;
    player.lastAckSeq = input.seq;
    if (input.selectedMarker !== player.marker) this.applyMarker(player, input.selectedMarker);
  }

  // --- simulation --------------------------------------------------------

  sampleOwner = (x: number, z: number): PaintOwner => {
    const col = worldToCol(x);
    const row = worldToRow(z);
    if (col < 0 || row < 0) return PaintOwner.Neutral;
    return this.grid[cellIndex(col, row)] as PaintOwner;
  };

  tick(dtSeconds: number): void {
    const now = this.now();
    this.reapAbandonedSlots(now);

    if (now >= this.phaseEndsAt) {
      if (this.phase === 'active') this.endRound(now);
      else this.startRound(now);
    }

    const active = this.phase === 'active';
    const ctx = { now, sampleOwner: this.sampleOwner };
    // Materialised once: both the bot brains and the projectile step traverse the
    // roster repeatedly, and a live map iterator would be exhausted after one pass.
    const roster = Array.from(this.players.values());

    for (const player of roster) {
      if (!player.alive) {
        if (now >= player.respawnAt) this.respawn(player, now);
        continue;
      }

      const input = player.brain
        ? player.brain.think(player, { now, grid: this.grid, players: roster })
        : player.lastInput;

      // During intermission players may skate around, but nobody shoots.
      stepPlayer(player, input, dtSeconds, ctx);
      if (!active) continue;

      const shots = tryFire(player, input, now, this.random);
      for (const shot of shots) {
        this.projectiles.push(createProjectile(projectileSequence++, player, shot, now));
        player.lastShotAt = now;
      }
    }

    if (active) this.stepProjectiles(dtSeconds, now, roster);

    this.coverage = computeCoverage(this.grid);
    if (active) this.updateCallouts(now);
  }

  private stepProjectiles(dtSeconds: number, now: number, roster: readonly PlayerState[]): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const owner = this.players.get(projectile.ownerId);
      const result = stepProjectile(projectile, dtSeconds, roster);

      const paint = (spot: { x: number; z: number; radius: number }): void => {
        const stamp = stampCircle(
          this.grid,
          spot.x,
          spot.z,
          spot.radius,
          projectile.team as number as PaintOwner,
          this.dirty,
        );
        if (owner) {
          owner.round.cellsGained += stamp.gained;
          owner.cellsPainted += stamp.gained;
        }
        if (stamp.gained > 90) this.calloutState.bigSplat = now;
      };

      if (result.dribble) paint(result.dribble);
      if (result.splash) paint(result.splash);

      if (result.tagged) {
        this.splat(result.tagged as ServerPlayer, owner ?? null);
      }
      if (result.coverHit) {
        // Cosmetic only — cover cells are excluded from the paintable mask.
        this.events.push({
          e: 'cover',
          x: result.coverHit.x,
          z: result.coverHit.z,
          tm: projectile.team,
        });
      }
      if (result.dead) this.projectiles.splice(i, 1);
    }
  }

  private splat(victim: ServerPlayer, tagger: ServerPlayer | null): void {
    if (!victim.alive) return;
    const now = this.now();
    victim.alive = false;
    victim.vx = 0;
    victim.vz = 0;
    victim.burstRemaining = 0;
    victim.respawnAt = now + RESPAWN_SECONDS * 1000;
    victim.splatted++;
    victim.round.splatted++;

    // The victim bursts into a harmless splash of the tagger's colour.
    const burstTeam = tagger
      ? tagger.team
      : victim.team === TeamId.Cyan
        ? TeamId.Magenta
        : TeamId.Cyan;
    stampCircle(this.grid, victim.x, victim.z, 1.9, burstTeam as number as PaintOwner, this.dirty);

    if (tagger) {
      tagger.tags++;
      tagger.round.tags++;
      // Team-mates who were shooting nearby get the assist.
      for (const mate of this.players.values()) {
        if (mate.id === tagger.id || mate.team !== tagger.team) continue;
        const near = Math.hypot(mate.x - victim.x, mate.z - victim.z) < 14;
        if (near && now - mate.lastShotAt < 3000) mate.round.assists++;
      }
      this.events.push({
        e: 'tag',
        by: tagger.id,
        on: victim.id,
        x: victim.x,
        z: victim.z,
        tm: tagger.team,
      });
    }
  }

  private respawn(player: ServerPlayer, now: number): void {
    const index = Array.from(this.players.values())
      .filter((p) => p.team === player.team)
      .indexOf(player);
    const spawn = this.spawnPointFor(player.team, Math.max(0, index));
    player.alive = true;
    player.x = spawn.x;
    player.z = spawn.z;
    player.vx = 0;
    player.vz = 0;
    player.nextFireAt = now;
    player.burstRemaining = 0;
    player.spreadHeat = 0;
    this.events.push({ e: 'spawn', id: player.id, x: spawn.x, z: spawn.z });
  }

  // --- round flow --------------------------------------------------------

  private endRound(now: number): void {
    this.phase = 'intermission';
    this.phaseEndsAt = now + INTERMISSION_SECONDS * 1000;
    this.projectiles.length = 0;

    const coverage = computeCoverage(this.grid);
    this.coverage = coverage;
    const winner =
      coverage.cyan === coverage.magenta
        ? null
        : coverage.cyan > coverage.magenta
          ? TeamId.Cyan
          : TeamId.Magenta;

    this.lastRoundSummaries = [];
    for (const player of this.players.values()) {
      const areaPercent = cellsToPercent(player.round.cellsGained);
      const won = winner !== null && player.team === winner;
      const reward = computeRoundReward({
        tags: player.round.tags,
        netAreaPercent: areaPercent,
        won,
        completedRound: player.round.presentAtStart,
      });
      this.lastRoundSummaries.push({
        playerId: player.id,
        name: player.name,
        team: player.team,
        tags: player.round.tags,
        splatted: player.round.splatted,
        areaPaintedPercent: areaPercent,
        assists: player.round.assists,
        xpGained: reward.xp,
        creditsGained: reward.credits,
        won,
      });
    }

    const message = {
      t: 'roundEnd' as const,
      winner,
      coverage,
      summaries: this.lastRoundSummaries,
      nextRoundAt: this.phaseEndsAt,
    };
    this.broadcast(message);
    this.events.push({ e: 'callout', text: ANNOUNCER_CALLOUTS.cooked });
  }

  private startRound(now: number): void {
    this.phase = 'active';
    this.phaseEndsAt = now + ROUND_SECONDS * 1000;
    this.grid.fill(0);
    // A wiped grid is cheaper to resend in full than as ~9k deltas.
    this.dirty.clear();
    this.projectiles.length = 0;
    this.calloutState = { lastTen: false, bigSplat: 0, repaint: false };

    this.rebalanceTeams();

    let index = 0;
    for (const player of this.players.values()) {
      player.round = { tags: 0, splatted: 0, cellsGained: 0, assists: 0, presentAtStart: true };
      player.cellsPainted = 0;
      player.tags = 0;
      player.splatted = 0;
      player.alive = true;
      player.boostUntil = 0;
      player.boostReadyAt = 0;
      player.nextFireAt = 0;
      player.burstRemaining = 0;
      player.spreadHeat = 0;
      const spawn = this.spawnPointFor(player.team, index++);
      player.x = spawn.x;
      player.z = spawn.z;
      player.vx = 0;
      player.vz = 0;
      player.brain?.resetForRound();
    }
    this.coverage = computeCoverage(this.grid);
    this.broadcastFullGrid();
  }

  /** Teams are only rebalanced at an intermission boundary. Bots move before humans. */
  private rebalanceTeams(): void {
    for (let guard = 0; guard < ROOM_SIZE; guard++) {
      const cyan = this.teamCount(TeamId.Cyan);
      const magenta = this.teamCount(TeamId.Magenta);
      if (Math.abs(cyan - magenta) < 2) return;
      const from = cyan > magenta ? TeamId.Cyan : TeamId.Magenta;
      const to = from === TeamId.Cyan ? TeamId.Magenta : TeamId.Cyan;
      const candidates = Array.from(this.players.values()).filter((p) => p.team === from);
      const mover = candidates.find((p) => p.isBot) ?? candidates[candidates.length - 1];
      if (!mover) return;
      mover.team = to;
    }
  }

  private updateCallouts(now: number): void {
    const remaining = this.phaseEndsAt - now;
    if (!this.calloutState.lastTen && remaining <= 10_000) {
      this.calloutState.lastTen = true;
      this.events.push({ e: 'callout', text: ANNOUNCER_CALLOUTS.lastTen });
    }
    if (this.calloutState.bigSplat === now) {
      this.events.push({ e: 'callout', text: ANNOUNCER_CALLOUTS.bigSplat });
    }
    if (!this.calloutState.repaint && (this.coverage.cyan > 70 || this.coverage.magenta > 70)) {
      this.calloutState.repaint = true;
      this.events.push({ e: 'callout', text: ANNOUNCER_CALLOUTS.totalRepaint });
    }
  }

  // --- networking --------------------------------------------------------

  private netPlayers(now: number): NetPlayer[] {
    const out: NetPlayer[] = [];
    for (const p of this.players.values()) {
      out.push({
        id: p.id,
        n: p.name,
        tm: p.team,
        b: p.isBot ? 1 : 0,
        x: round2(p.x),
        z: round2(p.z),
        ax: round2(p.aimX),
        az: round2(p.aimZ),
        a: p.alive ? 1 : 0,
        bs: now < p.boostUntil ? 1 : 0,
        mk: p.marker,
        tg: p.round.tags,
        c: p.send || p.isBot ? 1 : 0,
      });
    }
    return out;
  }

  private netProjectiles(): NetProjectile[] {
    return this.projectiles.map((p) => ({
      id: p.id,
      tm: p.team,
      x: round2(p.x),
      z: round2(p.z),
      vx: round2(p.vx),
      vz: round2(p.vz),
      p: Math.min(1, p.travelled / Math.max(0.001, p.range)),
      r: p.splashRadius,
    }));
  }

  /** Drain up to `budget` dirty cells; anything left rides the next snapshot. */
  private takeDelta(budget: number): number[] {
    const delta: number[] = [];
    if (this.dirty.size === 0) return delta;
    let taken = 0;
    for (const idx of this.dirty) {
      delta.push(idx, this.grid[idx]);
      this.dirty.delete(idx);
      if (++taken >= budget) break;
    }
    return delta;
  }

  broadcastSnapshot(deltaBudget: number): void {
    const now = this.now();
    const players = this.netPlayers(now);
    const projectiles = this.netProjectiles();
    const delta = this.takeDelta(deltaBudget);
    const events = this.events;
    this.events = [];

    for (const player of this.players.values()) {
      if (!player.send) continue;
      player.send({
        t: 'snap',
        st: now,
        ack: player.lastAckSeq,
        players,
        projectiles,
        delta,
        coverage: this.coverage,
        phase: this.phase,
        phaseEndsAt: this.phaseEndsAt,
        events,
        self: {
          x: player.x,
          z: player.z,
          vx: player.vx,
          vz: player.vz,
          alive: player.alive ? 1 : 0,
          respawnAt: player.respawnAt,
          boostReadyAt: player.boostReadyAt,
          boostUntil: player.boostUntil,
        },
      });
    }
  }

  private broadcastFullGrid(): void {
    // Round reset: the grid is uniformly neutral, so tell clients to clear rather than
    // shipping thousands of no-op deltas.
    this.broadcast({ t: 'gridReset' });
  }

  broadcast(message: unknown): void {
    for (const player of this.players.values()) player.send?.(message);
  }

  get summaries(): PlayerRoundSummary[] {
    return this.lastRoundSummaries;
  }

  get arenaSlug(): string {
    return ARENA_SLUG;
  }

  markerSpecs(): MarkerId[] {
    return Object.keys(MARKERS) as MarkerId[];
  }

  /** Test seam: force the current phase to end on the next tick. */
  forcePhaseEnd(): void {
    this.phaseEndsAt = 0;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
