import { OBSTACLES } from '@splat04/shared';

export type CameraMode = 'third' | 'first' | 'overhead';

/** Only these two are competitive modes; `overhead` is a developer tool. */
export const PLAYABLE_CAMERA_MODES: CameraMode[] = ['third', 'first'];

export const CAMERA_SETTINGS = {
  third: {
    /**
     * Framed so a ~1.85m character occupies 20-25% of screen height, per the art
     * direction: at 68 degrees vertical the view is ~7.6m tall at this distance,
     * putting the character at roughly 24%.
     */
    distance: 5.6,
    /** Metres above the ground. */
    height: 2.35,
    /** Over-the-right-shoulder offset, so the crosshair sits in open space. */
    shoulder: 0.78,
    fov: 68,
    /** Extra distance while boosting. */
    boostPullback: 0.85,
    /** Where the camera looks, relative to the player's feet. */
    lookHeight: 1.42,
  },
  first: {
    /** Visor height. */
    eyeHeight: 1.68,
    fov: 79,
    bobAmplitude: 0.035,
    bobFrequency: 9.5,
  },
  overhead: {
    height: 30,
    back: 24,
    fov: 45,
  },
} as const;

export const PITCH_MIN = -1.15; // radians, looking down
export const PITCH_MAX = 0.75; // looking up

/**
 * Camera collision.
 *
 * Obstacles are axis-aligned boxes and circles with a known height, so a 2D sweep is
 * enough — but it must ignore anything shorter than the camera, otherwise the view snaps
 * forward every time the player backs onto a knee-high planter.
 */
export function cameraDistanceLimit(
  playerX: number,
  playerZ: number,
  dirX: number,
  dirZ: number,
  desired: number,
  cameraHeight: number,
  radius = 0.34,
): number {
  let limit = desired;

  for (const obstacle of OBSTACLES) {
    // Only cover that actually reaches the camera can block it. The margin is generous
    // on purpose: props are drawn slightly above their collider, and letting the camera
    // sink into visible geometry looks far worse than an occasional early pull-in.
    if (obstacle.height + 0.75 < cameraHeight) continue;

    if (obstacle.kind === 'circle') {
      const t = raySphere(
        playerX,
        playerZ,
        dirX,
        dirZ,
        obstacle.x,
        obstacle.z,
        obstacle.r + radius,
      );
      if (t !== null && t < limit) limit = t;
    } else {
      const t = rayBox(
        playerX,
        playerZ,
        dirX,
        dirZ,
        obstacle.x,
        obstacle.z,
        obstacle.hx + radius,
        obstacle.hz + radius,
      );
      if (t !== null && t < limit) limit = t;
    }
  }

  // Never jam the camera inside the character.
  return Math.max(0.6, limit);
}

function raySphere(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
): number | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-b - sq) / 2;
  const t1 = (-b + sq) / 2;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return null;
}

function rayBox(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
): number | null {
  const invX = dx === 0 ? Infinity : 1 / dx;
  const invZ = dz === 0 ? Infinity : 1 / dz;
  let tmin = (cx - hx - ox) * invX;
  let tmax = (cx + hx - ox) * invX;
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
  let tzmin = (cz - hz - oz) * invZ;
  let tzmax = (cz + hz - oz) * invZ;
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];
  const enter = Math.max(tmin, tzmin);
  const exit = Math.min(tmax, tzmax);
  if (enter > exit || exit < 0) return null;
  return Math.max(enter, 0);
}

export function isPlayableCamera(mode: CameraMode): boolean {
  return mode === 'third' || mode === 'first';
}

export function nextCameraMode(mode: CameraMode): CameraMode {
  return mode === 'first' ? 'third' : 'first';
}
