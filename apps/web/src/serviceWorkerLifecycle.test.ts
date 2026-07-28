import { describe, expect, it, vi } from 'vitest';
import {
  ServiceWorkerLifecycle,
  type ServiceWorkerContainerLike,
  type ServiceWorkerLike,
  type ServiceWorkerRegistrationLike,
} from './serviceWorkerLifecycle.js';

describe('service-worker lifecycle', () => {
  it('activates a waiting update only outside a match and reloads once on handoff', async () => {
    const messages: unknown[] = [];
    const worker: ServiceWorkerLike = {
      state: 'installed',
      postMessage: (message) => messages.push(message),
      addEventListener: () => undefined,
    };
    const registration: ServiceWorkerRegistrationLike = {
      waiting: worker,
      installing: null,
      addEventListener: () => undefined,
    };
    const listeners = new Map<string, () => void>();
    const container: ServiceWorkerContainerLike = {
      register: vi.fn(async () => registration),
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
    };
    const reload = vi.fn();
    const lifecycle = new ServiceWorkerLifecycle(container, reload);

    await lifecycle.register();
    expect(messages).toEqual([]);

    lifecycle.setMatchActive(true);
    expect(messages).toEqual([]);

    lifecycle.setMatchActive(false);
    expect(messages).toEqual(['splat04:activate-update']);

    listeners.get('controllerchange')?.();
    listeners.get('controllerchange')?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('retries the installed-to-waiting registration race while outside a match', async () => {
    const messages: unknown[] = [];
    const scheduled: Array<() => void> = [];
    const stateListeners: Array<() => void> = [];
    const worker: ServiceWorkerLike = {
      state: 'installing',
      postMessage: (message) => messages.push(message),
      addEventListener: (_type, listener) => {
        stateListeners.push(listener);
      },
    };
    const registration: ServiceWorkerRegistrationLike = {
      waiting: null,
      installing: worker,
      addEventListener: () => undefined,
    };
    const container: ServiceWorkerContainerLike = {
      register: vi.fn(async () => registration),
      addEventListener: () => undefined,
    };
    const lifecycle = new ServiceWorkerLifecycle(container, vi.fn(), (callback) => {
      scheduled.push(callback);
    });

    lifecycle.setMatchActive(false);
    await lifecycle.register();
    worker.state = 'installed';
    stateListeners[0]?.();

    expect(messages).toEqual([]);
    expect(scheduled).toHaveLength(1);

    registration.waiting = worker;
    scheduled.shift()?.();
    expect(messages).toEqual(['splat04:activate-update']);
    expect(scheduled).toHaveLength(0);
  });
});
