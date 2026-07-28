import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  VICE_ESTATE_ASSETS,
  VICE_ESTATE_LAYOUT,
  isLayoutApproved,
  type AssetEntry,
} from '@splat04/shared';
import { AssetLibrary, isLowPowerDevice } from '../game/assets.js';

/**
 * Isolated art-review scene for the Blender-authored kit.
 *
 * Deliberately separate from the match route: it loads GLBs, places them straight from the
 * approved layout, and frames the Golden Hour review camera. No gameplay, no networking,
 * no procedural arena. The live match keeps using the legacy procedural arena until this
 * layout clears Gate A.
 */
export function ArtReviewScene() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [freeLook, setFreeLook] = useState(false);

  const layout = VICE_ESTATE_LAYOUT;
  const manifest = VICE_ESTATE_ASSETS;

  return (
    <div className="art-review">
      <ArtReviewHud
        status={status}
        progress={progress}
        errors={errors}
        freeLook={freeLook}
        onToggleFreeLook={() => setFreeLook((v) => !v)}
      />
      <Canvas
        shadows
        dpr={[1, Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1)]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 50, near: 0.5, far: 1200 }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.setClearColor('#1a1420');
          scene.fog = new THREE.Fog('#3a2f3d', 140, 520);
        }}
      >
        <GoldenHourLighting />
        <ReviewCamera layout={layout} freeLook={freeLook} />
        <KitPlacements
          layout={layout}
          manifest={manifest}
          onStatus={setStatus}
          onProgress={setProgress}
          onErrors={setErrors}
        />
      </Canvas>
    </div>
  );
}

/** Warm coral key over the waterfront, cool rim, deep ambient — matching the art direction. */
function GoldenHourLighting() {
  return (
    <>
      <hemisphereLight args={['#9db8d8', '#241d28', 0.9]} />
      <directionalLight
        position={[-70, 46, -92]}
        intensity={2.6}
        color="#ffb27f"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-far={320}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[60, 30, 70]} intensity={0.7} color="#8fbcff" />
      <ambientLight intensity={0.22} color="#6d7c9c" />
    </>
  );
}

/**
 * Places the camera exactly where the layout's `reviewCamera` says.
 *
 * This is the camera the Blender render uses, so a like-for-like comparison between the
 * Blender sheet and the WebGL2 scene is meaningful rather than approximate.
 */
function ReviewCamera({
  layout,
  freeLook,
}: {
  layout: typeof VICE_ESTATE_LAYOUT;
  freeLook: boolean;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const angle = useRef(0);

  useEffect(() => {
    const spec = layout.reviewCamera;
    // Blender's focal length is horizontal-sensor based; convert to three's vertical FOV.
    const aspect = size.width / Math.max(1, size.height);
    const horizontalFov = 2 * Math.atan(spec.sensorWidthMm / 2 / spec.focalLengthMm);
    const verticalFov = 2 * Math.atan(Math.tan(horizontalFov / 2) / aspect);
    camera.fov = THREE.MathUtils.radToDeg(verticalFov);
    camera.position.set(...spec.position);
    camera.lookAt(...spec.target);
    camera.updateProjectionMatrix();
  }, [camera, layout, size.width, size.height]);

  useFrame((_, delta) => {
    if (!freeLook) return;
    // Slow orbit so silhouettes can be checked from more than one angle.
    const spec = layout.reviewCamera;
    angle.current += delta * 0.12;
    const radius = Math.hypot(spec.position[0] - spec.target[0], spec.position[2] - spec.target[2]);
    camera.position.set(
      spec.target[0] + Math.sin(angle.current) * radius,
      spec.position[1],
      spec.target[2] + Math.cos(angle.current) * radius,
    );
    camera.lookAt(...spec.target);
  });

  return null;
}

function KitPlacements({
  layout,
  manifest,
  onStatus,
  onProgress,
  onErrors,
}: {
  layout: typeof VICE_ESTATE_LAYOUT;
  manifest: typeof VICE_ESTATE_ASSETS;
  onStatus: (s: 'loading' | 'ready' | 'error') => void;
  onProgress: (p: { loaded: number; total: number }) => void;
  onErrors: (e: string[]) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const library = useMemo(() => new AssetLibrary(manifest), [manifest]);

  useEffect(() => {
    let cancelled = false;
    const lowPower = isLowPowerDevice();

    // Only load assets the layout actually places.
    const used = new Set(layout.placements.map((p) => p.asset));
    const assets: AssetEntry[] = manifest.assets.filter((a) => used.has(a.id));

    (async () => {
      await library.preload(assets, { lowPower }, (loaded, total) => {
        if (!cancelled) onProgress({ loaded, total });
      });
      if (cancelled) return;

      const root = group.current;
      if (!root) return;

      let placed = 0;
      for (const placement of layout.placements) {
        const asset = manifest.assets.find((a) => a.id === placement.asset);
        if (!asset) continue;
        const instance = library.instance(asset, { lowPower });
        if (!instance) continue; // legitimately excluded on this device tier
        instance.name = placement.id;
        instance.position.set(...placement.transform.position);
        instance.rotation.y = placement.transform.rotationY;
        instance.scale.set(...placement.transform.scale);
        root.add(instance);
        placed += 1;
      }

      onErrors(library.errors.map((e) => `${e.assetId}: ${e.error}`));
      onStatus(library.errors.length > 0 && placed === 0 ? 'error' : 'ready');
    })();

    return () => {
      cancelled = true;
      const root = group.current;
      if (root) {
        // Instances share cached geometry, so only the node graph is detached here;
        // the library disposes the real GPU resources.
        root.clear();
      }
      library.dispose();
    };
  }, [layout, manifest, library, onStatus, onProgress, onErrors]);

  return <group ref={group} />;
}

function ArtReviewHud({
  status,
  progress,
  errors,
  freeLook,
  onToggleFreeLook,
}: {
  status: 'loading' | 'ready' | 'error';
  progress: { loaded: number; total: number };
  errors: string[];
  freeLook: boolean;
  onToggleFreeLook: () => void;
}) {
  const approved = isLayoutApproved();
  return (
    <div className="art-review__hud">
      <div className="art-review__title">
        VICE ESTATE 04 — ART REVIEW
        <span className={`art-review__badge ${approved ? '' : 'art-review__badge--provisional'}`}>
          {approved ? 'GATE A APPROVED' : 'BLOCKOUT — NOT FINAL ART'}
        </span>
      </div>
      <div className="art-review__meta">
        <span>kit {VICE_ESTATE_ASSETS.contentVersion}</span>
        <span>{VICE_ESTATE_LAYOUT.placements.length} placements</span>
        <span>
          {status === 'loading' ? `loading ${progress.loaded}/${progress.total}` : status}
        </span>
        <button className="art-review__button" onClick={onToggleFreeLook}>
          {freeLook ? 'Stop orbit' : 'Orbit'}
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="art-review__errors">
          {errors.slice(0, 6).map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
