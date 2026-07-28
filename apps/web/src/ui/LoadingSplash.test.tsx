import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  calculateLoadingProgress,
  loadingStatusText,
  LoadingSplash,
  LOADING_SPLASH_ASSET,
  LOADING_SPLASH_MOBILE_ASSET,
} from './LoadingSplash.js';

const readyAssets = {
  status: 'ready' as const,
  loaded: 29,
  total: 29,
  failed: 0,
  urls: [],
  minimumLoaded: 12,
  minimumTotal: 12,
  minimumReady: true,
  bytesLoaded: 0,
  startedAt: 1,
  minimumReadyAt: 2,
  fullReadyAt: 3,
  readyAt: 3,
  events: [],
};

describe('loading splash', () => {
  it('reaches one only when real readiness is complete', () => {
    expect(
      calculateLoadingProgress({
        assets: readyAssets,
        imageSettled: true,
        runtimeReady: true,
        visualStatus: 'gltf-full-ready',
        networkStarted: true,
        destinationReady: true,
      }),
    ).toEqual({ fraction: 1, minimumPlayable: true, fullReady: true, canSkip: false });
  });

  it('contains no live home-menu controls', () => {
    const html = renderToStaticMarkup(
      <LoadingSplash
        assets={readyAssets}
        runtimeReady
        visualStatus="gltf-full-ready"
        networkStarted
        destinationReady
        networkLabel="Online"
        imageSettled
        onImageSettled={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(html).not.toContain('LOCKER');
    expect(html).not.toContain('COREBALL');
    expect(html).not.toContain('QUICK SPLAT');
    expect(html).not.toContain('>PLAY<');
    expect(html).toContain(`src="${LOADING_SPLASH_ASSET}"`);
    expect(html).toContain(`srcSet="${LOADING_SPLASH_MOBILE_ASSET}"`);
    expect(html).toContain('fetchPriority="high"');
  });

  it('does not release or expose Skip before the GLB layer is actually renderable', () => {
    const input = {
      assets: readyAssets,
      imageSettled: true,
      runtimeReady: true,
      visualStatus: 'gltf-loading' as const,
      networkStarted: true,
      destinationReady: true,
    };
    expect(calculateLoadingProgress(input)).toMatchObject({
      minimumPlayable: false,
      fullReady: false,
    });
    const html = renderToStaticMarkup(
      <LoadingSplash
        {...input}
        networkLabel="Online"
        onImageSettled={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(html).not.toContain('>Skip<');
  });

  it('offers meaningful Skip after minimum visuals render while optional GLBs continue', () => {
    const assets = {
      ...readyAssets,
      status: 'loading' as const,
      loaded: 12,
      fullReadyAt: null,
      readyAt: null,
    };
    const input = {
      assets,
      imageSettled: true,
      runtimeReady: true,
      visualStatus: 'gltf-minimum-ready' as const,
      networkStarted: true,
      destinationReady: true,
    };
    expect(calculateLoadingProgress(input)).toMatchObject({
      minimumPlayable: true,
      fullReady: false,
      canSkip: true,
    });
    expect(loadingStatusText(input)).toBe('Finishing estate 12/29');
    const html = renderToStaticMarkup(
      <LoadingSplash
        {...input}
        networkLabel="Online"
        onImageSettled={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(html).toContain('>Skip<');
  });

  it('releases through legacy for explicit rollback and critical GLB failure', () => {
    const base = {
      assets: { ...readyAssets, status: 'error' as const, minimumReady: false },
      imageSettled: true,
      runtimeReady: true,
      networkStarted: true,
      destinationReady: true,
    };
    expect(
      calculateLoadingProgress({
        ...base,
        visualStatus: 'gltf-failed-legacy',
      }),
    ).toMatchObject({ minimumPlayable: true, fullReady: true, canSkip: false });
    expect(
      calculateLoadingProgress({
        ...base,
        assets: { ...base.assets, status: 'idle', total: 0, loaded: 0 },
        visualStatus: 'legacy-ready',
      }),
    ).toMatchObject({ minimumPlayable: true, fullReady: true, canSkip: false });
  });
});
