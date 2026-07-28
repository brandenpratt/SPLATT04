import * as THREE from 'three';

/**
 * A deliberately small material library, created once and shared by every prop.
 * Glossy inflatable vinyl, satin black, aqua plastic, chrome, coral, turf, terrazzo.
 */
/**
 * Vice League After Dark.
 *
 * Deliberately restrained: roughly 55% graphite / black / smoked navy, 25% cream concrete
 * and brushed metal, and only ~10% each of Cyan and Magenta. Toxic lime is reserved for
 * objectives and final-ten warnings. The loudest colour in a match should be the paint
 * the players put down themselves, not the scenery.
 */
export const PALETTE = {
  // Structure — the 55%.
  graphite: '#23262d',
  vinylBlack: '#141519',
  smokedNavy: '#1b2333',
  // Surfaces — the 25%.
  concrete: '#b8b7b4',
  terrazzo: '#a8a7a3',
  chrome: '#c8cfd8',
  white: '#e8e6e0',
  darkTurf: '#2f4433',
  // Accents — 10% each, plus lime strictly for objectives.
  cyan: '#12e2f0',
  magenta: '#ff2fa4',
  lime: '#c8ff2f',
  aqua: '#7fbfc4',
  coral: '#b85c38',
  roofOrange: '#b5551f',
  gold: '#c9a55e',
  water: '#1b6f7d',
  sunset: '#e8794f',
} as const;

function vinyl(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.24,
    metalness: 0.04,
    // Inflatable vinyl is glossy: let it pick up the sunset environment.
    envMapIntensity: 0.85,
    ...extra,
  });
}

export function createMaterials() {
  return {
    // Warm off-white concrete — the mansion masses. Matte, not glossy plastic.
    whiteVinyl: new THREE.MeshStandardMaterial({
      color: PALETTE.concrete,
      roughness: 0.72,
      metalness: 0.0,
      // Concrete is the largest surface in the arena, so it takes the least tint.
      envMapIntensity: 0.28,
    }),
    // Satin black inflatable vinyl with a glossy edge — the dominant estate material.
    blackVinyl: vinyl(PALETTE.vinylBlack, { roughness: 0.3, envMapIntensity: 1.1 }),
    graphite: vinyl(PALETTE.graphite, { roughness: 0.45, envMapIntensity: 0.7 }),
    // Character kit: matte helmet shell, dark mirrored visor, satin boots, shell torso.
    helmet: vinyl('#d9d5cc', { roughness: 0.42, envMapIntensity: 0.6 }),
    visor: new THREE.MeshStandardMaterial({
      color: '#0d1218',
      roughness: 0.04,
      metalness: 0.95,
      envMapIntensity: 1.6,
    }),
    vinylBoot: vinyl('#1a1c22', { roughness: 0.4 }),
    torsoShell: vinyl('#3b4049', { roughness: 0.4, envMapIntensity: 0.8 }),
    // Smoked aqua glass — dark and reflective, not a bright toy blue.
    aquaPlastic: new THREE.MeshStandardMaterial({
      color: PALETTE.aqua,
      roughness: 0.08,
      metalness: 0.25,
      envMapIntensity: 1.3,
      transparent: true,
      opacity: 0.5,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: '#cdd6e0',
      // Brushed rather than mirror-polished: a perfect mirror at dusk reflects a dark sky
      // and reads as a muddy blob. Some roughness lets the key light do the work.
      roughness: 0.26,
      metalness: 0.95,
      envMapIntensity: 1.1,
    }),
    coral: vinyl(PALETTE.coral, { roughness: 0.45 }),
    roof: vinyl(PALETTE.roofOrange, { roughness: 0.34, envMapIntensity: 0.7 }),
    // Translucent walkway glazing for the overhead connector.
    connectorGlass: new THREE.MeshStandardMaterial({
      color: '#8fb6bb',
      roughness: 0.06,
      metalness: 0.3,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.34,
    }),
    floodHousing: vinyl('#2b3340', { roughness: 0.5 }),
    floodLamp: new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
    peach: vinyl(PALETTE.concrete, { roughness: 0.6 }),
    turf: new THREE.MeshStandardMaterial({
      color: PALETTE.darkTurf,
      roughness: 0.95,
      envMapIntensity: 0.3,
    }),
    // Team light strips read as underlighting at dusk, so they carry real emissive punch.
    cyanTrim: vinyl(PALETTE.cyan, {
      roughness: 0.3,
      emissive: new THREE.Color(PALETTE.cyan),
      emissiveIntensity: 1.4,
    }),
    magentaTrim: vinyl(PALETTE.magenta, {
      roughness: 0.3,
      emissive: new THREE.Color(PALETTE.magenta),
      emissiveIntensity: 1.4,
    }),
    gold: new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.2, metalness: 0.7 }),
    bottleGlass: new THREE.MeshStandardMaterial({
      color: '#2f6b46',
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    }),
    seawall: vinyl('#8f8878', { roughness: 0.8 }),
    palmTrunk: vinyl('#5b4634', { roughness: 0.85 }),
    palmFrond: vinyl('#2c5c3c', { roughness: 0.75, side: THREE.DoubleSide }),
    // Hazy silhouette against the dusk sky, not a purple cutout.
    skyline: new THREE.MeshBasicMaterial({ color: '#3a3550' }),
    yacht: vinyl('#d8d5cc', { roughness: 0.35 }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;

/** Geometries are shared too — nothing here is per-instance. */
export function createGeometries() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 24),
    lowCylinder: new THREE.CylinderGeometry(1, 1, 1, 14),
    prism: new THREE.CylinderGeometry(1, 1, 1, 3),
    cone: new THREE.ConeGeometry(1, 1, 20),
    sphere: new THREE.SphereGeometry(1, 26, 18),
    lowSphere: new THREE.SphereGeometry(1, 16, 12),
    plane: new THREE.PlaneGeometry(1, 1),
    circle: new THREE.CircleGeometry(1, 28),
    ring: new THREE.RingGeometry(0.78, 1.02, 32),
    torus: new THREE.TorusGeometry(1, 0.22, 10, 28),
  };
}

export type Geometries = ReturnType<typeof createGeometries>;

export function disposeAll(record: Record<string, { dispose(): void }>): void {
  for (const value of Object.values(record)) value.dispose();
}
