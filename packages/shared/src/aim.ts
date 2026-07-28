import { PLAYER_RADIUS } from './constants.js';
import { raycastObstacles } from './arena.js';

/**
 * Turning a camera's crosshair into an authoritative shot.
 *
 * The camera is pure presentation: first-person and third-person sit in different places
 * and therefore compute slightly different *aim points*, but once an aim point exists the
 * shot is resolved identically for both. Direction always runs from the player's muzzle to
 * the aim point — never from the camera — so a third-person camera that can see around a
 * corner does not let the player shoot around it.
 */

export const MUZZLE_OFFSET = PLAYER_RADIUS + 0.35;

export interface Vec2 {
  x: number;
  z: number;
}

/** Ground-plane direction from a player to a world aim point. Camera-independent. */
export function aimDirectionTo(player: Vec2, aimPoint: Vec2): Vec2 {
  const dx = aimPoint.x - player.x;
  const dz = aimPoint.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return { x: 1, z: 0 };
  return { x: dx / length, z: dz / length };
}

/** Where paintballs actually leave from, given a facing. Matches `createProjectile`. */
export function muzzlePosition(player: Vec2, direction: Vec2): Vec2 {
  return {
    x: player.x + direction.x * MUZZLE_OFFSET,
    z: player.z + direction.z * MUZZLE_OFFSET,
  };
}

/**
 * True when cover sits between the muzzle and the intended aim point.
 *
 * The server reaches the same conclusion on its own — a projectile fired into a wall
 * simply hits the wall — so this exists to *tell the player* before they waste paint,
 * not to gate the shot. Gating happens server-side, always.
 */
export function isMuzzleBlocked(player: Vec2, aimPoint: Vec2): boolean {
  const direction = aimDirectionTo(player, aimPoint);
  const muzzle = muzzlePosition(player, direction);
  const distance = Math.hypot(aimPoint.x - muzzle.x, aimPoint.z - muzzle.z);
  if (distance < 0.2) return false;
  const hit = raycastObstacles(muzzle.x, muzzle.z, aimPoint.x, aimPoint.z);
  // Only count cover that is genuinely short of the target.
  return hit !== null && hit.t * distance < distance - 0.25;
}

/**
 * Resolve a camera ray onto the ground plane.
 *
 * Returns null when the ray points at or above the horizon, in which case the caller
 * should fall back to projecting the camera's forward vector.
 */
export function rayToGround(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  planeY = 0,
): Vec2 | null {
  if (dirY >= -1e-5) return null;
  const t = (planeY - originY) / dirY;
  if (t <= 0) return null;
  return { x: originX + dirX * t, z: originZ + dirZ * t };
}

/** Clamp an aim point so a shot at the sky still resolves to somewhere sensible. */
export function clampAimDistance(player: Vec2, aimPoint: Vec2, maxDistance = 60): Vec2 {
  const dx = aimPoint.x - player.x;
  const dz = aimPoint.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= maxDistance || length < 1e-6) return aimPoint;
  return {
    x: player.x + (dx / length) * maxDistance,
    z: player.z + (dz / length) * maxDistance,
  };
}
