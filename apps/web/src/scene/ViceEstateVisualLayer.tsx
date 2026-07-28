import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VICE_ESTATE_ASSETS, VICE_ESTATE_LAYOUT } from '@splat04/shared';
import { isLowPowerDevice } from '../game/assets.js';
import {
  findViceEstateAsset,
  preloadViceEstateKit,
  type ViceEstateLoadSnapshot,
} from '../game/viceEstateAssets.js';
import {
  shouldRenderViceEstatePlacement,
  validateViceEstateVisualInputs,
} from './viceEstateVisual.js';

export type ViceEstateVisualPurpose = 'gameplay' | 'art-review';
export type ViceEstateVisualStatus = 'loading' | 'ready' | 'error';

interface Props {
  purpose: ViceEstateVisualPurpose;
  quality?: 'low' | 'high';
  cameraTarget?: () => { x: number; z: number };
  onStatus?: (status: ViceEstateVisualStatus) => void;
  onErrors?: (errors: string[]) => void;
}

const loggedDevelopmentErrors = new Set<string>();

function reportDevelopmentError(message: string): void {
  if (!import.meta.env.DEV || loggedDevelopmentErrors.has(message)) return;
  loggedDevelopmentErrors.add(message);
  console.error(`[ViceEstateVisualLayer] ${message}`);
}

/**
 * The one GLB placement implementation used by both the live match and art review.
 *
 * It consumes the exact shared manifest/layout and the page-wide decoded asset library.
 * Gameplay intentionally omits static splat placements because the dynamic PaintFloor is
 * authoritative for visible coverage. The authored court remains as a neutral substrate.
 */
export function ViceEstateVisualLayer({
  purpose,
  quality = 'high',
  cameraTarget,
  onStatus,
  onErrors,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const cameraObstructions = useRef<Array<{ object: THREE.Object3D; bounds: THREE.Box3 }>>([]);
  const obstructionRay = useMemo(() => new THREE.Ray(), []);
  const obstructionDirection = useMemo(() => new THREE.Vector3(), []);
  const obstructionTarget = useMemo(() => new THREE.Vector3(), []);
  const obstructionHit = useMemo(() => new THREE.Vector3(), []);
  const validationErrors = useMemo(
    () => validateViceEstateVisualInputs(VICE_ESTATE_LAYOUT, VICE_ESTATE_ASSETS),
    [],
  );

  useFrame(({ camera }) => {
    if (purpose !== 'gameplay' || !cameraTarget) return;
    const target = cameraTarget();
    obstructionTarget.set(target.x, 1.42, target.z);
    obstructionDirection.copy(obstructionTarget).sub(camera.position);
    const targetDistance = obstructionDirection.length();
    if (targetDistance > 0.001) obstructionDirection.multiplyScalar(1 / targetDistance);
    obstructionRay.set(camera.position, obstructionDirection);

    for (const obstruction of cameraObstructions.current) {
      const cameraInside = obstruction.bounds.containsPoint(camera.position);
      const intersection =
        targetDistance > 0.001
          ? obstructionRay.intersectBox(obstruction.bounds, obstructionHit)
          : null;
      obstruction.object.visible =
        !cameraInside &&
        !(intersection && camera.position.distanceTo(intersection) <= targetDistance);
    }
  });

  useEffect(() => {
    let cancelled = false;
    const lowPower = quality === 'low' || isLowPowerDevice();
    onStatus?.('loading');
    for (const error of validationErrors) reportDevelopmentError(error);

    void preloadViceEstateKit().then((library) => {
      if (cancelled) return;
      const root = group.current;
      if (!root) return;
      root.clear();
      cameraObstructions.current = [];

      let placed = 0;
      let intentionallyOmitted = 0;
      const placementErrors = [...validationErrors];

      for (const placement of VICE_ESTATE_LAYOUT.placements) {
        if (!shouldRenderViceEstatePlacement(placement, VICE_ESTATE_ASSETS, purpose)) {
          intentionallyOmitted += 1;
          continue;
        }

        const asset = findViceEstateAsset(placement.asset);
        if (!asset) continue;

        const instance = library.instance(asset, { lowPower });
        if (!instance) {
          if (lowPower && asset.mobileFallback === null) {
            intentionallyOmitted += 1;
            continue;
          }
          const message = `${placement.id}: GLB "${asset.id}" was not available after preload`;
          placementErrors.push(message);
          reportDevelopmentError(message);
          continue;
        }

        instance.name = placement.id;
        instance.position.set(...placement.transform.position);
        // The court mesh tops out 0.055 m above its origin. Lower it just enough that the
        // dynamic gameplay plane at y=0 wins depth testing without changing either source.
        if (purpose === 'gameplay' && asset.kind === 'ground') {
          instance.position.y -= 0.075;
        }
        instance.rotation.y = placement.transform.rotationY;
        instance.scale.set(...placement.transform.scale);
        instance.userData.assetId = asset.id;
        instance.userData.placementId = placement.id;
        if (placement.castShadow === false) {
          instance.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).castShadow = false;
          });
        }
        root.add(instance);
        // The provisional GLB footprint overlaps some legacy spawn/camera paths. Hide only
        // solid cover caught between camera and player; landmarks and scenery stay visible.
        if (
          purpose === 'gameplay' &&
          ['bunker', 'perimeter', 'planter', 'prop'].includes(asset.kind)
        ) {
          instance.updateWorldMatrix(true, true);
          cameraObstructions.current.push({
            object: instance,
            bounds: new THREE.Box3().setFromObject(instance),
          });
        }
        placed += 1;
      }

      for (const failure of library.errors) {
        const message = `${failure.assetId}: ${failure.url} — ${failure.error}`;
        placementErrors.push(message);
        reportDevelopmentError(message);
      }

      const status: ViceEstateVisualStatus = placed === 0 ? 'error' : 'ready';
      onErrors?.(placementErrors);
      onStatus?.(status);

      const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
        string,
        unknown
      >;
      hook.visualLayer = {
        name: 'ViceEstateVisualLayer',
        purpose,
        status,
        placements: placed,
        intentionallyOmitted,
        rendererMode: 'gltf',
      };
      (window as unknown as Record<string, unknown>).__splat04 = hook;
    });

    return () => {
      cancelled = true;
      cameraObstructions.current = [];
      group.current?.clear();
    };
  }, [onErrors, onStatus, purpose, quality, validationErrors]);

  return <group ref={group} name="ViceEstateVisualLayer" />;
}

/** Convert load state to the percentage displayed by the existing main-screen plumbing. */
export function viceEstateLoadFraction(snapshot: ViceEstateLoadSnapshot): number {
  if (snapshot.total <= 0) return 0;
  return Math.min(1, Math.max(0, snapshot.loaded / snapshot.total));
}
