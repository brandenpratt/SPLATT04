import { describe, expect, it } from 'vitest';
import {
  ARENA_CENTRE,
  ARENA_HALF_DEPTH,
  ARENA_HALF_WIDTH,
  NAV_NODES,
  OBSTACLES,
  PLAYER_RADIUS,
  SPAWNS,
  hasLineOfSight,
  isBlocked,
  segmentClear,
} from './index.js';
import { TeamId } from './types.js';

const TEAMS: Array<[string, TeamId]> = [
  ['Cyan', TeamId.Cyan],
  ['Magenta', TeamId.Magenta],
];

describe('estate layout', () => {
  it('has no overlapping colliders', () => {
    const overlaps: string[] = [];
    for (let i = 0; i < OBSTACLES.length; i++) {
      for (let j = i + 1; j < OBSTACLES.length; j++) {
        const a = OBSTACLES[i];
        const b = OBSTACLES[j];
        const ax = a.kind === 'circle' ? a.r : a.hx;
        const az = a.kind === 'circle' ? a.r : a.hz;
        const bx = b.kind === 'circle' ? b.r : b.hx;
        const bz = b.kind === 'circle' ? b.r : b.hz;
        if (Math.abs(a.x - b.x) < ax + bx && Math.abs(a.z - b.z) < az + bz) {
          overlaps.push(`${a.id}/${b.id}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('keeps every collider inside the fence', () => {
    for (const o of OBSTACLES) {
      const hx = o.kind === 'circle' ? o.r : o.hx;
      const hz = o.kind === 'circle' ? o.r : o.hz;
      expect(Math.abs(o.x) + hx).toBeLessThanOrEqual(ARENA_HALF_WIDTH);
      expect(Math.abs(o.z) + hz).toBeLessThanOrEqual(ARENA_HALF_DEPTH);
    }
  });

  it('composes two villa masses, a fountain and wedge bunkers', () => {
    const ids = OBSTACLES.map((o) => o.id);
    expect(ids).toContain('cyan-villa-pier-water');
    expect(ids).toContain('magenta-villa-pier-water');
    expect(ids).toContain('fountain');
    expect(OBSTACLES.filter((o) => o.style === 'wedge').length).toBeGreaterThanOrEqual(6);
    expect(OBSTACLES.filter((o) => o.style === 'curved-planter')).toHaveLength(6);
  });

  it('leaves a walkable garage route through each villa', () => {
    // Each villa is two piers with a gap between them; the gap is the playable route
    // through the building and the reason the arena stays flat.
    expect(segmentClear(-36, -3, -29, -3, PLAYER_RADIUS + 0.2)).toBe(true);
    expect(segmentClear(36, 3, 29, 3, PLAYER_RADIUS + 0.2)).toBe(true);
  });

  it('is point symmetric, so neither team gets a better field', () => {
    // A competitive paintball field is symmetric under 180-degree rotation, not under
    // reflection: each team's snake side is the other's dorito side. Every cyan collider
    // must have a magenta counterpart at (-x, -z) with the same shape.
    const cyan = OBSTACLES.filter((o) => o.id.startsWith('cyan-'));
    expect(cyan.length).toBeGreaterThan(12);
    for (const c of cyan) {
      const twin = OBSTACLES.find((o) => o.id === c.id.replace('cyan-', 'magenta-'));
      expect(twin, `${c.id} has no magenta counterpart`).toBeDefined();
      expect(twin!.x).toBeCloseTo(-c.x, 5);
      expect(twin!.z).toBeCloseTo(-c.z, 5);
      expect(twin!.kind).toBe(c.kind);
      if (c.kind === 'box' && twin!.kind === 'box') {
        expect(twin!.hx).toBeCloseTo(c.hx, 5);
        expect(twin!.hz).toBeCloseTo(c.hz, 5);
      }
    }
  });

  it('is not a mirror image of itself', () => {
    // Equivalent halves, deliberately not identical ones.
    const west = OBSTACLES.filter((o) => o.x < -2);
    const mirrored = west.filter((w) =>
      OBSTACLES.some(
        (o) => Math.abs(o.x + w.x) < 0.01 && Math.abs(o.z - w.z) < 0.01 && o.style === w.style,
      ),
    );
    expect(mirrored.length).toBeLessThan(west.length);
  });
});

describe('spawns', () => {
  it.each(TEAMS)('%s spawns sit outside every collision volume', (_name, team) => {
    for (const spawn of SPAWNS[team]) {
      expect(isBlocked(spawn.x, spawn.z, PLAYER_RADIUS + 0.5)).toBe(false);
    }
  });

  it.each(TEAMS)('%s spawns have no line of sight to the courtyard', (_name, team) => {
    for (const spawn of SPAWNS[team]) {
      const exposed = hasLineOfSight(spawn.x, spawn.z, ARENA_CENTRE.x, ARENA_CENTRE.z);
      expect(exposed, `spawn ${spawn.x},${spawn.z} can see the fountain`).toBe(false);
    }
  });

  it.each(TEAMS)('%s spawns offer a northern and a southern exit', (_name, team) => {
    for (const spawn of SPAWNS[team]) {
      const north = NAV_NODES.some(
        (n) =>
          n.z < spawn.z - 4 &&
          Math.abs(n.x - spawn.x) < 16 &&
          segmentClear(spawn.x, spawn.z, n.x, n.z, PLAYER_RADIUS),
      );
      const south = NAV_NODES.some(
        (n) =>
          n.z > spawn.z + 4 &&
          Math.abs(n.x - spawn.x) < 16 &&
          segmentClear(spawn.x, spawn.z, n.x, n.z, PLAYER_RADIUS),
      );
      expect(north && south, `spawn ${spawn.x},${spawn.z} lacks two exits`).toBe(true);
    }
  });

  it('keeps the two teams apart', () => {
    for (const cyan of SPAWNS[TeamId.Cyan]) {
      for (const magenta of SPAWNS[TeamId.Magenta]) {
        expect(Math.hypot(cyan.x - magenta.x, cyan.z - magenta.z)).toBeGreaterThan(40);
      }
    }
  });
});

describe('navigation graph', () => {
  it('places every waypoint outside collision volumes', () => {
    for (const node of NAV_NODES) {
      expect(isBlocked(node.x, node.z, PLAYER_RADIUS), `waypoint ${node.x},${node.z}`).toBe(false);
    }
  });

  it('leaves no waypoint isolated', () => {
    expect(NAV_NODES.filter((n) => n.neighbours.length === 0)).toEqual([]);
  });

  it('keeps the whole graph reachable on the ground plane', () => {
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of NAV_NODES[current].neighbours) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(NAV_NODES.length);
  });

  it('covers all three lanes', () => {
    const lanes = new Set(NAV_NODES.map((n) => n.lane));
    expect(lanes).toEqual(new Set(['waterfront', 'fountain', 'party']));
  });

  it('connects the west spawn side to the east spawn side', () => {
    const west = NAV_NODES.reduce((best, n) => (n.x < best.x ? n : best), NAV_NODES[0]);
    const east = NAV_NODES.reduce((best, n) => (n.x > best.x ? n : best), NAV_NODES[0]);
    const seen = new Set<number>([west.id]);
    const queue = [west.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of NAV_NODES[current].neighbours) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.has(east.id)).toBe(true);
  });

  it('offers at least three north-south cross connections', () => {
    // Count distinct x bands where a waypoint in the waterfront lane links through to
    // the fountain lane, so no player is ever trapped in one lane.
    const bands = new Set<number>();
    for (const node of NAV_NODES) {
      if (node.lane !== 'waterfront') continue;
      const linksSouth = node.neighbours.some((id) => NAV_NODES[id].lane === 'fountain');
      if (linksSouth) bands.add(Math.round(node.x / 8));
    }
    expect(bands.size).toBeGreaterThanOrEqual(3);
  });
});
