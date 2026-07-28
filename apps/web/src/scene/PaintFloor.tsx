import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_DEPTH, ARENA_WIDTH, GRID_COLS, GRID_ROWS, PaintOwner } from '@splat04/shared';
import { GameWorld } from '../game/world.js';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * One draw call for the whole floor.
 *
 * Team ownership arrives as a two-channel mask (red = cyan, green = magenta) which is
 * linearly filtered, so paint blends softly instead of showing grid cells. Cyan carries a
 * stripe motif and Magenta a dot motif so ownership is never communicated by colour alone.
 */
const fragmentShader = /* glsl */ `
  uniform sampler2D uPaint;
  uniform vec3 uCourt;
  uniform vec3 uTurf;
  uniform vec3 uCyan;
  uniform vec3 uMagenta;
  uniform float uMotif;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Grid row 0 sits at -Z (north), but the rotated plane's v axis increases toward +Z,
    // so the lookup is flipped vertically to keep paint aligned with the simulation.
    vec4 paint = texture2D(uPaint, vec2(vUv.x, 1.0 - vUv.y));
    float grain = noise(vWorld.xz * 3.4);

    // The estate floor is a mix, exactly as in the reference: synthetic turf around the
    // inside of the fence, pale terrazzo paving through the middle and out to each spawn.
    vec3 terrazzo = uCourt;
    float speck = step(0.86, hash(floor(vWorld.xz * 7.0)));
    terrazzo = mix(terrazzo, terrazzo * 0.86, speck * 0.5);
    terrazzo = mix(terrazzo, terrazzo * 1.05, noise(vWorld.xz * 0.35));
    // Paving joints.
    vec2 tile = abs(fract(vWorld.xz / 4.0) - 0.5);
    float joint = 1.0 - smoothstep(0.44, 0.5, max(tile.x, tile.y));
    terrazzo *= mix(0.9, 1.0, joint);

    vec3 turf = uTurf;
    turf = mix(turf, turf * 1.12, noise(vWorld.xz * 2.2));
    turf = mix(turf, turf * 0.88, step(0.7, hash(floor(vWorld.xz * 11.0))) * 0.5);

    // Paving footprint: a broad central courtyard plus east-west approach lanes.
    float courtyard = 1.0 - smoothstep(13.0, 17.0, length(vWorld.xz * vec2(1.0, 1.25)));
    float spine = 1.0 - smoothstep(7.0, 10.5, abs(vWorld.z + 1.0));
    float edgeFade = 1.0 - smoothstep(26.0, 31.0, abs(vWorld.x));
    float paved = clamp(max(courtyard, spine * edgeFade), 0.0, 1.0);
    // Ragged boundary so it never reads as a hard vector shape.
    paved = smoothstep(0.35, 0.6, paved + (noise(vWorld.xz * 0.9) - 0.5) * 0.35);

    vec3 base = mix(turf, terrazzo, paved);
    // NB: "half" is a reserved word in GLSL — do not name this variable that.
    float side = clamp(vWorld.x / 41.0, -1.0, 1.0);
    base = mix(base, mix(base, uCyan, 0.06), max(0.0, -side));
    base = mix(base, mix(base, uMagenta, 0.06), max(0.0, side));

    // Ragged edges: push the blend threshold around with noise.
    float wobble = (grain - 0.5) * 0.30;
    float c = smoothstep(0.30, 0.62, paint.r + wobble);
    float m = smoothstep(0.30, 0.62, paint.g + wobble);

    vec3 colour = base;

    // Cyan: diagonal stripes. Magenta: dots.
    float stripe = step(0.55, fract((vWorld.x + vWorld.z) * 0.55));
    vec2 cell = fract(vWorld.xz * 0.5) - 0.5;
    float dot0 = 1.0 - smoothstep(0.16, 0.24, length(cell));

    vec3 cyanPaint = uCyan * (1.0 - stripe * 0.16 * uMotif);
    vec3 magentaPaint = uMagenta * (1.0 - dot0 * 0.20 * uMotif);

    // Wet paint is the visual hero: give it a real specular-ish lift over dry ground.
    float sheen = 0.10 * noise(vWorld.xz * 1.6 + uTime * 0.05);

    colour = mix(colour, cyanPaint + sheen, c);
    colour = mix(colour, magentaPaint + sheen, m);

    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

interface Props {
  world: GameWorld;
  highContrast: boolean;
}

export function PaintFloor({ world, highContrast }: Props) {
  const lastVersion = useRef(-1);

  const { texture, data } = useMemo(() => {
    const bytes = new Uint8Array(GRID_COLS * GRID_ROWS * 4);
    for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
    const tex = new THREE.DataTexture(bytes, GRID_COLS, GRID_ROWS, THREE.RGBAFormat);
    // Linear filtering is what turns 128x84 cells into soft, wet-looking paint.
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return { texture: tex, data: bytes };
  }, []);

  const uniforms = useMemo(
    () => ({
      uPaint: { value: texture },
      // Pale wet terrazzo and dark artificial turf — the bright lawn read as a toy box.
      uCourt: { value: new THREE.Color('#b0aa9c') },
      uTurf: { value: new THREE.Color('#2b3f31') },
      uCyan: { value: new THREE.Color('#12e2f0') },
      uMagenta: { value: new THREE.Color('#ff2fa4') },
      uMotif: { value: highContrast ? 1.6 : 0.7 },
      uTime: { value: 0 },
    }),
    [texture, highContrast],
  );

  useEffect(() => {
    uniforms.uMotif.value = highContrast ? 1.6 : 0.7;
  }, [highContrast, uniforms]);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    // Only re-upload when the grid actually changed.
    if (lastVersion.current === world.gridVersion) return;
    lastVersion.current = world.gridVersion;

    const grid = world.grid;
    for (let i = 0; i < grid.length; i++) {
      const owner = grid[i];
      const offset = i * 4;
      data[offset] = owner === PaintOwner.Cyan ? 255 : 0;
      data[offset + 1] = owner === PaintOwner.Magenta ? 255 : 0;
    }
    texture.needsUpdate = true;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[ARENA_WIDTH, ARENA_DEPTH, 1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
