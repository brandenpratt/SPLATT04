import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VICE_ESTATE_ASSETS, VICE_ESTATE_LAYOUT, isLayoutApproved } from '@splat04/shared';
import { getViceEstateLoadSnapshot, subscribeViceEstateLoad } from '../game/viceEstateAssets.js';
import {
  configureViceEstateRenderer,
  VICE_ESTATE_CAMERA_FAR,
  ViceEstateEnvironment,
  ViceEstateLighting,
} from './ViceEstateEnvironment.js';
import { ViceEstateVisualLayer } from './ViceEstateVisualLayer.js';

/**
 * Isolated art-review scene for the Blender-authored kit.
 *
 * Deliberately separate from match simulation and networking, while sharing the exact GLB
 * placement and lighting implementation now used by the live game.
 */
export function ArtReviewScene() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errors, setErrors] = useState<string[]>([]);
  const [freeLook, setFreeLook] = useState(false);
  const progress = useSyncExternalStore(
    subscribeViceEstateLoad,
    getViceEstateLoadSnapshot,
    getViceEstateLoadSnapshot,
  );

  const layout = VICE_ESTATE_LAYOUT;

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
        camera={{ fov: 50, near: 0.5, far: VICE_ESTATE_CAMERA_FAR }}
        onCreated={({ gl, scene }) => configureViceEstateRenderer(gl, scene)}
      >
        <ViceEstateEnvironment />
        <ViceEstateLighting quality="high" />
        <ReviewCamera layout={layout} freeLook={freeLook} />
        <ViceEstateVisualLayer purpose="art-review" onStatus={setStatus} onErrors={setErrors} />
      </Canvas>
    </div>
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
