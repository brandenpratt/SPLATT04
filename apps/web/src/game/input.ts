import { MarkerId } from '@splat04/shared';

export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  firing: boolean;
  boostPressed: boolean;
  selectedMarker: MarkerId;
}

export interface StickState {
  active: boolean;
  x: number;
  z: number;
  originX: number;
  originY: number;
  pointerId: number;
}

const STICK_RADIUS = 54;

/**
 * Collects keyboard/mouse and touch into one input snapshot per frame.
 *
 * Also suppresses scrolling, text selection and the context menu while gameplay
 * controls are engaged — without this the page fights the player on both platforms.
 */
export class InputController {
  private keys = new Set<string>();
  private mouseDown = false;
  /** Mouse position projected onto the ground plane, in world units. Written by the scene. */
  groundX = 0;
  groundZ = 0;
  /** Normalised aim direction derived from `groundX/groundZ` each frame. */
  aimWorldX = 1;
  aimWorldZ = 0;
  private boostLatch = false;

  readonly moveStick: StickState = {
    active: false,
    x: 0,
    z: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  };
  readonly aimStick: StickState = {
    active: false,
    x: 1,
    z: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  };
  touchBoost = false;
  marker: MarkerId = 'compressor';
  enabled = true;

  private listeners: Array<() => void> = [];

  attach(target: HTMLElement): void {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.enabled) return;
      this.keys.add(event.code);
      // Space and arrows scroll the page by default; gameplay needs them.
      if (GAMEPLAY_KEYS.has(event.code)) event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
      if (event.code === 'Space') this.boostLatch = false;
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!this.enabled || event.button !== 0) return;
      this.mouseDown = true;
    };
    const onMouseUp = () => {
      this.mouseDown = false;
    };
    const onContextMenu = (event: MouseEvent) => {
      if (this.enabled) event.preventDefault();
    };
    const onBlur = () => {
      // Losing focus mid-input would otherwise leave a key stuck down forever.
      this.releaseAll();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (this.enabled && (this.moveStick.active || this.aimStick.active)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    target.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    this.listeners = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => target.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => target.removeEventListener('contextmenu', onContextMenu),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('visibilitychange', onBlur),
      () => window.removeEventListener('touchmove', onTouchMove),
    ];
  }

  detach(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.releaseAll();
  }

  releaseAll(): void {
    this.keys.clear();
    this.mouseDown = false;
    this.touchBoost = false;
    this.moveStick.active = false;
    this.moveStick.x = 0;
    this.moveStick.z = 0;
    this.moveStick.pointerId = -1;
    this.aimStick.active = false;
    this.aimStick.pointerId = -1;
  }

  // --- virtual sticks ------------------------------------------------------

  beginStick(stick: StickState, pointerId: number, clientX: number, clientY: number): void {
    stick.active = true;
    stick.pointerId = pointerId;
    stick.originX = clientX;
    stick.originY = clientY;
    stick.x = 0;
    stick.z = 0;
  }

  moveStickTo(stick: StickState, clientX: number, clientY: number): void {
    const dx = clientX - stick.originX;
    const dy = clientY - stick.originY;
    const length = Math.hypot(dx, dy);
    const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    stick.x = (dx * scale) / STICK_RADIUS;
    stick.z = (dy * scale) / STICK_RADIUS;
  }

  endStick(stick: StickState): void {
    stick.active = false;
    stick.pointerId = -1;
    stick.x = 0;
    stick.z = 0;
  }

  // --- per-frame snapshot --------------------------------------------------

  sample(): InputSnapshot {
    let moveX = 0;
    let moveZ = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;

    if (this.moveStick.active) {
      moveX = this.moveStick.x;
      moveZ = this.moveStick.z;
    }

    let aimX = this.aimWorldX;
    let aimZ = this.aimWorldZ;
    let firing = this.mouseDown;

    if (this.aimStick.active) {
      const length = Math.hypot(this.aimStick.x, this.aimStick.z);
      if (length > 0.25) {
        aimX = this.aimStick.x / length;
        aimZ = this.aimStick.z / length;
        // Auto-fire while the right stick is engaged in a valid direction.
        firing = true;
      }
    }

    const spacePressed = this.keys.has('Space');
    const boostPressed = (spacePressed && !this.boostLatch) || this.touchBoost;
    if (spacePressed) this.boostLatch = true;
    this.touchBoost = false;

    return {
      moveX,
      moveZ,
      aimX,
      aimZ,
      firing,
      boostPressed,
      selectedMarker: this.marker,
    };
  }
}

const GAMEPLAY_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

/**
 * Whether to show the on-screen sticks.
 *
 * Real touch capability is the main signal, but a coarse pointer or a phone-sized
 * viewport counts too — that is what makes the controls appear in a desktop browser's
 * responsive/device mode. `?touch=1` forces them on for testing on any device.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('touch') === '1') return true;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const phoneSized = window.innerWidth <= 820;
  return hasTouch || coarsePointer || phoneSized;
}
