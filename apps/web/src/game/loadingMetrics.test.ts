import { describe, expect, it } from 'vitest';
import { getLoadingMetrics, recordLoadingMetric } from './loadingMetrics.js';

describe('loading milestone metrics', () => {
  it('records minimum-playable and full-assets timestamps independently', () => {
    recordLoadingMetric('minimumPlayableAt', 101);
    recordLoadingMetric('fullAssetsAt', 202);
    expect(getLoadingMetrics()).toMatchObject({
      minimumPlayableAt: 101,
      fullAssetsAt: 202,
    });
  });
});
