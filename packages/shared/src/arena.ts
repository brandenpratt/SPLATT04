import { PLAYER_RADIUS } from './constants.js';
import { TeamId } from './types.js';

/**
 * VICE ESTATE 04 — a completely flat Miami waterfront inflatable paintball course.
 *
 * Everything here lives on one elevation. Colliders are axis-aligned boxes and circles only,
 * which keeps server collision, client prediction and bot steering cheap and identical.
 * Visual height is decorative and never gameplay-relevant.
 */

export const ARENA_WIDTH = 82; // east-west, X
export const ARENA_DEPTH = 54; // north-south, Z
export const ARENA_HALF_WIDTH = ARENA_WIDTH / 2;
export const ARENA_HALF_DEPTH = ARENA_DEPTH / 2;

/** Paint grid resolution, chosen so cells are near-square at the 82x54 footprint. */
export const GRID_COLS = 128;
export const GRID_ROWS = 84;
export const CELL_WIDTH = ARENA_WIDTH / GRID_COLS; // 0.6406
export const CELL_DEPTH = ARENA_DEPTH / GRID_ROWS; // 0.6429

export type ObstacleStyle =
  | 'villa'
  | 'cabana'
  | 'hedge'
  | 'bar'
  | 'boat'
  | 'wedge'
  | 'planter'
  | 'couch'
  | 'car'
  | 'speaker'
  | 'champagne';

export type Lane = 'waterfront' | 'drive' | 'party';

interface ObstacleBase {
  id: string;
  style: ObstacleStyle;
  lane: Lane;
  /** Visual height in world units. Never affects gameplay — the arena is flat. */
  height: number;
}

export interface BoxObstacle extends ObstacleBase {
  kind: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
}

export interface CircleObstacle extends ObstacleBase {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}

export type Obstacle = BoxObstacle | CircleObstacle;

function box(
  id: string,
  style: ObstacleStyle,
  lane: Lane,
  x: number,
  z: number,
  hx: number,
  hz: number,
  height: number,
): BoxObstacle {
  return { kind: 'box', id, style, lane, x, z, hx, hz, height };
}

function circle(
  id: string,
  style: ObstacleStyle,
  lane: Lane,
  x: number,
  z: number,
  r: number,
  height: number,
): CircleObstacle {
  return { kind: 'circle', id, style, lane, x, z, r, height };
}

/** Reflect an obstacle across the X axis so both team halves are exactly fair. */
function mirror(o: Obstacle): Obstacle {
  const id = o.id.replace(/^w_/, 'e_');
  return o.kind === 'box' ? { ...o, id, x: -o.x } : { ...o, id, x: -o.x };
}

/** Objects authored on the west half; each gets an exact eastern twin. */
const WEST_SIDE: Obstacle[] = [
  // --- Waterfront Lane (north, beside the bay) -----------------------------
  box('w_villa_bay', 'villa', 'waterfront', -26, -22, 5.5, 2.6, 3.4),
  box('w_villa_corner', 'villa', 'waterfront', -36, -20.5, 3.0, 2.2, 3.1),
  circle('w_hedge_a', 'hedge', 'waterfront', -15, -15.5, 1.9, 1.5),
  circle('w_hedge_b', 'hedge', 'waterfront', -20, -12.5, 1.5, 1.4),
  box('w_bar', 'bar', 'waterfront', -7, -13.5, 3.0, 0.9, 1.15),

  // --- Circular Drive (centre) --------------------------------------------
  box('w_wedge', 'wedge', 'drive', -8, 0, 1.5, 1.5, 1.7),
  circle('w_planter_n', 'planter', 'drive', -22, -4.5, 2.0, 1.6),
  circle('w_planter_s', 'planter', 'drive', -22, 4.5, 2.0, 1.6),
  box('w_spawn_shield', 'wedge', 'drive', -30, 0, 1.6, 3.2, 1.9),

  // --- Party Lane (south, service/party side) ------------------------------
  box('w_couch', 'couch', 'party', -17, 14.5, 3.2, 1.2, 1.25),
  box('w_speaker_a', 'speaker', 'party', -13.5, 20.5, 1.1, 1.1, 2.6),
  box('w_speaker_b', 'speaker', 'party', -8.5, 20.5, 1.1, 1.1, 2.6),
  circle('w_champagne_a', 'champagne', 'party', -11, 11, 1.35, 2.2),
  circle('w_champagne_b', 'champagne', 'party', -24, 17.5, 1.35, 2.2),
  box('w_villa_party', 'villa', 'party', -30, 22, 5.0, 2.6, 3.2),
];

/** Objects that sit on the centre line and belong to neither team. */
const CENTRE: Obstacle[] = [
  // The landmark: an inflatable speedboat lying sideways across the circular drive.
  // Long axis runs north-south so both teams can wrap the bow and the stern.
  box('c_speedboat', 'boat', 'drive', 0, 0, 2.3, 7.6, 2.5),
  box('c_cabana', 'cabana', 'waterfront', 0, -19.5, 3.2, 2.4, 3.0),
  box('c_sportscar', 'car', 'party', 0, 17.5, 3.8, 1.6, 1.5),
];

export const OBSTACLES: Obstacle[] = [...WEST_SIDE, ...WEST_SIDE.map(mirror), ...CENTRE];

export const SPAWNS: Record<TeamId, Array<{ x: number; z: number }>> = {
  [TeamId.Cyan]: [
    { x: -36.5, z: -8 },
    { x: -36.5, z: -3 },
    { x: -36.5, z: 3 },
    { x: -36.5, z: 8 },
    { x: -33, z: -12 },
    { x: -33, z: 12 },
  ],
  [TeamId.Magenta]: [
    { x: 36.5, z: -8 },
    { x: 36.5, z: -3 },
    { x: 36.5, z: 3 },
    { x: 36.5, z: 8 },
    { x: 33, z: -12 },
    { x: 33, z: 12 },
  ],
};

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

export function clampToArena(
  x: number,
  z: number,
  radius = PLAYER_RADIUS,
): { x: number; z: number } {
  const limitX = ARENA_HALF_WIDTH - radius - 0.4;
  const limitZ = ARENA_HALF_DEPTH - radius - 0.4;
  return {
    x: Math.min(limitX, Math.max(-limitX, x)),
    z: Math.min(limitZ, Math.max(-limitZ, z)),
  };
}

/** Push a circle of `radius` out of any obstacle it overlaps. Returns the corrected position. */
export function resolveCollisions(x: number, z: number, radius: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const o of OBSTACLES) {
    if (o.kind === 'circle') {
      const dx = px - o.x;
      const dz = pz - o.z;
      const minDist = o.r + radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.0001;
        px = o.x + (dx / dist) * minDist;
        pz = o.z + (dz / dist) * minDist;
      }
    } else {
      const dx = px - o.x;
      const dz = pz - o.z;
      const overlapX = o.hx + radius - Math.abs(dx);
      const overlapZ = o.hz + radius - Math.abs(dz);
      if (overlapX > 0 && overlapZ > 0) {
        // Eject along the shallowest axis so sliding along a wall feels natural.
        if (overlapX < overlapZ) {
          px = o.x + Math.sign(dx || 1) * (o.hx + radius);
        } else {
          pz = o.z + Math.sign(dz || 1) * (o.hz + radius);
        }
      }
    }
  }
  const clamped = clampToArena(px, pz, radius);
  return clamped;
}

/** True when a point (already inflated by `radius`) sits inside cover. */
export function isBlocked(x: number, z: number, radius = 0): boolean {
  for (const o of OBSTACLES) {
    if (o.kind === 'circle') {
      const dx = x - o.x;
      const dz = z - o.z;
      const m = o.r + radius;
      if (dx * dx + dz * dz < m * m) return true;
    } else if (Math.abs(x - o.x) < o.hx + radius && Math.abs(z - o.z) < o.hz + radius) {
      return true;
    }
  }
  return false;
}

/**
 * First obstacle hit by a ray, or null. Used for projectile cover hits and bot line-of-sight.
 * Returns the travel distance along the segment.
 */
export function raycastObstacles(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { obstacle: Obstacle; t: number } | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let best: { obstacle: Obstacle; t: number } | null = null;

  for (const o of OBSTACLES) {
    let t: number | null = null;
    if (o.kind === 'circle') {
      const fx = x0 - o.x;
      const fz = z0 - o.z;
      const a = dx * dx + dz * dz;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - o.r * o.r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0 && a > 0) {
        const sq = Math.sqrt(disc);
        const t0 = (-b - sq) / (2 * a);
        const t1 = (-b + sq) / (2 * a);
        if (t0 >= 0 && t0 <= 1) t = t0;
        else if (t1 >= 0 && t1 <= 1) t = t1;
      }
    } else {
      // Slab test against the AABB.
      const invX = dx === 0 ? Infinity : 1 / dx;
      const invZ = dz === 0 ? Infinity : 1 / dz;
      let tmin = ((o.x - o.hx - x0) as number) * invX;
      let tmax = ((o.x + o.hx - x0) as number) * invX;
      if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
      let tzmin = ((o.z - o.hz - z0) as number) * invZ;
      let tzmax = ((o.z + o.hz - z0) as number) * invZ;
      if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];
      const enter = Math.max(tmin, tzmin);
      const exit = Math.min(tmax, tzmax);
      if (enter <= exit && exit >= 0 && enter <= 1) t = Math.max(enter, 0);
    }
    if (t !== null && (best === null || t < best.t)) best = { obstacle: o, t };
  }
  return best;
}

export function hasLineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
  return raycastObstacles(x0, z0, x1, z1) === null;
}

// ---------------------------------------------------------------------------
// Bot navigation graph
// ---------------------------------------------------------------------------

export interface NavNode {
  id: number;
  x: number;
  z: number;
  lane: Lane;
  neighbours: number[];
}

export function laneForZ(z: number): Lane {
  if (z < -9) return 'waterfront';
  if (z > 9) return 'party';
  return 'drive';
}

const NAV_STEP_X = 5.3;
const NAV_STEP_Z = 5.1;
const NAV_LINK_DISTANCE = 8;
const NAV_CLEARANCE = PLAYER_RADIUS + 0.35;

/**
 * A lattice rather than hand-placed waypoints: every node and every edge is validated
 * against the real colliders, so the graph cannot silently route bots through a hedge
 * when the layout is tuned.
 */
function buildNavGraph(): NavNode[] {
  const nodes: NavNode[] = [];
  const limitX = ARENA_HALF_WIDTH - 3.5;
  const limitZ = ARENA_HALF_DEPTH - 3.5;

  for (let z = -limitZ; z <= limitZ + 1e-6; z += NAV_STEP_Z) {
    for (let x = -limitX; x <= limitX + 1e-6; x += NAV_STEP_X) {
      const px = Math.round(x * 100) / 100;
      const pz = Math.round(z * 100) / 100;
      if (isBlocked(px, pz, NAV_CLEARANCE)) continue;
      nodes.push({ id: nodes.length, x: px, z: pz, lane: laneForZ(pz), neighbours: [] });
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > NAV_LINK_DISTANCE) continue;
      // Link only when a fat player capsule can actually travel the segment.
      if (!segmentClear(a.x, a.z, b.x, b.z, NAV_CLEARANCE)) continue;
      a.neighbours.push(b.id);
      b.neighbours.push(a.id);
    }
  }
  return nodes;
}

/** Conservative swept test: samples the segment inflated by `radius`. */
export function segmentClear(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
): boolean {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(2, Math.ceil(dist / 0.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (isBlocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, radius)) return false;
  }
  return true;
}

export const NAV_NODES: NavNode[] = buildNavGraph();

export function nearestNavNode(x: number, z: number, lane?: Lane): NavNode {
  let best = NAV_NODES[0];
  let bestDist = Infinity;
  for (const n of NAV_NODES) {
    if (lane && n.lane !== lane) continue;
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export const ARENA_BOUNDS = {
  minX: -ARENA_HALF_WIDTH,
  maxX: ARENA_HALF_WIDTH,
  minZ: -ARENA_HALF_DEPTH,
  maxZ: ARENA_HALF_DEPTH,
};
