import { useEffect, useMemo } from 'react';
import {
  ARENA_HALF_DEPTH,
  ARENA_HALF_WIDTH,
  BoxObstacle,
  CircleObstacle,
  OBSTACLES,
  Obstacle,
} from '@splat04/shared';
import {
  Geometries,
  Materials,
  createGeometries,
  createMaterials,
  disposeAll,
} from './materials.js';

/**
 * VICE ESTATE 04, built entirely from primitives.
 *
 * Every prop is drawn to match its collider exactly, so what you can see is what you can
 * hide behind. Decorative detail (canopies, cabins, speaker cones) sits above head height
 * and never creates a second storey — the arena is strictly one elevation.
 */
export function Arena({ quality }: { quality: 'low' | 'high' }) {
  const geometries = useMemo(createGeometries, []);
  const materials = useMemo(createMaterials, []);

  useEffect(
    () => () => {
      disposeAll(geometries as unknown as Record<string, { dispose(): void }>);
      disposeAll(materials as unknown as Record<string, { dispose(): void }>);
    },
    [geometries, materials],
  );

  return (
    <group>
      <Turf materials={materials} geometries={geometries} />
      <Fence materials={materials} geometries={geometries} />
      <GlassConnector materials={materials} geometries={geometries} />
      <Floodlights materials={materials} geometries={geometries} />
      {OBSTACLES.map((obstacle) => (
        <Prop
          key={obstacle.id}
          obstacle={obstacle}
          materials={materials}
          geometries={geometries}
          quality={quality}
        />
      ))}
    </group>
  );
}

interface PropProps {
  obstacle: Obstacle;
  materials: Materials;
  geometries: Geometries;
  quality: 'low' | 'high';
}

function Prop({ obstacle, materials, geometries, quality }: PropProps) {
  const shadow = quality === 'high';
  const box = { o: obstacle as BoxObstacle, m: materials, g: geometries, shadow };
  const circle = { o: obstacle as CircleObstacle, m: materials, g: geometries, shadow };

  switch (obstacle.style) {
    case 'mansion':
      return <Mansion {...box} />;
    case 'mansion-wing':
      return <Mansion {...box} wing />;
    case 'garage':
      return <Garage {...box} />;
    case 'cabana':
      return <Cabana {...box} />;
    case 'wedge':
      return <Wedge {...box} />;
    case 'bar':
      return <OutdoorBar {...box} />;
    case 'couch':
      return <Couch {...box} />;
    case 'car':
      return <SportsCar {...box} />;
    case 'speaker':
      return <Speaker {...box} />;
    case 'fountain':
      return <FlamingoFountain {...circle} />;
    case 'sculpture':
      return <ChromeSphere {...circle} />;
    case 'hedge':
      return <Hedge {...circle} />;
    case 'planter':
    case 'curved-planter':
      return <Planter {...circle} curved={obstacle.style === 'curved-planter'} />;
    case 'champagne':
      return <Champagne {...circle} />;
    default:
      return null;
  }
}

type BoxProps = { o: BoxObstacle; m: Materials; g: Geometries; shadow: boolean };
type CircleProps = { o: CircleObstacle; m: Materials; g: Geometries; shadow: boolean };

/**
 * A glossy white Miami-modern mansion mass.
 *
 * The visible silhouette is deliberately taller than the old villas — coral roof, upper
 * glass band, decorative parapet — but all of it is scenery above head height. The
 * collider is the ground floor only, and there is no way up.
 */
function Mansion({ o, m, g, shadow, wing = false }: BoxProps & { wing?: boolean }) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      {/*
        Curved orange roof — the single most recognisable silhouette in the reference.
        A shallow cylinder section reads as the swoop far more cheaply than a lathe.
      */}
      {/*
        Rotated about X, the cylinder's local axes map to world (X radius, Z length,
        Y radius) — so the arc height is the *third* component, not the first. Getting
        that wrong turns the roof into a drum the size of the building.
      */}
      <mesh
        geometry={g.cylinder}
        material={m.roof}
        scale={[o.hx * 1.04, o.hz * 2.06, 1.15]}
        position={[0, h + 0.02, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.roof}
        scale={[o.hx * 2.1, 0.42, o.hz * 2.1]}
        position={[0, h + 0.1, 0]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2.16, 0.18, o.hz * 2.16]}
        position={[0, h - 0.08, 0]}
      />
      {/* Upper aqua glass band, purely decorative. */}
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 2.02, h * 0.22, o.hz * 2.02]}
        position={[0, h * 0.82, 0]}
      />
      {!wing && (
        <mesh
          geometry={g.box}
          material={m.chrome}
          scale={[o.hx * 0.5, 0.16, o.hz * 2.1]}
          position={[o.hx * 0.55, h * 0.97, 0]}
        />
      )}
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2, h, o.hz * 2]}
        position={[0, h / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      {/* Soft bulge along the top edge — inflatable, not architectural. */}
      <mesh
        geometry={g.sphere}
        material={m.whiteVinyl}
        scale={[o.hx * 0.98, 0.5, o.hz * 0.98]}
        position={[0, h, 0]}
        castShadow={shadow}
      />
      {/* Aqua-tinted fake windows on both long faces. */}
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 1.2, h * 0.34, 0.12]}
        position={[0, h * 0.55, o.hz + 0.06]}
      />
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 1.2, h * 0.34, 0.12]}
        position={[0, h * 0.55, -o.hz - 0.06]}
      />
      {/* Coral accent panel. */}
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 0.5, h * 0.16, 0.1]}
        position={[o.hx * 0.6, h * 0.2, o.hz + 0.05]}
      />
      {/* Neon strip over the ground-floor opening: cyan west, magenta east. */}
      <mesh
        geometry={g.box}
        material={o.x < 0 ? m.cyanTrim : m.magentaTrim}
        scale={[o.hx * 1.3, 0.14, 0.12]}
        position={[0, h * 0.3, o.hz + 0.07]}
      />
    </group>
  );
}

/** Squat garage block that shields a spawn from the courtyard. */
function Garage({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2, h, o.hz * 2]}
        position={[0, h / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 2.12, 0.35, o.hz * 2.12]}
        position={[0, h + 0.15, 0]}
      />
      {/* Roller doors facing the spawn side. */}
      <mesh
        geometry={g.box}
        material={m.chrome}
        scale={[0.12, h * 0.6, o.hz * 1.5]}
        position={[o.x < 0 ? -o.hx - 0.06 : o.hx + 0.06, h * 0.32, 0]}
      />
      <mesh
        geometry={g.box}
        material={o.x < 0 ? m.cyanTrim : m.magentaTrim}
        scale={[o.hx * 2.04, 0.14, 0.14]}
        position={[0, h * 0.78, o.hz + 0.05]}
      />
    </group>
  );
}

/**
 * The estate's landmark: a chrome flamingo standing in a shallow, cyan-lit basin.
 * The basin is cover, not a pit — the floor stays flat underneath it.
 */
function FlamingoFountain({ o, m, g, shadow }: CircleProps) {
  return (
    <group position={[o.x, 0, o.z]}>
      {/* Shallow basin. */}
      <mesh
        geometry={g.cylinder}
        material={m.whiteVinyl}
        scale={[o.r, o.height, o.r]}
        position={[0, o.height / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.cylinder}
        material={m.cyanTrim}
        scale={[o.r * 1.02, 0.12, o.r * 1.02]}
        position={[0, o.height, 0]}
      />
      {/* Water disc, lit from below. */}
      <mesh
        geometry={g.circle}
        material={m.aquaPlastic}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, o.height + 0.02, 0]}
        scale={[o.r * 0.9, o.r * 0.9, 1]}
      />
      {/* Chrome flamingo: legs, body, neck, head, beak. */}
      <mesh
        geometry={g.cylinder}
        material={m.chrome}
        scale={[0.1, 0.9, 0.1]}
        position={[-0.25, 1.6, 0]}
      />
      <mesh
        geometry={g.cylinder}
        material={m.chrome}
        scale={[0.1, 0.9, 0.1]}
        position={[0.25, 1.6, 0]}
      />
      <mesh
        geometry={g.sphere}
        material={m.chrome}
        scale={[0.85, 0.6, 1.25]}
        position={[0, 2.7, 0]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.cylinder}
        material={m.chrome}
        scale={[0.13, 0.9, 0.13]}
        position={[0, 3.6, -0.35]}
        rotation={[0.35, 0, 0]}
      />
      <mesh
        geometry={g.sphere}
        material={m.chrome}
        scale={[0.28, 0.28, 0.34]}
        position={[0, 4.4, -0.75]}
      />
      <mesh
        geometry={g.cone}
        material={m.coral}
        scale={[0.13, 0.55, 0.13]}
        position={[0, 4.32, -1.2]}
        rotation={[-1.25, 0, 0]}
      />
    </group>
  );
}

function Cabana({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2, h * 0.72, o.hz * 2]}
        position={[0, (h * 0.72) / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      {/* Decorative canopy: visual only, well above head height, not accessible. */}
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2.5, 0.22, o.hz * 2.5]}
        position={[0, h, 0]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.cyanTrim}
        scale={[o.hx * 2.5, 0.1, 0.14]}
        position={[0, h - 0.16, o.hz * 1.25]}
      />
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 1.1, h * 0.3, 0.1]}
        position={[0, h * 0.42, o.hz + 0.05]}
      />
    </group>
  );
}

/** Satin-black triangular speedball bunker. */
function Wedge({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  const radius = Math.max(o.hx, o.hz) * 1.28;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.prism}
        material={m.blackVinyl}
        scale={[radius, h, radius]}
        position={[0, h / 2, 0]}
        rotation={[0, Math.PI / 4, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.lowSphere}
        material={m.blackVinyl}
        scale={[radius * 0.5, 0.3, radius * 0.5]}
        position={[0, h, 0]}
      />
    </group>
  );
}

function OutdoorBar({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 2, h * 0.86, o.hz * 2]}
        position={[0, (h * 0.86) / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      {/* Chrome counter top. */}
      <mesh
        geometry={g.box}
        material={m.chrome}
        scale={[o.hx * 2.2, 0.12, o.hz * 2.4]}
        position={[0, h * 0.9, 0]}
      />
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 2.02, 0.22, 0.08]}
        position={[0, h * 0.5, o.hz + 0.03]}
      />
    </group>
  );
}

function Couch({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.peach}
        scale={[o.hx * 2, h * 0.55, o.hz * 2]}
        position={[0, (h * 0.55) / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 2, h * 0.95, o.hz * 0.5]}
        position={[0, (h * 0.95) / 2, -o.hz * 0.72]}
        castShadow={shadow}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={g.cylinder}
          material={m.peach}
          scale={[o.hz * 0.55, o.hz * 1.9, o.hz * 0.55]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[side * (o.hx - o.hz * 0.5), h * 0.6, 0]}
        />
      ))}
    </group>
  );
}

/** A fake sports car, moulded as one inflatable lump. */
function SportsCar({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 2, h * 0.55, o.hz * 2]}
        position={[0, h * 0.34, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.coral}
        scale={[o.hx * 1.0, h * 0.4, o.hz * 1.7]}
        position={[0, h * 0.72, 0]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 0.98, h * 0.26, 0.1]}
        position={[0, h * 0.78, o.hz * 0.85]}
      />
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}-${sz}`}
            geometry={g.lowCylinder}
            material={m.blackVinyl}
            scale={[0.42, 0.24, 0.42]}
            rotation={[0, 0, Math.PI / 2]}
            position={[sx * o.hx * 0.72, 0.4, sz * o.hz * 0.75]}
          />
        )),
      )}
    </group>
  );
}

function Speaker({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.box}
        material={m.blackVinyl}
        scale={[o.hx * 2, h, o.hz * 2]}
        position={[0, h / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      {[0.28, 0.62].map((t) => (
        <mesh
          key={t}
          geometry={g.lowCylinder}
          material={m.chrome}
          scale={[o.hx * 0.62, 0.1, o.hx * 0.62]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, h * t, o.hz + 0.06]}
        />
      ))}
      <mesh
        geometry={g.box}
        material={m.cyanTrim}
        scale={[o.hx * 2.05, 0.08, 0.06]}
        position={[0, h * 0.92, o.hz + 0.04]}
      />
    </group>
  );
}

function Hedge({ o, m, g, shadow }: CircleProps) {
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.cylinder}
        material={m.turf}
        scale={[o.r, o.height, o.r]}
        position={[0, o.height / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.lowSphere}
        material={m.turf}
        scale={[o.r, Math.min(o.r * 0.6, 0.5), o.r]}
        position={[0, o.height - 0.05, 0]}
        castShadow={shadow}
      />
    </group>
  );
}

function Planter({ o, m, g, shadow, curved = false }: CircleProps & { curved?: boolean }) {
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.cylinder}
        material={m.whiteVinyl}
        scale={[o.r, o.height, o.r]}
        position={[0, o.height / 2, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.cylinder}
        material={m.chrome}
        scale={[o.r * 1.04, 0.1, o.r * 1.04]}
        position={[0, o.height, 0]}
      />
      {/*
        Kept deliberately low: the planting must not stand taller than the collider's
        declared height, or camera collision (which filters by that height) will let the
        view pass straight through something the player can plainly see.
      */}
      <mesh
        geometry={g.lowSphere}
        material={m.turf}
        scale={[o.r * 0.82, 0.26, o.r * 0.82]}
        position={[0, o.height + 0.1, 0]}
      />
      {curved && (
        // Low white kerb sweeping around the courtyard side of the planter.
        <mesh
          geometry={g.torus}
          material={m.whiteVinyl}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0.16, 0]}
          scale={[o.r * 1.18, o.r * 1.18, 0.5]}
        />
      )}
    </group>
  );
}

function Champagne({ o, m, g, shadow }: CircleProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.cylinder}
        material={m.bottleGlass}
        scale={[o.r, h * 0.6, o.r]}
        position={[0, h * 0.3, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      <mesh
        geometry={g.cone}
        material={m.bottleGlass}
        scale={[o.r, h * 0.22, o.r]}
        position={[0, h * 0.71, 0]}
      />
      <mesh
        geometry={g.cylinder}
        material={m.bottleGlass}
        scale={[o.r * 0.28, h * 0.22, o.r * 0.28]}
        position={[0, h * 0.9, 0]}
      />
      <mesh
        geometry={g.cylinder}
        material={m.gold}
        scale={[o.r * 0.32, h * 0.08, o.r * 0.32]}
        position={[0, h * 1.0, 0]}
      />
      <mesh
        geometry={g.cylinder}
        material={m.gold}
        scale={[o.r * 1.02, h * 0.12, o.r * 1.02]}
        position={[0, h * 0.36, 0]}
      />
    </group>
  );
}

/**
 * The elevated glass walkway linking the two mansions across the back of the estate.
 *
 * Purely decorative and explicitly unreachable — it spans the north gap high above head
 * height, has no collider, and there is no way up to it. It exists for the silhouette.
 */
function GlassConnector({
  materials,
  geometries,
}: {
  materials: Materials;
  geometries: Geometries;
}) {
  const y = 7.4;
  return (
    <group position={[0, 0, -18]}>
      <mesh
        geometry={geometries.box}
        material={materials.connectorGlass}
        position={[0, y, 0]}
        scale={[26, 2.4, 3.2]}
      />
      {/* Orange trim rails along both sides, matching the roofs. */}
      {[-1.7, 1.7].map((z) => (
        <mesh
          key={z}
          geometry={geometries.box}
          material={materials.roof}
          position={[0, y + 1.3, z]}
          scale={[26.4, 0.32, 0.3]}
        />
      ))}
      <mesh
        geometry={geometries.box}
        material={materials.whiteVinyl}
        position={[0, y - 1.3, 0]}
        scale={[26.4, 0.34, 3.4]}
      />
    </group>
  );
}

/**
 * Broadcast floodlight towers at the corners, outside the fence.
 * Scenery: no colliders, and well clear of every sightline.
 */
function Floodlights({ materials, geometries }: { materials: Materials; geometries: Geometries }) {
  const spots = useMemo(
    () => [
      { x: -ARENA_HALF_WIDTH - 4, z: -ARENA_HALF_DEPTH + 4 },
      { x: ARENA_HALF_WIDTH + 4, z: -ARENA_HALF_DEPTH + 4 },
      { x: -ARENA_HALF_WIDTH - 4, z: ARENA_HALF_DEPTH - 4 },
      { x: ARENA_HALF_WIDTH + 4, z: ARENA_HALF_DEPTH - 4 },
    ],
    [],
  );

  return (
    <group>
      {spots.map((spot, index) => (
        <group key={index} position={[spot.x, 0, spot.z]}>
          <mesh
            geometry={geometries.cylinder}
            material={materials.floodHousing}
            position={[0, 6, 0]}
            scale={[0.22, 6, 0.22]}
          />
          <mesh
            geometry={geometries.box}
            material={materials.floodHousing}
            position={[0, 12.2, 0]}
            scale={[3.2, 1.9, 0.5]}
          />
          {[-0.8, 0.8].map((ox) =>
            [-0.45, 0.45].map((oy) => (
              <mesh
                key={`${ox}-${oy}`}
                geometry={geometries.box}
                material={materials.floodLamp}
                position={[ox, 12.2 + oy, 0.3]}
                scale={[1.3, 0.75, 0.12]}
              />
            )),
          )}
        </group>
      ))}
    </group>
  );
}

/** Chrome sphere sculpture on a magenta-lit disc, east of the flamingo. */
function ChromeSphere({ o, m, g, shadow }: CircleProps) {
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh
        geometry={g.cylinder}
        material={m.whiteVinyl}
        position={[0, 0.2, 0]}
        scale={[o.r, 0.2, o.r]}
      />
      <mesh
        geometry={g.cylinder}
        material={m.magentaTrim}
        position={[0, 0.42, 0]}
        scale={[o.r * 0.94, 0.06, o.r * 0.94]}
      />
      <mesh
        geometry={g.sphere}
        material={m.chrome}
        position={[0, o.height * 0.62, 0]}
        scale={o.r * 0.62}
        castShadow={shadow}
      />
    </group>
  );
}

/** Synthetic green turf skirt just outside the painted court. */
function Turf({ materials, geometries }: { materials: Materials; geometries: Geometries }) {
  return (
    <mesh
      geometry={geometries.plane}
      material={materials.turf}
      rotation={[-Math.PI / 2, 0, 0]}
      // Wide enough to fill the horizon east, west and south, but stopping dead at the
      // seawall so the bay is the only thing north of the arena.
      position={[0, -0.02, 18]}
      scale={[300, 100, 1]}
      receiveShadow
    />
  );
}

/**
 * Chunky black inflated tubes around the whole footprint, with electric-cyan piping on
 * the west half and hot-pink on the east, blending through neutral at the centre.
 */
function Fence({ materials, geometries }: { materials: Materials; geometries: Geometries }) {
  const segments = useMemo(() => {
    const out: Array<{
      position: [number, number, number];
      scale: [number, number, number];
      t: number;
    }> = [];
    const step = 4;
    for (let x = -ARENA_HALF_WIDTH; x <= ARENA_HALF_WIDTH - step; x += step) {
      const t = (x + step / 2) / ARENA_HALF_WIDTH;
      out.push({
        position: [x + step / 2, 0.55, -ARENA_HALF_DEPTH],
        scale: [step / 2, 0.55, 0.55],
        t,
      });
      out.push({
        position: [x + step / 2, 0.55, ARENA_HALF_DEPTH],
        scale: [step / 2, 0.55, 0.55],
        t,
      });
    }
    for (let z = -ARENA_HALF_DEPTH; z <= ARENA_HALF_DEPTH - step; z += step) {
      out.push({
        position: [-ARENA_HALF_WIDTH, 0.55, z + step / 2],
        scale: [0.55, 0.55, step / 2],
        t: -1,
      });
      out.push({
        position: [ARENA_HALF_WIDTH, 0.55, z + step / 2],
        scale: [0.55, 0.55, step / 2],
        t: 1,
      });
    }
    return out;
  }, []);

  return (
    <group>
      {segments.map((segment, index) => (
        <group key={index}>
          <mesh
            geometry={geometries.box}
            material={materials.blackVinyl}
            position={segment.position}
            scale={[segment.scale[0] * 2, segment.scale[1] * 2, segment.scale[2] * 2]}
          />
          {/* Team piping: cyan west, magenta east, neutral through the middle. */}
          <mesh
            geometry={geometries.box}
            material={segment.t < 0 ? materials.cyanTrim : materials.magentaTrim}
            position={[segment.position[0], 1.16, segment.position[2]]}
            scale={[segment.scale[0] * 2 * 0.96, 0.14, segment.scale[2] * 2 * 0.96]}
            visible={Math.abs(segment.t) > 0.18}
          />
        </group>
      ))}
    </group>
  );
}
