import { MarkerId } from '@splat04/shared';
import { PITCH_MAX, PITCH_MIN } from './camera.js';

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
  /** World aim point resolved from the camera crosshair each frame, written by the scene. */
  groundX = 0;
  groundZ = 0;
  /** Normalised aim direction derived from the aim point each frame. */
  aimWorldX = 1;
  aimWorldZ = 0;

  /**
   * Mouse-look state. Yaw is the direction the player faces; pitch only tilts the camera
   * and is folded back into the aim point by the scene's crosshair raycast.
   */
  yaw = 0;
  pitch = -0.22;
  lookSensitivity = 0.0022;
  /** True while the pointer is locked to the canvas. */
  pointerLocked = false;
  /** Set false for the overhead debug camera, which uses cursor aiming instead. */
  mouseLookEnabled = true;

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
      // Clicking the arena grabs the pointer for mouse-look.
      if (this.mouseLookEnabled && !this.pointerLocked) this.requestPointerLock(target);
    };

    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === target;
      if (!this.pointerLocked) this.mouseDown = false;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!this.enabled || !this.pointerLocked || !this.mouseLookEnabled) return;
      this.yaw -= event.movementX * this.lookSensitivity;
      this.pitch -= event.movementY * this.lookSensitivity;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
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

    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    target.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    this.listeners = [
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
      () => window.removeEventListener('mousemove', onMouseMove),
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

  /** Called when an overlay opens: gameplay must never hold the pointer hostage. */
  releasePointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.pointerLocked = false;
  }

  private requestPointerLock(target: HTMLElement): void {
    try {
      const result = target.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Pointer lock can be refused (iframes, user gesture rules). Aim still works from
      // the last known yaw, so this is never fatal.
    }
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
    // Local intent first: forward/back and strafe, relative to where the camera looks.
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;

    if (this.moveStick.active) {
      strafe = this.moveStick.x;
      forward = -this.moveStick.z;
    }

    // Rotate intent into world space. Yaw 0 faces -Z, matching the camera's forward.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    let moveX = forwardX * forward + rightX * strafe;
    let moveZ = forwardZ * forward + rightZ * strafe;
    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }

    let aimX = this.aimWorldX;
    let aimZ = this.aimWorldZ;
    let firing = this.mouseDown;

    if (this.aimStick.active) {
      const length = Math.hypot(this.aimStick.x, this.aimStick.z);
      if (length > 0.25) {
        // On touch the right stick steers the camera itself; the scene then resolves the
        // crosshair exactly as it does for a mouse, so both inputs share one aim path.
        this.yaw -= this.aimStick.x * 0.045;
        this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch - this.aimStick.z * 0.02));
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
 * Gated on genuine touch capability or a coarse pointer — a browser's responsive/device
 * mode reports both, so that is all that is needed to test on a desktop. Deliberately
 * *not* gated on viewport width: the stick zones cover most of the screen, and a narrow
 * desktop window is still driven by a mouse. `?touch=1` forces them on for testing.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('touch') === '1') return true;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return hasTouch || coarsePointer;
}
