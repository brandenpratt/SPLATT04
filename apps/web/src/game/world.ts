import {
  Coverage,
  GameEvent,
  INTERPOLATION_DELAY_MS,
  MarkerId,
  NetPlayer,
  NetProjectile,
  PaintOwner,
  PlayerState,
  RoundPhase,
  TeamId,
  cellIndex,
  createGrid,
  createPlayerState,
  worldToCol,
  worldToRow,
} from '@splat04/shared';

export interface InterpSample {
  t: number;
  x: number;
  z: number;
  ax: number;
  az: number;
  alive: boolean;
  boosting: boolean;
}

export interface RenderPlayer {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  marker: MarkerId;
  tags: number;
  connected: boolean;
  /** Interpolated render position. */
  x: number;
  z: number;
  aimX: number;
  aimZ: number;
  alive: boolean;
  boosting: boolean;
  shielded: boolean;
  /** Visual-only, driven by the renderer. */
  bob: number;
  lean: number;
  recoil: number;
  splatBurst: number;
  buffer: InterpSample[];
}

export interface RenderProjectile {
  id: number;
  team: TeamId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  progress: number;
  radius: number;
  /** Client-side dead reckoning between snapshots. */
  lastUpdate: number;
}

export interface Splat {
  x: number;
  z: number;
  team: TeamId;
  born: number;
  scale: number;
}

/**
 * All high-frequency game state lives here, deliberately outside React.
 * Components read it inside `useFrame`; React state is reserved for UI transitions.
 */
export class GameWorld {
  grid = createGrid();
  /** Bumped whenever the grid changes so the floor texture knows to re-upload. */
  gridVersion = 0;

  players = new Map<string, RenderPlayer>();
  projectiles = new Map<number, RenderProjectile>();
  coverSplats: Splat[] = [];

  localId = '';
  localTeam: TeamId = TeamId.Cyan;
  /** Authoritative-plus-predicted state for the local player. */
  local: PlayerState = createPlayerState('local', 'You', TeamId.Cyan, false, { x: -36.5, z: 0 });

  coverage: Coverage = { cyan: 0, magenta: 0, neutral: 100 };
  phase: RoundPhase = 'active';
  phaseEndsAt = 0;

  connected = false;
  mode: 'range' | 'online' | 'practice' = 'range';
  /** Remote-player interpolation delay. Zero for local modes, which have no jitter. */
  interpolationDelayMs = INTERPOLATION_DELAY_MS;

  /** serverTime - performance-based local clock, smoothed. */
  serverTimeOffset = 0;
  latencyMs = 0;

  // --- diagnostics, read by the developer panel ---------------------------
  serverTickRate = 20;
  snapshotRate = 0;
  inputSeq = 0;
  ackedSeq = 0;
  /** Timestamp of the local player's most recent outgoing shot, for view-model recoil. */
  lastShotAt = 0;
  private snapshotTimes: number[] = [];

  /** Records a snapshot arrival so the panel can show the observed rate. */
  noteSnapshot(now: number): void {
    this.snapshotTimes.push(now);
    while (this.snapshotTimes.length > 20) this.snapshotTimes.shift();
    const span = this.snapshotTimes[this.snapshotTimes.length - 1] - this.snapshotTimes[0];
    this.snapshotRate = span > 0 ? ((this.snapshotTimes.length - 1) * 1000) / span : 0;
  }

  /** Advisory only: the crosshair reddens when the muzzle is against cover. */
  muzzleBlocked = false;
  /** Mirrored from the server each snapshot, for the saturation HUD. */
  saturation = 0;
  shieldUntil = 0;
  /** Team colour of the most recent hit taken, for the edge splat effect. */
  lastHit: { team: number; at: number } | null = null;

  callout: { text: string; at: number } | null = null;
  pendingEvents: GameEvent[] = [];

  reset(): void {
    this.grid = createGrid();
    this.gridVersion++;
    this.players.clear();
    this.projectiles.clear();
    this.coverSplats.length = 0;
  }

  now(): number {
    return Date.now() + this.serverTimeOffset;
  }

  sampleOwner = (x: number, z: number): PaintOwner => {
    const col = worldToCol(x);
    const row = worldToRow(z);
    if (col < 0 || row < 0) return PaintOwner.Neutral;
    return this.grid[cellIndex(col, row)] as PaintOwner;
  };

  /** Fold a snapshot's player list into the interpolation buffers. */
  ingestPlayers(list: NetPlayer[], serverTime: number): void {
    const seen = new Set<string>();
    for (const net of list) {
      seen.add(net.id);
      let player = this.players.get(net.id);
      if (!player) {
        player = {
          id: net.id,
          name: net.n,
          team: net.tm,
          isBot: net.b === 1,
          marker: net.mk,
          tags: net.tg,
          connected: net.c === 1,
          x: net.x,
          z: net.z,
          aimX: net.ax,
          aimZ: net.az,
          alive: net.a === 1,
          boosting: net.bs === 1,
          shielded: net.sh === 1,
          bob: Math.random() * Math.PI * 2,
          lean: 0,
          recoil: 0,
          splatBurst: 0,
          buffer: [],
        };
        this.players.set(net.id, player);
      }

      player.name = net.n;
      player.team = net.tm;
      player.marker = net.mk;
      player.tags = net.tg;
      player.connected = net.c === 1;
      player.shielded = net.sh === 1;
      const wasAlive = player.buffer.length ? player.buffer[player.buffer.length - 1].alive : true;
      if (wasAlive && net.a === 0) player.splatBurst = 1;

      player.buffer.push({
        t: serverTime,
        x: net.x,
        z: net.z,
        ax: net.ax,
        az: net.az,
        alive: net.a === 1,
        boosting: net.bs === 1,
      });
      // Keep roughly half a second of history.
      while (player.buffer.length > 12) player.buffer.shift();
    }

    for (const id of this.players.keys()) if (!seen.has(id)) this.players.delete(id);
  }

  ingestProjectiles(list: NetProjectile[], now: number): void {
    const seen = new Set<number>();
    for (const net of list) {
      seen.add(net.id);
      const existing = this.projectiles.get(net.id);
      if (existing) {
        existing.x = net.x;
        existing.z = net.z;
        existing.vx = net.vx;
        existing.vz = net.vz;
        existing.progress = net.p;
        existing.lastUpdate = now;
      } else {
        this.projectiles.set(net.id, {
          id: net.id,
          team: net.tm,
          x: net.x,
          z: net.z,
          vx: net.vx,
          vz: net.vz,
          progress: net.p,
          radius: net.r,
          lastUpdate: now,
        });
      }
    }
    for (const id of this.projectiles.keys()) if (!seen.has(id)) this.projectiles.delete(id);
  }

  /**
   * Advance render state: remote players are interpolated ~120ms in the past,
   * projectiles are dead-reckoned forward between snapshots.
   */
  interpolate(nowLocal: number, dt: number): void {
    const renderTime = nowLocal + this.serverTimeOffset - this.interpolationDelayMs;

    for (const player of this.players.values()) {
      if (player.id === this.localId) {
        // The local player is predicted, not interpolated.
        player.x = this.local.x;
        player.z = this.local.z;
        player.aimX = this.local.aimX;
        player.aimZ = this.local.aimZ;
        player.alive = this.local.alive;
        player.boosting = nowLocal + this.serverTimeOffset < this.local.boostUntil;
      } else {
        applyInterpolation(player, renderTime);
      }
      const speed = player.alive ? 1 : 0;
      player.bob += dt * (player.boosting ? 14 : 9) * speed;
      const targetLean = player.boosting ? 0.32 : 0;
      player.lean += (targetLean - player.lean) * Math.min(1, dt * 8);
      player.recoil = Math.max(0, player.recoil - dt * 6);
      player.splatBurst = Math.max(0, player.splatBurst - dt * 1.6);
    }

    for (const projectile of this.projectiles.values()) {
      const elapsed = (nowLocal - projectile.lastUpdate) / 1000;
      if (elapsed > 0 && elapsed < 0.4) {
        projectile.x += projectile.vx * dt;
        projectile.z += projectile.vz * dt;
      }
    }

    const cutoff = nowLocal - 9000;
    if (this.coverSplats.length > 0 && this.coverSplats[0].born < cutoff) {
      this.coverSplats = this.coverSplats.filter((s) => s.born >= cutoff);
    }
  }

  addCoverSplat(x: number, z: number, team: TeamId, now: number): void {
    // Bounded pool: oldest splats fall off rather than growing without limit.
    if (this.coverSplats.length >= 64) this.coverSplats.shift();
    this.coverSplats.push({ x, z, team, born: now, scale: 0.7 + Math.random() * 0.8 });
  }
}

function applyInterpolation(player: RenderPlayer, renderTime: number): void {
  const buffer = player.buffer;
  if (buffer.length === 0) return;
  if (buffer.length === 1 || renderTime <= buffer[0].t) {
    const only = buffer[0];
    player.x = only.x;
    player.z = only.z;
    player.aimX = only.ax;
    player.aimZ = only.az;
    player.alive = only.alive;
    player.boosting = only.boosting;
    return;
  }

  for (let i = 0; i < buffer.length - 1; i++) {
    const a = buffer[i];
    const b = buffer[i + 1];
    if (renderTime >= a.t && renderTime <= b.t) {
      const span = b.t - a.t || 1;
      const k = (renderTime - a.t) / span;
      player.x = a.x + (b.x - a.x) * k;
      player.z = a.z + (b.z - a.z) * k;
      player.aimX = a.ax + (b.ax - a.ax) * k;
      player.aimZ = a.az + (b.az - a.az) * k;
      player.alive = b.alive;
      player.boosting = b.boosting;
      return;
    }
  }

  // Ahead of the newest sample: hold the last known pose rather than extrapolating
  // into cover, which reads much worse than a brief stall.
  const last = buffer[buffer.length - 1];
  player.x = last.x;
  player.z = last.z;
  player.aimX = last.ax;
  player.aimZ = last.az;
  player.alive = last.alive;
  player.boosting = last.boosting;
}
