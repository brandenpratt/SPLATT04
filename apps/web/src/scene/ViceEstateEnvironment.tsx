import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const VICE_ESTATE_EXPOSURE = 1;
/** Covers the authored skyline bands at z=-2000 and z=-2400 from either runtime camera. */
export const VICE_ESTATE_CAMERA_FAR = 3600;

/**
 * Keep both browser views on one output transform. The Blender render still has richer
 * authored world lighting/reflection cards, so this is reconciliation rather than a claim
 * of pixel parity.
 */
export function configureViceEstateRenderer(gl: THREE.WebGLRenderer, scene: THREE.Scene): void {
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = VICE_ESTATE_EXPOSURE;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.setClearColor('#141d33');
  // Preserve atmospheric separation without fully erasing the two authored skyline bands.
  scene.fog = new THREE.Fog('#3a3448', 700, 3300);
}

/**
 * In-memory sunset PMREM used by both gameplay and art review.
 *
 * There is no HDRI in the current kit. This gives chrome and glossy GLB materials a stable
 * reflection source without pretending to reproduce Blender's authored reflection rig.
 */
export function ViceEstateEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
      string,
      unknown
    >;
    hook.gl = gl;
    hook.scene = scene;
    (window as unknown as Record<string, unknown>).__splat04 = hook;
  }, [gl, scene]);

  useEffect(() => {
    const width = 128;
    const height = 64;
    const backgroundData = new Uint8Array(width * height * 4);
    const reflectionData = new Uint8Array(width * height * 4);
    const sky = new THREE.Color('#141d33');
    const horizon = new THREE.Color('#5f5061');
    const warm = new THREE.Color('#d88a5c');
    const ground = new THREE.Color('#1a1d24');
    const reflectionWhite = new THREE.Color('#f7fbff');
    const reflectionWarm = new THREE.Color('#ffd3ad');
    const colour = new THREE.Color();
    const reflectionColour = new THREE.Color();

    const writePixel = (data: Uint8Array, offset: number, value: THREE.Color) => {
      data[offset] = Math.round(value.r * 255);
      data[offset + 1] = Math.round(value.g * 255);
      data[offset + 2] = Math.round(value.b * 255);
      data[offset + 3] = 255;
    };

    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        if (v < 0.5) {
          colour.copy(sky).lerp(horizon, Math.pow(v / 0.5, 3));
          const glow = Math.max(0, 1 - Math.abs(u - 0.25) * 6) * Math.pow(v / 0.5, 6);
          colour.lerp(warm, glow * 0.7);
        } else {
          colour.copy(horizon).lerp(ground, Math.pow((v - 0.5) / 0.5, 0.7));
        }
        const offset = (y * width + x) * 4;
        writePixel(backgroundData, offset, colour);

        // Bright studio-like strips live only in the reflection source, not the visible
        // background. They give low-roughness chrome readable light/dark contours despite
        // the current kit having no HDRI or authored browser reflection cards.
        reflectionColour.copy(colour);
        const horizonStrip = Math.max(0, 1 - Math.abs(v - 0.47) * 34);
        const westCard =
          Math.max(0, 1 - Math.abs(u - 0.18) * 28) * Math.max(0, 1 - Math.abs(v - 0.34) * 3.4);
        const eastCard =
          Math.max(0, 1 - Math.abs(u - 0.68) * 34) * Math.max(0, 1 - Math.abs(v - 0.4) * 4.2);
        reflectionColour.lerp(reflectionWarm, Math.min(0.92, horizonStrip * 0.86));
        reflectionColour.lerp(reflectionWhite, Math.min(0.96, Math.max(westCard, eastCard)));
        writePixel(reflectionData, offset, reflectionColour);
      }
    }

    const background = new THREE.DataTexture(backgroundData, width, height, THREE.RGBAFormat);
    background.mapping = THREE.EquirectangularReflectionMapping;
    background.colorSpace = THREE.SRGBColorSpace;
    background.needsUpdate = true;

    const reflection = new THREE.DataTexture(reflectionData, width, height, THREE.RGBAFormat);
    reflection.mapping = THREE.EquirectangularReflectionMapping;
    reflection.colorSpace = THREE.SRGBColorSpace;
    reflection.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const environment = pmrem.fromEquirectangular(reflection).texture;
    scene.environment = environment;
    scene.background = background;

    pmrem.dispose();
    reflection.dispose();

    return () => {
      if (scene.environment === environment) scene.environment = null;
      if (scene.background === background) scene.background = null;
      environment.dispose();
      background.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Shared warm key, cool rim and fill for the gameplay and review canvases. */
export function ViceEstateLighting({ quality }: { quality: 'low' | 'high' }) {
  const high = quality === 'high';
  return (
    <>
      <hemisphereLight args={['#9db8d8', '#241d28', 1]} />
      <directionalLight
        position={[-70, 46, -92]}
        intensity={2.2}
        color="#ffb27f"
        castShadow={high}
        shadow-mapSize-width={high ? 2048 : 1024}
        shadow-mapSize-height={high ? 2048 : 1024}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={320}
        shadow-normalBias={0.04}
        shadow-bias={-0.0006}
      />
      <directionalLight position={[60, 30, 70]} intensity={0.7} color="#8fbcff" />
      <ambientLight intensity={0.22} color="#6d7c9c" />
    </>
  );
}
