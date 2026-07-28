import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_HALF_DEPTH, ARENA_HALF_WIDTH } from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { InputController } from '../game/input.js';
import { CAMERA_SETTINGS, CameraMode, cameraDistanceLimit } from '../game/camera.js';

interface Props {
  world: GameWorld;
  input: InputController;
  mode: CameraMode;
  reducedMotion: boolean;
}

/**
 * Three cameras behind one rig.
 *
 * `third` is a close over-the-shoulder chase camera with sphere-cast collision, `first`
 * sits at visor height, and `overhead` is the original top-down view kept purely as a
 * developer tool. Camera choice is local presentation only — it never touches the
 * authoritative aim direction, which is resolved from the crosshair in `GameScene`.
 */
export function CameraRig({ world, input, mode, reducedMotion }: Props) {
  const camera = useThree((state) => state.camera);
  const position = useRef(new THREE.Vector3(0, 3, 6));
  const lookAt = useRef(new THREE.Vector3());
  const attract = useRef(0);
  const bobPhase = useRef(0);
  const currentDistance = useRef(CAMERA_SETTINGS.third.distance);

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta);
    const local = world.local;
    const perspective = camera as THREE.PerspectiveCamera;
    const boosting = world.now() < local.boostUntil;

    // Attract view during intermission shows the whole painted map.
    const intermission = world.phase === 'intermission';
    attract.current += ((intermission ? 1 : 0) - attract.current) * Math.min(1, dt * 2.2);
    const blend = reducedMotion ? Math.round(attract.current) : attract.current;

    const yaw = input.yaw;
    const pitch = input.pitch;
    const forwardX = -Math.sin(yaw) * Math.cos(pitch);
    const forwardY = Math.sin(pitch);
    const forwardZ = -Math.cos(yaw) * Math.cos(pitch);

    if (mode === 'overhead') {
      const settings = CAMERA_SETTINGS.overhead;
      setFov(perspective, settings.fov);
      const desired = new THREE.Vector3(local.x, settings.height, local.z + settings.back);
      approach(position.current, desired, reducedMotion ? 1 : Math.min(1, dt * 6));
      camera.position.copy(position.current);
      camera.lookAt(local.x, 0, local.z);
      return;
    }

    if (mode === 'first') {
      const settings = CAMERA_SETTINGS.first;
      setFov(perspective, settings.fov);

      // Subtle bob only; disabled entirely under reduced motion.
      const speed = Math.hypot(local.vx, local.vz);
      let bob = 0;
      if (!reducedMotion && local.alive) {
        bobPhase.current += dt * settings.bobFrequency * Math.min(1, speed / 5);
        bob = Math.sin(bobPhase.current) * settings.bobAmplitude * Math.min(1, speed / 5);
      }

      const eyeY = settings.eyeHeight + bob;
      position.current.set(local.x, eyeY, local.z);
      camera.position.copy(position.current);
      camera.lookAt(local.x + forwardX, eyeY + forwardY, local.z + forwardZ);
      return;
    }

    // --- third person ------------------------------------------------------
    const settings = CAMERA_SETTINGS.third;
    setFov(perspective, THREE.MathUtils.lerp(settings.fov, 55, blend));

    const pullback = reducedMotion ? 0 : boosting ? settings.boostPullback : 0;
    const desiredDistance = settings.distance + pullback;

    // Cast backwards from the player's head to find how far the camera may sit.
    const backX = -forwardX;
    const backZ = -forwardZ;
    const backLength = Math.hypot(backX, backZ) || 1;
    const cameraHeight = settings.height + Math.sin(-pitch) * 0.8;
    const limit = cameraDistanceLimit(
      local.x,
      local.z,
      backX / backLength,
      backZ / backLength,
      desiredDistance,
      cameraHeight,
    );

    // Snap in quickly when cover intrudes, ease back out when it clears.
    const target = Math.min(desiredDistance, limit);
    const easing = target < currentDistance.current ? 1 : Math.min(1, dt * 4);
    currentDistance.current += (target - currentDistance.current) * easing;

    const shoulderX = Math.cos(yaw) * settings.shoulder;
    const shoulderZ = -Math.sin(yaw) * settings.shoulder;

    const followX = local.x + (backX / backLength) * currentDistance.current + shoulderX;
    const followZ = local.z + (backZ / backLength) * currentDistance.current + shoulderZ;
    const followY = cameraHeight;

    // Blend toward the intermission attract view.
    const desired = new THREE.Vector3(
      THREE.MathUtils.lerp(followX, 0, blend),
      THREE.MathUtils.lerp(followY, 68, blend),
      THREE.MathUtils.lerp(followZ, ARENA_HALF_DEPTH + 26, blend),
    );
    desired.x = THREE.MathUtils.clamp(desired.x, -ARENA_HALF_WIDTH - 8, ARENA_HALF_WIDTH + 8);

    approach(position.current, desired, reducedMotion ? 1 : Math.min(1, dt * 14));
    camera.position.copy(position.current);

    // Look ahead along the view, but never drop the target through the floor — that
    // pitches the whole camera down and pushes the character up into the top of frame.
    const lookY = Math.max(0.35, settings.lookHeight + forwardY * 6);
    const aimLook = new THREE.Vector3(
      THREE.MathUtils.lerp(local.x + forwardX * 8, 0, blend),
      THREE.MathUtils.lerp(lookY, 0, blend),
      THREE.MathUtils.lerp(local.z + forwardZ * 8, 0, blend),
    );
    approach(lookAt.current, aimLook, reducedMotion ? 1 : Math.min(1, dt * 16));
    camera.lookAt(lookAt.current);
  });

  return null;
}

function approach(current: THREE.Vector3, target: THREE.Vector3, t: number): void {
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
}

function setFov(camera: THREE.PerspectiveCamera, fov: number): void {
  if (Math.abs(camera.fov - fov) < 0.01) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
