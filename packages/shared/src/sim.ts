import { resolveCollisions, raycastObstacles } from './arena.js';
import {
  AIM_ASSIST_MAX_DEGREES,
  AIM_ASSIST_MAX_RANGE,
  AIM_ASSIST_TURN_RATE,
  BOOST_COOLDOWN_MS,
  BOOST_DURATION_MS,
  BOOST_MULTIPLIER,
  ENEMY_PAINT_SPEED_MULTIPLIER,
  FRIENDLY_PAINT_SPEED_MULTIPLIER,
  PLAYER_ACCEL,
  PLAYER_MOVE_SPEED,
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
} from './constants.js';
import { MARKERS } from './markers.js';
import { dropSpawnShield } from './saturation.js';
import { PaintOwner, PlayerInput, PlayerState, ProjectileState, TeamId } from './types.js';

const DEG = Math.PI / 180;

export interface SimContext {
  /** Milliseconds on the simulating clock. */
  now: number;
  /** Paint ownership under a world position. */
  sampleOwner: (x: number, z: number) => PaintOwner;
}

export function normalise(x: number, z: number): { x: number; z: number; length: number } {
  const length = Math.hypot(x, z);
  if (length < 1e-6) return { x: 0, z: 0, length: 0 };
  return { x: x / length, z: z / length, length };
}

/** Movement multiplier from the floor a player is standing on. Exposed for tests and HUD. */
export function paintSpeedMultiplier(owner: PaintOwner, team: TeamId, boosting: boolean): number {
  if (owner === PaintOwner.Neutral) return 1;
  const friendly = (owner as number) === (team as number);
  if (friendly) return FRIENDLY_PAINT_SPEED_MULTIPLIER;
  // Boost briefly overrides the enemy-paint slowdown (but never collision).
  return boosting ? 1 : ENEMY_PAINT_SPEED_MULTIPLIER;
}

export function canBoost(player: PlayerState, now: number): boolean {
  return player.alive && now >= player.boostReadyAt;
}

/**
 * Advance one player by `dtSeconds`. Pure with respect to everything except `player`,
 * so the server, the client's local prediction and practice mode all agree.
 */
export function stepPlayer(
  player: PlayerState,
  input: PlayerInput,
  dtSeconds: number,
  ctx: SimContext,
): void {
  if (!player.alive) {
    player.vx = 0;
    player.vz = 0;
    return;
  }

  if (input.boostPressed && canBoost(player, ctx.now)) {
    player.boostUntil = ctx.now + BOOST_DURATION_MS;
    player.boostReadyAt = ctx.now + BOOST_COOLDOWN_MS;
  }
  const boosting = ctx.now < player.boostUntil;

  const aim = normalise(input.aimX, input.aimZ);
  if (aim.length > 0) {
    player.aimX = aim.x;
    player.aimZ = aim.z;
  }

  const move = normalise(input.moveX, input.moveZ);
  const throttle = Math.min(1, Math.hypot(input.moveX, input.moveZ));

  const marker = MARKERS[player.marker] ?? MARKERS.compressor;
  const floor = ctx.sampleOwner(player.x, player.z);
  let speed = PLAYER_MOVE_SPEED * marker.movementMultiplier;
  speed *= paintSpeedMultiplier(floor, player.team, boosting);
  if (boosting) speed *= BOOST_MULTIPLIER;

  const targetVx = move.x * speed * throttle;
  const targetVz = move.z * speed * throttle;

  const maxDelta = PLAYER_ACCEL * dtSeconds;
  let dvx = targetVx - player.vx;
  let dvz = targetVz - player.vz;
  const dvLength = Math.hypot(dvx, dvz);
  if (dvLength > maxDelta) {
    dvx = (dvx / dvLength) * maxDelta;
    dvz = (dvz / dvLength) * maxDelta;
  }
  player.vx += dvx;
  player.vz += dvz;

  // Substep so a boosting player can never tunnel through an inflatable.
  const travel = Math.hypot(player.vx, player.vz) * dtSeconds;
  const steps = Math.max(1, Math.ceil(travel / 0.3));
  const stepDt = dtSeconds / steps;
  for (let s = 0; s < steps; s++) {
    const nextX = player.x + player.vx * stepDt;
    const nextZ = player.z + player.vz * stepDt;
    const resolved = resolveCollisions(nextX, nextZ, PLAYER_RADIUS);
    // Kill velocity on whichever axis was pushed back, so players slide along cover.
    if (Math.abs(resolved.x - nextX) > 1e-6) player.vx = 0;
    if (Math.abs(resolved.z - nextZ) > 1e-6) player.vz = 0;
    player.x = resolved.x;
    player.z = resolved.z;
  }
}

export interface FireRequest {
  dirX: number;
  dirZ: number;
  splashRadius: number;
  speed: number;
  range: number;
}

/**
 * Consume a player's fire intent and return the paintballs to spawn this tick.
 * Enforces the marker's fire interval and burst cadence — the server treats this as
 * authoritative, so a client that spams `firing` gains nothing.
 */
export function tryFire(
  player: PlayerState,
  input: PlayerInput,
  now: number,
  rng: () => number,
): FireRequest[] {
  if (!player.alive) {
    player.burstRemaining = 0;
    return [];
  }
  const marker = MARKERS[player.marker] ?? MARKERS.compressor;
  const out: FireRequest[] = [];

  const emit = () => {
    // Firing forfeits spawn protection immediately — it shields, it does not enable.
    dropSpawnShield(player);
    const ramp = Math.min(player.spreadHeat, marker.spreadRampMax);
    const spread = (marker.spreadDegrees + ramp) * DEG;
    const angle = Math.atan2(player.aimZ, player.aimX) + (rng() - 0.5) * spread;
    out.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      splashRadius: marker.splashRadius,
      speed: marker.projectileSpeed,
      range: marker.rangeUnits,
    });
    player.spreadHeat = Math.min(
      marker.spreadRampMax,
      player.spreadHeat + marker.spreadRampDegrees,
    );
  };

  if (player.burstRemaining > 0) {
    while (player.burstRemaining > 0 && now >= player.nextBurstAt) {
      emit();
      player.burstRemaining--;
      player.nextBurstAt = now + marker.burstSpacingMs;
    }
  } else if (input.firing && now >= player.nextFireAt) {
    player.nextFireAt = now + marker.fireIntervalMs;
    if (marker.burstCount > 1) {
      player.burstRemaining = marker.burstCount;
      player.nextBurstAt = now;
      while (player.burstRemaining > 0 && now >= player.nextBurstAt) {
        emit();
        player.burstRemaining--;
        player.nextBurstAt = now + marker.burstSpacingMs;
      }
    } else {
      emit();
    }
  }

  if (!input.firing && player.burstRemaining === 0) {
    player.spreadHeat = Math.max(0, player.spreadHeat - 0.9);
  }
  return out;
}

export interface ProjectileStepResult {
  /** Paint the floor here and remove the projectile. */
  splash?: { x: number; z: number; radius: number };
  /** A light in-flight dribble of paint. */
  dribble?: { x: number; z: number; radius: number };
  /** Opponent struck by this paintball. */
  tagged?: PlayerState;
  /** Cover struck — cosmetic splat only, never scores. */
  coverHit?: { x: number; z: number };
  dead: boolean;
}

/**
 * Advance one paintball. Applies at most `AIM_ASSIST_MAX_DEGREES` of total curve toward an
 * opponent, and only when the shot was already close — aiming must never feel automatic.
 */
export function stepProjectile(
  projectile: ProjectileState,
  dtSeconds: number,
  // An array, deliberately: this is traversed more than once per call, and a
  // one-shot iterator (e.g. `map.values()`) would silently be empty on the second pass.
  players: readonly PlayerState[],
  assistScale = 1,
): ProjectileStepResult {
  const result: ProjectileStepResult = { dead: false };

  if (assistScale > 0 && projectile.curveBudget > 0) {
    const target = findAssistTarget(projectile, players);
    if (target) {
      const current = Math.atan2(projectile.vz, projectile.vx);
      const desired = Math.atan2(target.z - projectile.z, target.x - projectile.x);
      let diff = desired - current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = AIM_ASSIST_TURN_RATE * DEG * assistScale;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
      const spent = Math.abs(turn) / DEG;
      if (spent <= projectile.curveBudget) {
        projectile.curveBudget -= spent;
        const speed = Math.hypot(projectile.vx, projectile.vz);
        const next = current + turn;
        projectile.vx = Math.cos(next) * speed;
        projectile.vz = Math.sin(next) * speed;
      }
    }
  }

  const x0 = projectile.x;
  const z0 = projectile.z;
  const x1 = x0 + projectile.vx * dtSeconds;
  const z1 = z0 + projectile.vz * dtSeconds;
  const stepDistance = Math.hypot(x1 - x0, z1 - z0);

  // Opponents first — a tag beats a wall behind them.
  let closest: { player: PlayerState; t: number } | null = null;
  for (const p of players) {
    if (!p.alive || p.team === projectile.team || p.id === projectile.ownerId) continue;
    const t = segmentCircleHit(x0, z0, x1, z1, p.x, p.z, PLAYER_RADIUS + PROJECTILE_RADIUS);
    if (t !== null && (closest === null || t < closest.t)) closest = { player: p, t };
  }

  const cover = raycastObstacles(x0, z0, x1, z1);

  if (closest && (!cover || closest.t <= cover.t)) {
    projectile.x = x0 + (x1 - x0) * closest.t;
    projectile.z = z0 + (z1 - z0) * closest.t;
    result.tagged = closest.player;
    result.splash = { x: projectile.x, z: projectile.z, radius: projectile.splashRadius };
    result.dead = true;
    return result;
  }

  if (cover) {
    projectile.x = x0 + (x1 - x0) * cover.t;
    projectile.z = z0 + (z1 - z0) * cover.t;
    result.coverHit = { x: projectile.x, z: projectile.z };
    result.dead = true;
    return result;
  }

  projectile.x = x1;
  projectile.z = z1;
  projectile.travelled += stepDistance;

  if (projectile.travelled >= projectile.range) {
    result.splash = { x: projectile.x, z: projectile.z, radius: projectile.splashRadius };
    result.dead = true;
    return result;
  }

  if (projectile.travelled >= projectile.nextDribbleAt) {
    projectile.nextDribbleAt += DRIBBLE_SPACING;
    result.dribble = { x: projectile.x, z: projectile.z, radius: projectile.splashRadius * 0.45 };
  }

  return result;
}

export const DRIBBLE_SPACING = 4.5;

function findAssistTarget(
  projectile: ProjectileState,
  players: readonly PlayerState[],
): PlayerState | null {
  const heading = Math.atan2(projectile.vz, projectile.vx);
  let best: PlayerState | null = null;
  let bestScore = Infinity;
  for (const p of players) {
    if (!p.alive || p.team === projectile.team || p.id === projectile.ownerId) continue;
    const dx = p.x - projectile.x;
    const dz = p.z - projectile.z;
    const dist = Math.hypot(dx, dz);
    if (dist > AIM_ASSIST_MAX_RANGE || dist < 0.5) continue;
    let diff = Math.abs(Math.atan2(dz, dx) - heading);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    // Only assist shots that were already close to on-target.
    if (diff > AIM_ASSIST_MAX_DEGREES * DEG) continue;
    if (dist < bestScore) {
      bestScore = dist;
      best = p;
    }
  }
  return best;
}

/** Parametric position along a segment where it first enters a circle, or null. */
export function segmentCircleHit(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cx: number,
  cz: number,
  radius: number,
): number | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const fx = x0 - cx;
  const fz = z0 - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return fx * fx + fz * fz <= radius * radius ? 0 : null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / (2 * a);
  const t1 = (-b + sq) / (2 * a);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

export function createProjectile(
  id: number,
  owner: PlayerState,
  request: FireRequest,
  now: number,
): ProjectileState {
  const muzzle = PLAYER_RADIUS + 0.35;
  return {
    id,
    ownerId: owner.id,
    team: owner.team,
    x: owner.x + request.dirX * muzzle,
    z: owner.z + request.dirZ * muzzle,
    vx: request.dirX * request.speed,
    vz: request.dirZ * request.speed,
    splashRadius: request.splashRadius,
    spawnedAt: now,
    travelled: 0,
    range: request.range,
    curveBudget: AIM_ASSIST_MAX_DEGREES,
    nextDribbleAt: DRIBBLE_SPACING,
  };
}

export function createPlayerState(
  id: string,
  name: string,
  team: TeamId,
  isBot: boolean,
  spawn: { x: number; z: number },
): PlayerState {
  return {
    id,
    name,
    team,
    isBot,
    x: spawn.x,
    z: spawn.z,
    vx: 0,
    vz: 0,
    aimX: team === TeamId.Cyan ? 1 : -1,
    aimZ: 0,
    marker: 'compressor',
    alive: true,
    respawnAt: 0,
    boostUntil: 0,
    boostReadyAt: 0,
    nextFireAt: 0,
    burstRemaining: 0,
    nextBurstAt: 0,
    spreadHeat: 0,
    tags: 0,
    splatted: 0,
    cellsPainted: 0,
    connected: true,
    saturation: 0,
    lastSaturatedAt: 0,
    shieldUntil: 0,
  };
}

export function emptyInput(marker: PlayerState['marker'] = 'compressor'): PlayerInput {
  return {
    seq: 0,
    moveX: 0,
    moveZ: 0,
    aimX: 1,
    aimZ: 0,
    firing: false,
    boostPressed: false,
    selectedMarker: marker,
    clientTime: 0,
  };
}

export { BOOST_COOLDOWN_MS, BOOST_DURATION_MS };
