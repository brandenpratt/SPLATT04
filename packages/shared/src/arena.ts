import { PLAYER_RADIUS } from './constants.js';
import { TeamId } from './types.js';

/**
 * VICE ESTATE 04 — a completely flat Miami waterfront inflatable paintball course.
 *
 * Everything here lives on one elevation. Colliders are axis-aligned boxes and circles only,
 * which keeps server collision, client prediction and bot steering cheap and identical.
 * Visual height is decorative and never gameplay-relevant.
 */

// Tightened from 82x54: with a close third-person camera you see far less of the arena,
// so the estate is compact enough that action is always a few seconds away.
export const ARENA_WIDTH = 72; // east-west, X
export const ARENA_DEPTH = 50; // north-south, Z
export const ARENA_HALF_WIDTH = ARENA_WIDTH / 2;
export const ARENA_HALF_DEPTH = ARENA_DEPTH / 2;

/** Paint grid resolution, chosen so cells stay near-square at the 72x50 footprint. */
export const GRID_COLS = 120;
export const GRID_ROWS = 84;
export const CELL_WIDTH = ARENA_WIDTH / GRID_COLS; // 0.60
export const CELL_DEPTH = ARENA_DEPTH / GRID_ROWS; // 0.595

export type ObstacleStyle =
  | 'mansion'
  | 'mansion-wing'
  | 'garage'
  | 'archway-pier'
  | 'cabana'
  | 'hedge'
  | 'bar'
  | 'flamingo'
  | 'fountain'
  | 'sculpture'
  | 'wedge'
  | 'planter'
  | 'curved-planter'
  | 'couch'
  | 'car'
  | 'speaker'
  | 'champagne';

export type Lane = 'waterfront' | 'fountain' | 'party';

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

/**
 * The estate, authored explicitly rather than mirrored.
 *
 * The two mansion masses, the garages and the party-lane props are deliberately *not*
 * exact reflections of each other — the brief calls for equivalent-but-distinct halves,
 * and asymmetry makes each side legible at a glance. Fairness comes from equal cover
 * volume and equal spawn protection, not from geometric symmetry.
 */
/**
 * VICE ESTATE 04, laid out as a competitive paintball field.
 *
 * Every bunker is authored once for the cyan half and mirrored through 180 degrees —
 * `(x, z) -> (-x, -z)`. Point symmetry is what makes a field fair: each team gets the same
 * home, the same snake run and corner, the same three doritos and the same mid, handed to
 * the opposite flank. An earlier version of this table was hand-authored as two
 * deliberately different halves, which reads well in a screenshot and plays unfairly.
 *
 * Play runs along X. Each villa sits behind its own team's home with a garage gap between
 * its two piers — that gap is the spawn and the only way through the building, which is
 * what keeps the arena flat while the villas still read as two-storey architecture.
 *
 * Lanes follow Z: the snake flank is `party`, the dorito flank is `waterfront`, and the
 * contested middle is `fountain`.
 */
type HalfSpec = [string, ObstacleStyle, Lane, number, number, number, number, number];

// id, style, lane, x, z, hx, hz, height
const CYAN_HALF: HalfSpec[] = [
  ['home', 'cabana', 'fountain', -24, 0, 2.0, 4.5, 2.6],
  ['back-party', 'cabana', 'party', -19.5, 10.5, 1.5, 1.5, 2.3],
  ['back-water', 'cabana', 'waterfront', -19.5, -10.5, 1.5, 1.5, 2.3],
  ['snake', 'bar', 'party', -10.5, 15.5, 5.0, 0.85, 1.35],
  ['snake-corner', 'cabana', 'party', -16.0, 13.2, 1.3, 1.3, 2.0],
  ['snake-mid', 'cabana', 'party', -2.5, 13.0, 1.2, 1.2, 1.9],
  ['dorito-1', 'wedge', 'waterfront', -14.0, -10.0, 1.5, 1.5, 2.1],
  ['dorito-2', 'wedge', 'waterfront', -8.5, -13.0, 1.4, 1.4, 2.0],
  ['dorito-3', 'wedge', 'waterfront', -3.0, -15.0, 1.3, 1.3, 1.9],
  ['mid-low', 'bar', 'fountain', -7.5, 6.5, 2.7, 0.8, 1.4],
  ['mid-high', 'cabana', 'fountain', -8.0, -5.0, 1.6, 1.6, 2.4],
  ['wing', 'cabana', 'fountain', -13.0, 0, 1.2, 1.2, 2.2],
  ['planter-water', 'curved-planter', 'waterfront', -16.5, -5.5, 3.0, 1.2, 1.15],
  ['planter-party', 'curved-planter', 'party', -4.0, 9.5, 2.75, 1.2, 1.15],
  ['planter-mid', 'curved-planter', 'fountain', -11.0, 2.5, 2.5, 1.2, 1.15],
  // Villa piers. The 6 m gap between them at z -6..0 is the garage route and the spawn.
  ['villa-pier-water', 'mansion', 'waterfront', -32.5, -9.5, 3.0, 3.5, 11.0],
  ['villa-pier-party', 'mansion-wing', 'party', -32.5, 3.5, 3.0, 3.5, 11.0],
  ['orb-dais', 'sculpture', 'waterfront', -19.5, -16.5, 2.6, 2.6, 4.0],
];

function mirrored(spec: HalfSpec, team: 'cyan' | 'magenta'): BoxObstacle {
  const [id, style, lane, x, z, hx, hz, height] = spec;
  const flip = team === 'magenta';
  return box(
    `${team}-${id}`,
    style,
    // The mirrored half also swaps flanks: a team's snake side is the other's dorito side.
    flip && lane !== 'fountain' ? (lane === 'party' ? 'waterfront' : 'party') : lane,
    flip ? -x : x,
    flip ? -z : z,
    hx,
    hz,
    height,
  );
}

const ESTATE: Obstacle[] = [
  ...CYAN_HALF.map((spec) => mirrored(spec, 'cyan')),
  ...CYAN_HALF.map((spec) => mirrored(spec, 'magenta')),
  // The hero landmark sits on the axis of symmetry and belongs to neither half.
  circle('fountain', 'fountain', 'fountain', 0, 0, 5.0, 8.0),
];


export const OBSTACLES: Obstacle[] = ESTATE;

/**
 * Spawn points sit in each garage's shadow, so no spawn has line of sight to the
 * central courtyard. `arena.test.ts` asserts both properties.
 */
export const SPAWNS: Record<TeamId, Array<{ x: number; z: number }>> = {
  // The start box sits in front of each villa. The wide `home` bunker screens it from the
  // courtyard, and open ground north and south of it gives every spawn two exits.
  [TeamId.Cyan]: [
    { x: -28, z: -4.5 },
    { x: -28, z: -1.5 },
    { x: -28, z: 1.5 },
    { x: -28, z: 4.5 },
  ],
  [TeamId.Magenta]: [
    { x: 28, z: 4.5 },
    { x: 28, z: 1.5 },
    { x: 28, z: -1.5 },
    { x: 28, z: -4.5 },
  ],
};

/** The central objective: the flamingo fountain. */
export const ARENA_CENTRE = { x: 0, z: 0 };

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
  if (z < -9.5) return 'waterfront';
  if (z > 8.5) return 'party';
  return 'fountain';
}

// Denser than the old 82x54 court: the estate has narrower routes (mansion archways,
// gaps between fountain planters) and a coarse lattice simply could not see through them.
const NAV_STEP_X = 3.6;
const NAV_STEP_Z = 3.5;
const NAV_LINK_DISTANCE = 5.6;
const NAV_CLEARANCE = PLAYER_RADIUS + 0.22;

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

  // Drop anything not connected to the main body of the map. A pocket behind a mansion
  // that no player can walk to is a bot trap, not a waypoint, so it must never survive
  // into the shipped graph.
  return keepLargestComponent(nodes);
}

function keepLargestComponent(nodes: NavNode[]): NavNode[] {
  const component = new Int32Array(nodes.length).fill(-1);
  const sizes: number[] = [];

  for (const node of nodes) {
    if (component[node.id] !== -1) continue;
    const label = sizes.length;
    let size = 0;
    const queue = [node.id];
    component[node.id] = label;
    while (queue.length > 0) {
      const current = queue.shift()!;
      size++;
      for (const next of nodes[current].neighbours) {
        if (component[next] === -1) {
          component[next] = label;
          queue.push(next);
        }
      }
    }
    sizes.push(size);
  }

  const main = sizes.indexOf(Math.max(...sizes));
  const kept = nodes.filter((n) => component[n.id] === main);

  // Reindex so `NAV_NODES[id]` stays a direct lookup after pruning.
  const remap = new Map<number, number>();
  kept.forEach((node, index) => remap.set(node.id, index));
  return kept.map((node, index) => ({
    ...node,
    id: index,
    neighbours: node.neighbours
      .map((n) => remap.get(n))
      .filter((n): n is number => n !== undefined),
  }));
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
