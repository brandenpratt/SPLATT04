import {
  BOT_NAMES,
  INTERMISSION_SECONDS,
  MarkerId,
  PaintOwner,
  PlayerInput,
  PlayerState,
  ProjectileState,
  ROUND_SECONDS,
  RESPAWN_SECONDS,
  SPAWNS,
  TeamId,
  computeCoverage,
  createPlayerState,
  createProjectile,
  emptyInput,
  stampCircle,
  stepPlayer,
  stepProjectile,
  tryFire,
} from '@splat04/shared';
import { GameWorld } from './world.js';

export interface TargetDummy {
  id: number;
  x: number;
  z: number;
  hit: boolean;
  hitAt: number;
}

/**
 * Runs the *same* shared rules locally.
 *
 * Two uses: the instant target-range boot flow, and the `Practice with bots` fallback
 * when a WebSocket cannot be established. Practice results are local only and are
 * labelled as such in the UI — they are never presented as online play.
 */
export class LocalGame {
  readonly players: PlayerState[] = [];
  readonly projectiles: ProjectileState[] = [];
  targets: TargetDummy[] = [];

  phase: 'active' | 'intermission' = 'active';
  phaseEndsAt = 0;
  private nextProjectileId = 1;
  private botInputs = new Map<string, PlayerInput>();
  private botTimers = new Map<string, number>();

  constructor(
    private readonly world: GameWorld,
    readonly kind: 'range' | 'practice',
  ) {
    const local = createPlayerState(
      'local',
      'You',
      TeamId.Cyan,
      false,
      kind === 'range' ? { x: -6, z: 6 } : SPAWNS[TeamId.Cyan][0],
    );
    world.local = local;
    world.localId = 'local';
    world.localTeam = TeamId.Cyan;
    world.mode = kind;
    // A local sim has no network jitter to hide, so render the newest state directly.
    world.interpolationDelayMs = 0;
    this.phaseEndsAt = Date.now() + ROUND_SECONDS * 1000;

    if (kind === 'range') {
      // Three inflatable targets, close enough to hit in the first few seconds.
      this.targets = [
        { id: 0, x: 4, z: -2, hit: false, hitAt: 0 },
        { id: 1, x: 9, z: 5, hit: false, hitAt: 0 },
        { id: 2, x: 5, z: 12, hit: false, hitAt: 0 },
      ];
    } else {
      this.spawnBots();
    }
  }

  private spawnBots(): void {
    for (let i = 0; i < 7; i++) {
      const team = i % 2 === 0 ? TeamId.Magenta : TeamId.Cyan;
      const spawn = SPAWNS[team][i % SPAWNS[team].length];
      const bot = createPlayerState(`local_bot_${i}`, BOT_NAMES[i], team, true, spawn);
      this.players.push(bot);
      this.botInputs.set(bot.id, emptyInput());
      this.botTimers.set(bot.id, 0);
    }
  }

  get targetsRemaining(): number {
    return this.targets.filter((t) => !t.hit).length;
  }

  setMarker(marker: MarkerId): void {
    this.world.local.marker = marker;
  }

  step(dtSeconds: number, input: PlayerInput): void {
    const now = Date.now();
    const world = this.world;
    const local = world.local;
    const ctx = { now, sampleOwner: world.sampleOwner };

    if (this.kind === 'practice' && now >= this.phaseEndsAt) {
      if (this.phase === 'active') {
        this.phase = 'intermission';
        this.phaseEndsAt = now + INTERMISSION_SECONDS * 1000;
      } else {
        this.phase = 'active';
        this.phaseEndsAt = now + ROUND_SECONDS * 1000;
        world.grid.fill(0);
        world.gridVersion++;
      }
    }
    world.phase = this.phase;
    world.phaseEndsAt = this.phaseEndsAt;

    // Local player
    if (!local.alive && now >= local.respawnAt) {
      const spawn = SPAWNS[local.team][0];
      local.alive = true;
      local.x = spawn.x;
      local.z = spawn.z;
      local.vx = 0;
      local.vz = 0;
    }
    stepPlayer(local, input, dtSeconds, ctx);
    for (const shot of tryFire(local, input, now, Math.random)) {
      this.projectiles.push(createProjectile(this.nextProjectileId++, local, shot, now));
    }

    // Simple wandering bots — practice mode is a fallback, not a showcase.
    for (const bot of this.players) {
      if (!bot.alive) {
        if (now >= bot.respawnAt) {
          const spawn = SPAWNS[bot.team][0];
          bot.alive = true;
          bot.x = spawn.x;
          bot.z = spawn.z;
        }
        continue;
      }
      const timer = this.botTimers.get(bot.id) ?? 0;
      if (now >= timer) {
        this.botTimers.set(bot.id, now + 900 + Math.random() * 1200);
        const angle = Math.random() * Math.PI * 2;
        this.botInputs.set(bot.id, {
          ...emptyInput(bot.marker),
          moveX: Math.cos(angle),
          moveZ: Math.sin(angle),
          aimX: Math.cos(angle),
          aimZ: Math.sin(angle),
          firing: Math.random() < 0.7,
        });
      }
      const botInput = this.botInputs.get(bot.id)!;
      stepPlayer(bot, botInput, dtSeconds, ctx);
      for (const shot of tryFire(bot, botInput, now, Math.random)) {
        this.projectiles.push(createProjectile(this.nextProjectileId++, bot, shot, now));
      }
    }

    this.stepProjectiles(dtSeconds, now);

    world.coverage = computeCoverage(world.grid);
    this.syncRenderState(now);
  }

  private stepProjectiles(dtSeconds: number, now: number): void {
    const all = [this.world.local, ...this.players];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const result = stepProjectile(projectile, dtSeconds, all);

      const paint = (spot: { x: number; z: number; radius: number }) => {
        stampCircle(
          this.world.grid,
          spot.x,
          spot.z,
          spot.radius,
          projectile.team as number as PaintOwner,
          undefined,
        );
        this.world.gridVersion++;
      };
      if (result.dribble) paint(result.dribble);
      if (result.splash) {
        paint(result.splash);
        this.checkTargets(result.splash.x, result.splash.z, now);
      }
      if (result.tagged) {
        const victim = result.tagged;
        victim.alive = false;
        victim.respawnAt = now + RESPAWN_SECONDS * 1000;
        victim.splatted++;
        stampCircle(
          this.world.grid,
          victim.x,
          victim.z,
          1.9,
          projectile.team as number as PaintOwner,
          undefined,
        );
        this.world.gridVersion++;
      }
      if (result.coverHit) {
        this.world.addCoverSplat(result.coverHit.x, result.coverHit.z, projectile.team, now);
      }
      if (result.dead) this.projectiles.splice(i, 1);
    }
  }

  private checkTargets(x: number, z: number, now: number): void {
    for (const target of this.targets) {
      if (target.hit) continue;
      if (Math.hypot(target.x - x, target.z - z) < 2.2) {
        target.hit = true;
        target.hitAt = now;
      }
    }
  }

  /** Mirror the local sim into the render-facing structures the scene reads. */
  private syncRenderState(now: number): void {
    const world = this.world;
    world.ingestPlayers(
      [world.local, ...this.players].map((p) => ({
        id: p.id,
        n: p.name,
        tm: p.team,
        b: p.isBot ? (1 as const) : (0 as const),
        x: p.x,
        z: p.z,
        ax: p.aimX,
        az: p.aimZ,
        a: p.alive ? (1 as const) : (0 as const),
        bs: now < p.boostUntil ? (1 as const) : (0 as const),
        mk: p.marker,
        tg: p.tags,
        c: 1 as const,
        sh: now < p.shieldUntil ? (1 as const) : (0 as const),
      })),
      now,
    );
    world.ingestProjectiles(
      this.projectiles.map((p) => ({
        id: p.id,
        tm: p.team,
        x: p.x,
        z: p.z,
        vx: p.vx,
        vz: p.vz,
        p: Math.min(1, p.travelled / Math.max(0.001, p.range)),
        r: p.splashRadius,
      })),
      now,
    );
    // Local sim needs no interpolation delay — buffers hold a single fresh sample.
    world.serverTimeOffset = 0;
  }
}
