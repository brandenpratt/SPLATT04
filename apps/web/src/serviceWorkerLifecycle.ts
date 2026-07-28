export interface ServiceWorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface ServiceWorkerRegistrationLike {
  waiting: ServiceWorkerLike | null;
  installing: ServiceWorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface ServiceWorkerContainerLike {
  register(url: string): Promise<ServiceWorkerRegistrationLike>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

/**
 * Coordinates worker activation with match state.
 *
 * A newly installed worker may wait at any time, but it receives skipWaiting only after
 * the app explicitly reports that no match is active. A controller handoff caused by that
 * request reloads exactly once so the shell, UI plates and GLB cache all share one version.
 */
export class ServiceWorkerLifecycle {
  private registration: ServiceWorkerRegistrationLike | null = null;
  private matchActive = true;
  private activationRequestedFor: ServiceWorkerLike | null = null;
  private reloadIssued = false;
  private controllerListenerAttached = false;

  constructor(
    private readonly container: ServiceWorkerContainerLike | null,
    private readonly reload: () => void,
    private readonly schedule: (callback: () => void, delayMs: number) => void = (
      callback,
      delayMs,
    ) => {
      setTimeout(callback, delayMs);
    },
  ) {}

  async register(): Promise<void> {
    if (!this.container) return;
    if (!this.controllerListenerAttached) {
      this.controllerListenerAttached = true;
      this.container.addEventListener('controllerchange', () => {
        if (!this.activationRequestedFor || this.reloadIssued) return;
        this.reloadIssued = true;
        this.reload();
      });
    }

    this.registration = await this.container.register('/sw.js');
    this.watchInstallingWorker();
    this.registration.addEventListener('updatefound', () => this.watchInstallingWorker());
    this.activateWaitingWorkerWhenSafe();
  }

  setMatchActive(active: boolean): void {
    this.matchActive = active;
    if (!active) this.activateWaitingWorkerWhenSafe();
  }

  private watchInstallingWorker(): void {
    const installing = this.registration?.installing;
    if (!installing) {
      this.activateWaitingWorkerWhenSafe();
      return;
    }
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') this.retryWaitingWorkerWhenSafe();
    });
  }

  /**
   * `statechange: installed` can fire one task before `registration.waiting` is exposed.
   * Retry briefly so a safe front-door update cannot remain stale until another navigation.
   */
  private retryWaitingWorkerWhenSafe(attemptsRemaining = 20): void {
    if (this.matchActive) return;
    this.activateWaitingWorkerWhenSafe();
    if (this.activationRequestedFor || attemptsRemaining <= 0) return;
    this.schedule(() => this.retryWaitingWorkerWhenSafe(attemptsRemaining - 1), 50);
  }

  private activateWaitingWorkerWhenSafe(): void {
    const waiting = this.registration?.waiting;
    if (this.matchActive || !waiting || waiting === this.activationRequestedFor) return;
    this.activationRequestedFor = waiting;
    waiting.postMessage('splat04:activate-update');
  }
}

const browserServiceWorker =
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? (navigator.serviceWorker as unknown as ServiceWorkerContainerLike)
    : null;

export const serviceWorkerLifecycle = new ServiceWorkerLifecycle(browserServiceWorker, () => {
  if (typeof location !== 'undefined') location.reload();
});
