import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_HALF_DEPTH, ARENA_HALF_WIDTH } from '@splat04/shared';
import { createGeometries, createMaterials, disposeAll } from './materials.js';

/**
 * Everything beyond the north fence: bright turquoise bay, seawall, a short dock, one
 * geometric yacht, a faint coastal skyline and palms outside the playable area.
 *
 * Scenery only. Nothing here has a collider, and nothing sits where it could obscure play.
 */
export function Scenery({ quality }: { quality: 'low' | 'high' }) {
  const g = useMemo(createGeometries, []);
  const m = useMemo(createMaterials, []);

  useEffect(
    () => () => {
      disposeAll(g as unknown as Record<string, { dispose(): void }>);
      disposeAll(m as unknown as Record<string, { dispose(): void }>);
    },
    [g, m],
  );

  // South edge of the bay sits just past the seawall, so water is only ever visible
  // beyond the north fence — never alongside or behind the arena.
  const waterNorth = -ARENA_HALF_DEPTH - 105;

  return (
    <group>
      <Water z={waterNorth} lowPower={quality === 'low'} />

      {/* Seawall along the north edge. */}
      <mesh
        geometry={g.box}
        material={m.seawall}
        position={[0, 0.5, -ARENA_HALF_DEPTH - 5]}
        scale={[ARENA_HALF_WIDTH * 2 + 20, 1, 1.6]}
      />

      {/* Short private dock. */}
      <group position={[-14, 0, -ARENA_HALF_DEPTH - 12]}>
        <mesh geometry={g.box} material={m.seawall} position={[0, 0.4, 0]} scale={[4, 0.35, 14]} />
        {[-5, 0, 5].map((z) => (
          <mesh
            key={z}
            geometry={g.cylinder}
            material={m.palmTrunk}
            position={[2.2, 0.7, z]}
            scale={[0.16, 1.4, 0.16]}
          />
        ))}
      </group>

      <Yacht position={[-13, 0, -ARENA_HALF_DEPTH - 26]} g={g} m={m} />
      <Skyline g={g} m={m} />
      <Palms g={g} m={m} />

      {/* Warm pink-orange sunset dome. */}
      <SkyDome />
    </group>
  );
}

function Water({ z, lowPower }: { z: number; lowPower: boolean }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#5df0e4') },
      uDeep: { value: new THREE.Color('#0f8fd6') },
      uSun: { value: new THREE.Color('#ffd9a8') },
    }),
    [],
  );

  useFrame((_, delta) => {
    // Reduced-detail devices still get motion, just cheaper.
    if (materialRef.current) uniforms.uTime.value += delta * (lowPower ? 0.4 : 1);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, z]}>
      <planeGeometry args={[420, 200, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform float uTime;
          uniform vec3 uShallow;
          uniform vec3 uDeep;
          uniform vec3 uSun;
          varying vec2 vUv;
          void main() {
            float depth = smoothstep(0.0, 0.6, vUv.y);
            vec3 colour = mix(uShallow, uDeep, depth);
            // Cheap sparkle: two crossing sine bands, no textures involved.
            float bands = sin(vUv.y * 220.0 + uTime * 1.4) * sin(vUv.x * 90.0 - uTime * 0.7);
            colour += smoothstep(0.75, 1.0, bands) * 0.35;
            // Sun glare running up the middle toward the horizon.
            float glare = smoothstep(0.06, 0.0, abs(vUv.x - 0.5)) * depth;
            colour = mix(colour, uSun, glare * 0.5);
            gl_FragColor = vec4(colour, 1.0);
            #include <colorspace_fragment>
          }
        `
        }
      />
    </mesh>
  );
}

function Yacht({
  position,
  g,
  m,
}: {
  position: [number, number, number];
  g: ReturnType<typeof createGeometries>;
  m: ReturnType<typeof createMaterials>;
}) {
  return (
    <group position={position} rotation={[0, 0.25, 0]}>
      <mesh geometry={g.box} material={m.yacht} position={[0, 0.7, 0]} scale={[4, 1.4, 15]} />
      <mesh
        geometry={g.cone}
        material={m.yacht}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.7, -9]}
        scale={[2, 4, 1.4]}
      />
      <mesh geometry={g.box} material={m.yacht} position={[0, 1.9, 1.5]} scale={[3, 1.2, 6]} />
      <mesh
        geometry={g.box}
        material={m.aquaPlastic}
        position={[0, 2.1, -1.6]}
        scale={[2.8, 0.7, 0.2]}
      />
      <mesh geometry={g.box} material={m.chrome} position={[0, 3.1, 3]} scale={[0.16, 3, 0.16]} />
    </group>
  );
}

/** A faint low-poly coastal skyline, far enough away to stay a silhouette. */
function Skyline({
  g,
  m,
}: {
  g: ReturnType<typeof createGeometries>;
  m: ReturnType<typeof createMaterials>;
}) {
  const towers = useMemo(() => {
    const out: Array<{ x: number; h: number; w: number }> = [];
    let seed = 4;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let x = -170; x < 170; x += 9 + rand() * 7) {
      out.push({ x, h: 10 + rand() * 34, w: 5 + rand() * 5 });
    }
    return out;
  }, []);

  return (
    <group position={[0, 0, -ARENA_HALF_DEPTH - 150]}>
      {towers.map((tower, index) => (
        <mesh
          key={index}
          geometry={g.box}
          material={m.skyline}
          position={[tower.x, tower.h / 2, 0]}
          scale={[tower.w, tower.h, 4]}
        />
      ))}
    </group>
  );
}

/** Stylised palms, all outside the fence so they never obstruct a sightline. */
function Palms({
  g,
  m,
}: {
  g: ReturnType<typeof createGeometries>;
  m: ReturnType<typeof createMaterials>;
}) {
  const spots = useMemo(
    () => [
      { x: -ARENA_HALF_WIDTH - 6, z: -18, h: 7.5 },
      { x: ARENA_HALF_WIDTH + 6, z: -16, h: 8.2 },
      { x: -ARENA_HALF_WIDTH - 8, z: 6, h: 6.8 },
      { x: ARENA_HALF_WIDTH + 8, z: 4, h: 7.9 },
      { x: -18, z: ARENA_HALF_DEPTH + 5, h: 7.2 },
      { x: 20, z: ARENA_HALF_DEPTH + 6, h: 8.6 },
    ],
    [],
  );

  return (
    <group>
      {spots.map((spot, index) => (
        <group key={index} position={[spot.x, 0, spot.z]}>
          <mesh
            geometry={g.cylinder}
            material={m.palmTrunk}
            position={[0, spot.h / 2, 0]}
            scale={[0.24, spot.h / 2, 0.24]}
            rotation={[0, 0, 0.06]}
          />
          {[0, 1, 2, 3, 4, 5].map((frond) => (
            <mesh
              key={frond}
              geometry={g.cone}
              material={m.palmFrond}
              position={[
                Math.cos((frond / 6) * Math.PI * 2) * 1.5,
                spot.h - 0.3,
                Math.sin((frond / 6) * Math.PI * 2) * 1.5,
              ]}
              rotation={[Math.PI / 2.4, (frond / 6) * Math.PI * 2, 0]}
              scale={[0.7, 3.2, 0.18]}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/** Warm sunset gradient painted on the inside of a big sphere. */
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color('#2a3f7a') },
      uMid: { value: new THREE.Color('#ff8f6b') },
      uBottom: { value: new THREE.Color('#ffd7a8') },
    }),
    [],
  );

  return (
    <mesh>
      <sphereGeometry args={[300, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uMid;
          uniform vec3 uBottom;
          varying vec3 vPos;
          void main() {
            float h = clamp(vPos.y / 300.0, -1.0, 1.0);
            vec3 colour = mix(uBottom, uMid, smoothstep(-0.2, 0.18, h));
            colour = mix(colour, uTop, smoothstep(0.15, 0.75, h));
            gl_FragColor = vec4(colour, 1.0);
            #include <colorspace_fragment>
          }
        `
        }
      />
    </mesh>
  );
}
