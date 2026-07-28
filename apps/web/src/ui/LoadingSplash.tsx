import { useEffect } from 'react';
import type { ViceEstateLoadSnapshot } from '../game/viceEstateAssets.js';
import { recordLoadingMetric } from '../game/loadingMetrics.js';
import type { ViceEstateVisualStatus } from '../scene/ViceEstateVisualLayer.js';
import './FrontDoor.css';

export const LOADING_SPLASH_ASSET = '/ui/loading-screen-v3.jpg';
export const LOADING_SPLASH_MOBILE_ASSET = '/ui/loading-screen-mobile-v3.jpg';

export interface LoadingProgressInput {
  imageSettled: boolean;
  runtimeReady: boolean;
  visualStatus: ViceEstateVisualStatus;
  networkStarted: boolean;
  destinationReady: boolean;
  assets: Pick<ViceEstateLoadSnapshot, 'loaded' | 'total' | 'minimumReady' | 'status'>;
}

export interface LoadingProgressResult {
  fraction: number;
  minimumPlayable: boolean;
  fullReady: boolean;
  canSkip: boolean;
}

export function calculateLoadingProgress(input: LoadingProgressInput): LoadingProgressResult {
  const assetFraction =
    input.assets.total > 0 ? Math.min(1, input.assets.loaded / input.assets.total) : 0;
  const fraction =
    (input.imageSettled ? 0.12 : 0) +
    assetFraction * 0.76 +
    (input.runtimeReady ? 0.08 : 0) +
    (input.networkStarted ? 0.04 : 0);
  const legacyReady =
    input.visualStatus === 'legacy-ready' || input.visualStatus === 'gltf-failed-legacy';
  const gltfMinimumReady =
    input.visualStatus === 'gltf-minimum-ready' || input.visualStatus === 'gltf-full-ready';
  const minimumPlayable =
    input.imageSettled &&
    input.runtimeReady &&
    input.networkStarted &&
    input.destinationReady &&
    (legacyReady || (input.assets.minimumReady && gltfMinimumReady));
  const fullReady = minimumPlayable && (legacyReady || input.visualStatus === 'gltf-full-ready');
  const canSkip = minimumPlayable && !fullReady;
  return {
    fraction: fullReady ? 1 : Math.min(0.99, fraction),
    minimumPlayable,
    fullReady,
    canSkip,
  };
}

export function loadingStatusText(
  input: LoadingProgressInput & {
    assets: ViceEstateLoadSnapshot;
  },
): string {
  if (!input.imageSettled) return 'Preparing broadcast';
  if (!input.runtimeReady) return 'Starting renderer';
  if (input.visualStatus === 'legacy-ready') {
    return input.destinationReady ? 'Legacy estate visuals ready' : 'Preparing home';
  }
  if (input.visualStatus === 'gltf-failed-legacy') {
    return input.destinationReady
      ? 'Arena art unavailable — using legacy visuals'
      : 'Preparing home';
  }
  if (!input.assets.minimumReady) {
    return `Loading arena ${input.assets.minimumLoaded}/${input.assets.minimumTotal}`;
  }
  if (input.assets.status === 'loading') {
    return `Finishing estate ${input.assets.loaded}/${input.assets.total}`;
  }
  if (input.visualStatus === 'gltf-loading' || input.visualStatus === 'gltf-minimum-ready') {
    return 'Mounting estate';
  }
  if (!input.destinationReady) return 'Preparing home';
  return 'Ready';
}

export function LoadingSplash({
  assets,
  runtimeReady,
  visualStatus,
  networkStarted,
  destinationReady,
  networkLabel,
  imageSettled,
  onImageSettled,
  onSkip,
}: {
  assets: ViceEstateLoadSnapshot;
  runtimeReady: boolean;
  visualStatus: ViceEstateVisualStatus;
  networkStarted: boolean;
  destinationReady: boolean;
  networkLabel: string;
  imageSettled: boolean;
  onImageSettled: (ok: boolean) => void;
  onSkip: () => void;
}) {
  useEffect(() => {
    recordLoadingMetric('splashVisibleAt');
  }, []);

  const progress = calculateLoadingProgress({
    assets,
    imageSettled,
    runtimeReady,
    visualStatus,
    networkStarted,
    destinationReady,
  });
  const percent = Math.round(progress.fraction * 100);
  const status = loadingStatusText({
    assets,
    imageSettled,
    runtimeReady,
    visualStatus,
    networkStarted,
    destinationReady,
  });

  const handleImageLoad = async (image: HTMLImageElement) => {
    try {
      await image.decode();
      recordLoadingMetric('imageReadyAt');
      onImageSettled(true);
    } catch {
      recordLoadingMetric('imageReadyAt');
      onImageSettled(false);
    }
  };

  return (
    <section className="loading-splash" aria-label="Loading SPLAT 04">
      <picture>
        <source media="(max-aspect-ratio: 1/1)" srcSet={LOADING_SPLASH_MOBILE_ASSET} />
        <img
          className="loading-splash__art"
          src={LOADING_SPLASH_ASSET}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          onLoad={(event) => void handleImageLoad(event.currentTarget)}
          onError={() => {
            recordLoadingMetric('imageReadyAt');
            onImageSettled(false);
          }}
        />
      </picture>
      <div className="loading-splash__shade" aria-hidden="true" />
      <div className="loading-splash__status">
        <div className="loading-splash__brand">SPLAT 04</div>
        <div
          className="loading-splash__bar"
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="loading-splash__row">
          <span aria-live="polite">
            {percent}% · {status}
          </span>
          <span className="loading-splash__network">{networkLabel}</span>
        </div>
        {progress.canSkip ? (
          <button type="button" className="loading-splash__skip" onClick={onSkip}>
            Skip
          </button>
        ) : null}
      </div>
    </section>
  );
}
