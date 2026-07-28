import { describe, expect, it, vi } from 'vitest';
import { preloadDecodedImage } from './imagePreload.js';

describe('decoded UI image preload', () => {
  it('does not settle until the loaded image finishes decoding', async () => {
    const deferred: { resolve: () => void } = { resolve: () => {} };
    const image = {
      src: '',
      complete: false,
      onload: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
      decode: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            deferred.resolve = resolve;
          }),
      ),
    };
    const preload = preloadDecodedImage('/ui/vice-estate-home-v3.jpg', () => image);
    let settled = false;
    void preload.then(() => {
      settled = true;
    });

    image.onload?.({} as Event);
    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.resolve();
    await expect(preload).resolves.toBe(true);
    expect(image.src).toBe('/ui/vice-estate-home-v3.jpg');
  });
});
