/**
 * Reference-driven arena layout — the single source of truth for VICE ESTATE 04.
 *
 * One approved JSON document is consumed by both sides of the pipeline:
 *   - `tools/blender/build_vice_estate_kit.py` reads it to construct and place the
 *     modular blockout inside Blender.
 *   - The browser imports it for rendering, collision, navigation and gameplay.
 *
 * There is deliberately no second collider table. The legacy procedural layout in
 * `arena.ts` still drives the live match route and is kept as a labelled fallback, but it
 * is *not* the source for this map and must not be mirrored here.
 *
 * Validation is hand-rolled rather than schema-library-driven, matching `protocol.ts`:
 * the surface is small, every field is a number or a short string, and the error messages
 * need to name the offending id so a Blender build failure is actionable.
 */

export const LAYOUT_SCHEMA_VERSION = 1;

/** Where a layout sits in the approval process. Only `gate-a-approved` is art-locked. */
export type LayoutStatus = 'provisional' | 'gate-a-approved';

/** Named distinctly from `aim.ts`'s `Vec2` so the shared barrel export stays unambiguous. */
export interface LayoutPoint {
  x: number;
  z: number;
}

export interface Transform {
  position: [number, number, number];
  /** Yaw only. The arena is flat; pitch and roll would desync art from collision. */
  rotationY: number;
  scale: [number, number, number];
}

export type LaneId = 'waterfront' | 'fountain' | 'party' | 'west-staging' | 'east-staging';

export type TeamSide = 'cyan' | 'magenta' | 'neutral';

/** A placed instance of a modular asset from the GLB kit. */
export interface Placement {
  id: string;
  /** Asset id from the companion asset manifest. */
  asset: string;
  transform: Transform;
  lane: LaneId;
  side: TeamSide;
  /** Landmarks are the silhouette anchors reviewed at Gate A. */
  landmark?: boolean;
  /** Scenery the player can never reach — upper floors, the bridge, anything offshore. */
  inaccessible?: boolean;
  /**
   * Distant backdrop: the bay and the skyline band, which sit at horizon range rather than
   * merely outside the fence. Ordinary scenery keeps a tight bound so a misplaced prop is
   * still caught; only geometry explicitly marked as backdrop may sit kilometres out.
   * Implies `inaccessible`.
   */
  backdrop?: boolean;
  /** Whether floor paint should be projected onto this surface. */
  paintReceiver?: boolean;
  castShadow?: boolean;
}

export type ColliderShape =
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; rotationY?: number }
  | { kind: 'circle'; x: number; z: number; r: number };

/** A gameplay collision volume. Flat-world: `height` is for camera collision only. */
export interface Collider {
  id: string;
  shape: ColliderShape;
  /** Visual height in metres. Camera collision uses it; movement never does. */
  height: number;
  /** Placement this collider belongs to, when it comes from a kit asset. */
  placement?: string;
  /** Cover classification from the art direction: waist, shoulder or full height. */
  cover: 'low' | 'medium' | 'full';
}

export interface SpawnPoint {
  id: string;
  x: number;
  z: number;
  /** Facing in radians; 0 looks down -Z. */
  facing: number;
}

export interface NavAnchor {
  id: string;
  x: number;
  z: number;
  lane: LaneId;
  /** Optional hint for bot route weighting. */
  role?: 'route' | 'defend' | 'objective' | 'flank';
}

export interface Pickup {
  id: string;
  kind: 'sponsor-node' | 'paint-refill';
  x: number;
  z: number;
  /** Seconds into the round at which this location becomes active, when scheduled. */
  activeAtSeconds?: number[];
}

/** A region of floor the paint grid may write to. */
export interface PaintableSurface {
  id: string;
  kind: 'grid' | 'decal';
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  material: 'terrazzo' | 'turf' | 'concrete';
}

/** Scenery volumes players must never enter: upper floors, the bridge, the bay. */
export interface ScenicZone {
  id: string;
  reason: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  minY?: number;
}

export interface WaterfrontBoundary {
  /** Play stops at this Z; everything further north is scenery. */
  boundaryZ: number;
  seawallZ: number;
  /** Outline of the visible bay, for scenery placement and paint exclusion. */
  polygon: LayoutPoint[];
}

export interface ArenaLayout {
  schemaVersion: number;
  id: string;
  name: string;
  status: LayoutStatus;
  /**
   * True once the camera and proportions have been matched against the master reference
   * and approved at Gate A. Until then every coordinate below is provisional.
   */
  referenceLocked: boolean;
  units: 'meters';
  dimensions: {
    width: number;
    depth: number;
    groundY: number;
  };
  paintGrid: { cols: number; rows: number };
  /** The Golden Hour review camera, matched to the master reference at Gate A. */
  reviewCamera: {
    position: [number, number, number];
    target: [number, number, number];
    focalLengthMm: number;
    sensorWidthMm: number;
  };
  placements: Placement[];
  colliders: Collider[];
  spawns: Record<'cyan' | 'magenta', SpawnPoint[]>;
  navAnchors: NavAnchor[];
  pickups: Pickup[];
  paintableSurfaces: PaintableSurface[];
  scenicZones: ScenicZone[];
  waterfront: WaterfrontBoundary;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  path: string;
  message: string;
}

export class LayoutValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      `Arena layout failed validation:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
    );
    this.name = 'LayoutValidationError';
  }
}

const isFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(isFinite);

/**
 * Validate a candidate layout.
 *
 * Returns every problem rather than throwing on the first, so a Blender build or a CI run
 * reports the whole picture in one pass.
 */
export function validateLayout(
  raw: unknown,
  knownAssetIds?: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (typeof raw !== 'object' || raw === null) {
    return [{ path: '$', message: 'layout must be an object' }];
  }
  const layout = raw as Partial<ArenaLayout>;

  if (layout.schemaVersion !== LAYOUT_SCHEMA_VERSION) {
    fail('schemaVersion', `expected ${LAYOUT_SCHEMA_VERSION}, got ${String(layout.schemaVersion)}`);
  }
  if (!layout.id) fail('id', 'required');
  if (layout.units !== 'meters') fail('units', "must be 'meters'");
  if (layout.status !== 'provisional' && layout.status !== 'gate-a-approved') {
    fail('status', "must be 'provisional' or 'gate-a-approved'");
  }
  if (layout.status === 'gate-a-approved' && layout.referenceLocked !== true) {
    fail('referenceLocked', 'a Gate A approved layout must be reference locked');
  }

  const dims = layout.dimensions;
  if (!dims || !isFinite(dims.width) || !isFinite(dims.depth)) {
    fail('dimensions', 'width and depth are required numbers');
  }
  const halfW = dims ? dims.width / 2 : 0;
  const halfD = dims ? dims.depth / 2 : 0;

  const inBounds = (x: number, z: number, path: string, slack = 0) => {
    if (!dims) return;
    if (Math.abs(x) > halfW + slack || Math.abs(z) > halfD + slack) {
      fail(path, `(${x}, ${z}) lies outside the ${dims.width}x${dims.depth} footprint`);
    }
  };

  // --- stable, unique ids across every collection ---------------------------
  const seen = new Map<string, string>();
  const claim = (id: unknown, path: string) => {
    if (typeof id !== 'string' || id.trim().length === 0) {
      fail(path, 'a stable string id is required');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
      fail(path, `id "${id}" must be lowercase kebab/snake case`);
    }
    const previous = seen.get(id);
    if (previous) fail(path, `duplicate id "${id}" (already used by ${previous})`);
    else seen.set(id, path);
  };

  // --- placements -----------------------------------------------------------
  const placements = layout.placements ?? [];
  if (placements.length === 0) fail('placements', 'at least one placement is required');
  const placementIds = new Set<string>();
  placements.forEach((p, i) => {
    const path = `placements[${i}]`;
    claim(p.id, `${path}.id`);
    placementIds.add(p.id);
    if (!p.asset) fail(`${path}.asset`, 'required');
    else if (knownAssetIds && !knownAssetIds.has(p.asset)) {
      fail(`${path}.asset`, `"${p.asset}" is not in the asset manifest`);
    }
    if (!p.transform || !isVec3(p.transform.position) || !isVec3(p.transform.scale)) {
      fail(`${path}.transform`, 'position and scale must be [x, y, z]');
    } else {
      if (!isFinite(p.transform.rotationY)) fail(`${path}.transform.rotationY`, 'must be a number');
      // Scenery may legitimately sit outside the fence; playable modules may not. The bay
      // and skyline are a separate case again — they sit at horizon range so the sunset
      // band has something to sit on.
      if (p.backdrop && !p.inaccessible) {
        fail(`${path}.backdrop`, 'backdrop geometry must also be marked inaccessible');
      }
      const slack = p.backdrop ? 8000 : p.inaccessible ? 400 : 12;
      inBounds(p.transform.position[0], p.transform.position[2], `${path}.transform`, slack);
    }
  });

  // --- colliders ------------------------------------------------------------
  const colliders = layout.colliders ?? [];
  colliders.forEach((c, i) => {
    const path = `colliders[${i}]`;
    claim(c.id, `${path}.id`);
    if (!isFinite(c.height) || c.height <= 0) fail(`${path}.height`, 'must be a positive number');
    if (!['low', 'medium', 'full'].includes(c.cover as string)) {
      fail(`${path}.cover`, "must be 'low', 'medium' or 'full'");
    }
    if (c.placement && !placementIds.has(c.placement)) {
      fail(`${path}.placement`, `"${c.placement}" is not a known placement id`);
    }
    const shape = c.shape;
    if (!shape) {
      fail(`${path}.shape`, 'required');
    } else if (shape.kind === 'box') {
      if (!isFinite(shape.hx) || !isFinite(shape.hz) || shape.hx <= 0 || shape.hz <= 0) {
        fail(`${path}.shape`, 'box half-extents must be positive');
      }
      inBounds(shape.x, shape.z, `${path}.shape`);
    } else if (shape.kind === 'circle') {
      if (!isFinite(shape.r) || shape.r <= 0) fail(`${path}.shape.r`, 'must be positive');
      inBounds(shape.x, shape.z, `${path}.shape`);
    } else {
      fail(`${path}.shape.kind`, "must be 'box' or 'circle'");
    }
  });

  // --- spawns ---------------------------------------------------------------
  const spawns = layout.spawns;
  if (!spawns || !Array.isArray(spawns.cyan) || !Array.isArray(spawns.magenta)) {
    fail('spawns', 'cyan and magenta spawn arrays are required');
  } else {
    for (const team of ['cyan', 'magenta'] as const) {
      if (spawns[team].length === 0) fail(`spawns.${team}`, 'at least one spawn is required');
      spawns[team].forEach((s, i) => {
        const path = `spawns.${team}[${i}]`;
        claim(s.id, `${path}.id`);
        if (!isFinite(s.x) || !isFinite(s.z)) fail(path, 'x and z are required');
        else inBounds(s.x, s.z, path);
        if (!isFinite(s.facing)) fail(`${path}.facing`, 'must be a number in radians');
      });
    }
  }

  // --- navigation, pickups, surfaces, zones ---------------------------------
  (layout.navAnchors ?? []).forEach((n, i) => {
    const path = `navAnchors[${i}]`;
    claim(n.id, `${path}.id`);
    if (!isFinite(n.x) || !isFinite(n.z)) fail(path, 'x and z are required');
    else inBounds(n.x, n.z, path);
  });

  (layout.pickups ?? []).forEach((p, i) => {
    const path = `pickups[${i}]`;
    claim(p.id, `${path}.id`);
    if (!isFinite(p.x) || !isFinite(p.z)) fail(path, 'x and z are required');
    else inBounds(p.x, p.z, path);
  });

  (layout.paintableSurfaces ?? []).forEach((s, i) => {
    const path = `paintableSurfaces[${i}]`;
    claim(s.id, `${path}.id`);
    const b = s.bounds;
    if (!b || b.minX >= b.maxX || b.minZ >= b.maxZ) {
      fail(`${path}.bounds`, 'min must be strictly less than max on both axes');
    }
  });

  (layout.scenicZones ?? []).forEach((z, i) => {
    const path = `scenicZones[${i}]`;
    claim(z.id, `${path}.id`);
    if (!z.reason) fail(`${path}.reason`, 'every scenic zone must say why it is unreachable');
  });

  // --- waterfront -----------------------------------------------------------
  const water = layout.waterfront;
  if (!water) {
    fail('waterfront', 'required');
  } else {
    if (!isFinite(water.boundaryZ)) fail('waterfront.boundaryZ', 'required');
    if (!isFinite(water.seawallZ)) fail('waterfront.seawallZ', 'required');
    if (isFinite(water.boundaryZ) && isFinite(water.seawallZ) && water.seawallZ > water.boundaryZ) {
      fail('waterfront.seawallZ', 'the seawall must sit beyond the play boundary (further -Z)');
    }
    if (!Array.isArray(water.polygon) || water.polygon.length < 3) {
      fail('waterfront.polygon', 'at least three points are required');
    }
  }

  // --- review camera --------------------------------------------------------
  const cam = layout.reviewCamera;
  if (!cam || !isVec3(cam.position) || !isVec3(cam.target)) {
    fail('reviewCamera', 'position and target must be [x, y, z]');
  } else if (!isFinite(cam.focalLengthMm) || cam.focalLengthMm <= 0) {
    fail('reviewCamera.focalLengthMm', 'must be a positive number');
  }

  return issues;
}

export function assertValidLayout(raw: unknown, knownAssetIds?: ReadonlySet<string>): ArenaLayout {
  const issues = validateLayout(raw, knownAssetIds);
  if (issues.length > 0) throw new LayoutValidationError(issues);
  return raw as ArenaLayout;
}
