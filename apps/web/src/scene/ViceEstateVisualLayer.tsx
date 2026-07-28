import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VICE_ESTATE_ASSETS, VICE_ESTATE_LAYOUT } from '@splat04/shared';
import { isLowPowerDevice } from '../game/assets.js';
import {
  findViceEstateAsset,
  isMinimumPlayableViceEstateAsset,
  preloadViceEstateKit,
  type ViceEstateLoadSnapshot,
} from '../game/viceEstateAssets.js';
import {
  shouldRenderViceEstatePlacement,
  validateViceEstateVisualInputs,
} from './viceEstateVisual.js';

export type ViceEstateVisualPurpose = 'gameplay' | 'art-review';
export type ViceEstateVisualStatus =
  | 'gltf-loading'
  | 'gltf-minimum-ready'
  | 'gltf-full-ready'
  | 'legacy-ready'
  | 'gltf-failed-legacy'
  | 'error';

interface Props {
  purpose: ViceEstateVisualPurpose;
  quality?: 'low' | 'high';
  cameraTarget?: () => { x: number; z: number };
  /** Backward-compatible art-review status contract. */
  onStatus?: (status: 'loading' | 'ready' | 'error') => void;
  /** Phase-aware gameplay readiness contract. */
  onReadiness?: (status: ViceEstateVisualStatus) => void;
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
  onReadiness,
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
    onReadiness?.('gltf-loading');
    for (const error of validationErrors) reportDevelopmentError(error);

    const preload = preloadViceEstateKit({ lowPower, purpose });
    const selectedLowPower = preload.lowPower;
    const root = group.current;
    if (!root) return;
    root.clear();
    cameraObstructions.current = [];

    let placed = 0;
    let intentionallyOmitted = 0;
    const placedIds = new Set<string>();
    const placementErrors = new Set(validationErrors);

    const syncLibraryErrors = () => {
      for (const failure of preload.library.errors) {
        const message = `${failure.assetId}: ${failure.url} — ${failure.error}`;
        placementErrors.add(message);
        reportDevelopmentError(message);
      }
    };

    const mountPhase = (phase: 'minimum' | 'optional') => {
      let phasePlaced = 0;
      for (const placement of VICE_ESTATE_LAYOUT.placements) {
        if (placedIds.has(placement.id)) continue;
        const asset = findViceEstateAsset(placement.asset);
        if (!asset) continue;
        const minimum = isMinimumPlayableViceEstateAsset(asset.id);
        if ((phase === 'minimum') !== minimum) continue;

        if (!shouldRenderViceEstatePlacement(placement, VICE_ESTATE_ASSETS, purpose)) {
          intentionallyOmitted += 1;
          continue;
        }

        const instance = preload.library.instance(asset, { lowPower: selectedLowPower });
        if (!instance) {
          if (selectedLowPower && asset.mobileFallback === null) {
            intentionallyOmitted += 1;
            continue;
          }
          const message = `${placement.id}: GLB "${asset.id}" was not available after ${phase} preload`;
          placementErrors.add(message);
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
        placedIds.add(placement.id);
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
        phasePlaced += 1;
      }
      return phasePlaced;
    };

    const reportStatus = (status: ViceEstateVisualStatus) => {
      onErrors?.([...placementErrors]);
      onReadiness?.(status);
      if (status === 'error') onStatus?.('error');
      else if (status === 'gltf-full-ready') onStatus?.('ready');
      else if (status === 'gltf-loading' || status === 'gltf-minimum-ready') {
        onStatus?.('loading');
      }
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
    };

    void preload.minimumReady.then((ready) => {
      if (cancelled) return;
      syncLibraryErrors();
      if (!ready || mountPhase('minimum') === 0) {
        reportStatus('error');
        return;
      }

      reportStatus('gltf-minimum-ready');
      void preload.fullReady.then((fullReady) => {
        if (cancelled) return;
        syncLibraryErrors();
        if (!fullReady) {
          reportStatus('error');
          return;
        }
        mountPhase('optional');
        reportStatus('gltf-full-ready');
      });
    });

    return () => {
      cancelled = true;
      cameraObstructions.current = [];
      group.current?.clear();
    };
  }, [onErrors, onReadiness, onStatus, purpose, quality, validationErrors]);

  return <group ref={group} name="ViceEstateVisualLayer" />;
}

/** Convert selected-path load state to a stable fraction for loading UI and diagnostics. */
export function viceEstateLoadFraction(snapshot: ViceEstateLoadSnapshot): number {
  if (snapshot.total <= 0) return 0;
  return Math.min(1, Math.max(0, snapshot.loaded / snapshot.total));
}
