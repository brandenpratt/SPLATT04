import * as THREE from 'three';

/**
 * A deliberately small material library, created once and shared by every prop.
 * Glossy inflatable vinyl, satin black, aqua plastic, chrome, coral, turf, terrazzo.
 */
export const PALETTE = {
  white: '#f6f4ef',
  black: '#16161c',
  aqua: '#7fe6e3',
  chrome: '#cfd6de',
  coral: '#ff8a5c',
  peach: '#ffcba4',
  turf: '#5fbf6a',
  terrazzo: '#e9e4d8',
  cyan: '#12e2f0',
  magenta: '#ff2fa4',
  gold: '#e8c26a',
  water: '#1fd3d8',
  sunset: '#ff8f6b',
} as const;

function vinyl(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.28,
    metalness: 0.02,
    ...extra,
  });
}

export function createMaterials() {
  return {
    // Glossy white inflatable vinyl — the dominant surface of the whole estate.
    whiteVinyl: vinyl(PALETTE.white, { roughness: 0.22 }),
    blackVinyl: vinyl(PALETTE.black, { roughness: 0.38 }),
    aquaPlastic: new THREE.MeshStandardMaterial({
      color: PALETTE.aqua,
      roughness: 0.1,
      metalness: 0.05,
      transparent: true,
      opacity: 0.72,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: PALETTE.chrome,
      roughness: 0.14,
      metalness: 0.95,
    }),
    coral: vinyl(PALETTE.coral),
    peach: vinyl(PALETTE.peach),
    turf: new THREE.MeshStandardMaterial({ color: PALETTE.turf, roughness: 0.85 }),
    cyanTrim: vinyl(PALETTE.cyan, {
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 0.25,
    }),
    magentaTrim: vinyl(PALETTE.magenta, {
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 0.25,
    }),
    gold: new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.2, metalness: 0.7 }),
    bottleGlass: new THREE.MeshStandardMaterial({
      color: '#2f6b46',
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
    seawall: vinyl('#efe9df', { roughness: 0.7 }),
    palmTrunk: vinyl('#a8794f', { roughness: 0.8 }),
    palmFrond: vinyl('#3fa85a', { roughness: 0.7, side: THREE.DoubleSide }),
    skyline: new THREE.MeshBasicMaterial({ color: '#7c5b8f' }),
    yacht: vinyl('#fbfbf8', { roughness: 0.2 }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/** Geometries are shared too — nothing here is per-instance. */
export function createGeometries() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 18),
    lowCylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    prism: new THREE.CylinderGeometry(1, 1, 1, 3),
    cone: new THREE.ConeGeometry(1, 1, 16),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    lowSphere: new THREE.SphereGeometry(1, 10, 8),
    plane: new THREE.PlaneGeometry(1, 1),
    circle: new THREE.CircleGeometry(1, 20),
    ring: new THREE.RingGeometry(0.78, 1.02, 22),
    torus: new THREE.TorusGeometry(1, 0.22, 8, 24),
  };
}

export type Geometries = ReturnType<typeof createGeometries>;

export function disposeAll(record: Record<string, { dispose(): void }>): void {
  for (const value of Object.values(record)) value.dispose();
}
