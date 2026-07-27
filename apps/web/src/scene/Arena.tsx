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
  switch (obstacle.style) {
    case 'villa':
      return <Villa o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'cabana':
      return <Cabana o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'boat':
      return <Speedboat o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'wedge':
      return <Wedge o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'bar':
      return (
        <OutdoorBar o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />
      );
    case 'couch':
      return <Couch o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'car':
      return <SportsCar o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'speaker':
      return <Speaker o={obstacle as BoxObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'hedge':
      return <Hedge o={obstacle as CircleObstacle} m={materials} g={geometries} shadow={shadow} />;
    case 'planter':
      return (
        <Planter o={obstacle as CircleObstacle} m={materials} g={geometries} shadow={shadow} />
      );
    case 'champagne':
      return (
        <Champagne o={obstacle as CircleObstacle} m={materials} g={geometries} shadow={shadow} />
      );
    default:
      return null;
  }
}

type BoxProps = { o: BoxObstacle; m: Materials; g: Geometries; shadow: boolean };
type CircleProps = { o: CircleObstacle; m: Materials; g: Geometries; shadow: boolean };

/** Single-storey inflatable Miami-modern facade. Rounded, seamed, faintly ridiculous. */
function Villa({ o, m, g, shadow }: BoxProps) {
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
      <mesh
        geometry={g.box}
        material={m.peach}
        scale={[o.hx * 2.02, 0.12, o.hz * 2.02]}
        position={[0, h * 0.32, 0]}
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

/**
 * The landmark: an inflatable speedboat lying sideways across the circular drive,
 * long axis north-south so both teams can wrap the bow and the stern.
 */
function Speedboat({ o, m, g, shadow }: BoxProps) {
  const h = o.height;
  return (
    <group position={[o.x, 0, o.z]}>
      {/* Hull — a squashed ellipsoid reads as inflated vinyl, not fibreglass. */}
      <mesh
        geometry={g.sphere}
        material={m.whiteVinyl}
        scale={[o.hx, h * 0.55, o.hz * 0.92]}
        position={[0, h * 0.45, 0]}
        castShadow={shadow}
        receiveShadow={shadow}
      />
      {/* Bow cone pointing north. */}
      <mesh
        geometry={g.cone}
        material={m.whiteVinyl}
        scale={[o.hx * 0.95, 2.6, o.hx * 0.95]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, h * 0.45, -o.hz * 0.95]}
        castShadow={shadow}
      />
      {/* Deck. */}
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 1.5, 0.24, o.hz * 1.5]}
        position={[0, h * 0.78, 0]}
      />
      {/* Cabin + windscreen. */}
      <mesh
        geometry={g.box}
        material={m.whiteVinyl}
        scale={[o.hx * 1.1, 0.7, 2.2]}
        position={[0, h * 0.95, 1.4]}
        castShadow={shadow}
      />
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        scale={[o.hx * 1.05, 0.5, 0.12]}
        position={[0, h * 1.02, 0.35]}
      />
      {/* Racing stripes down both flanks. */}
      <mesh
        geometry={g.box}
        material={m.cyanTrim}
        scale={[0.1, 0.24, o.hz * 1.5]}
        position={[-o.hx * 0.98, h * 0.55, 0]}
      />
      <mesh
        geometry={g.box}
        material={m.magentaTrim}
        scale={[0.1, 0.24, o.hz * 1.5]}
        position={[o.hx * 0.98, h * 0.55, 0]}
      />
      {/* Chrome outboard at the stern. */}
      <mesh
        geometry={g.box}
        material={m.chrome}
        scale={[0.8, 0.9, 0.7]}
        position={[0, h * 0.6, o.hz * 0.98]}
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
        scale={[o.r, o.r * 0.6, o.r]}
        position={[0, o.height, 0]}
        castShadow={shadow}
      />
    </group>
  );
}

function Planter({ o, m, g, shadow }: CircleProps) {
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
      <mesh
        geometry={g.lowSphere}
        material={m.turf}
        scale={[o.r * 0.9, o.r * 0.7, o.r * 0.9]}
        position={[0, o.height + 0.3, 0]}
      />
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
