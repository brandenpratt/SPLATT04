export interface LoadingMetrics {
  appStartedAt?: number;
  splashVisibleAt?: number;
  imageReadyAt?: number;
  networkStartedAt?: number;
  runtimeReadyAt?: number;
  minimumPlayableAt?: number;
  fullAssetsAt?: number;
  fullReadyAt?: number;
}

const metrics: LoadingMetrics = {};

export function recordLoadingMetric(key: keyof LoadingMetrics, at?: number): void {
  if (metrics[key] !== undefined) return;
  metrics[key] = at ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (typeof window === 'undefined') return;
  const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
    string,
    unknown
  >;
  hook.loadingMetrics = { ...metrics };
  (window as unknown as Record<string, unknown>).__splat04 = hook;
}

export function getLoadingMetrics(): Readonly<LoadingMetrics> {
  return metrics;
}

recordLoadingMetric('appStartedAt');
