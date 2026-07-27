import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_HALF_DEPTH, ARENA_HALF_WIDTH } from '@splat04/shared';
import { GameWorld } from '../game/world.js';

const FOLLOW_HEIGHT = 26;
const FOLLOW_BACK = 22;
const AIM_LEAD = 5.5;
const BOOST_PULLBACK = 5;

/**
 * An elevated three-quarter sports camera: roughly 45 degrees down, fixed world
 * orientation so the arena stays readable, leading slightly toward the player's aim and
 * pulling out during a boost. Never first-person.
 *
 * During intermission it lifts into an attract-mode view of the whole painted map.
 */
export function CameraRig({ world, reducedMotion }: { world: GameWorld; reducedMotion: boolean }) {
  const camera = useThree((state) => state.camera);
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const current = useRef(new THREE.Vector3(0, FOLLOW_HEIGHT, FOLLOW_BACK));
  const lookAt = useRef(new THREE.Vector3());
  const attract = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta);
    const local = world.local;
    const intermission = world.phase === 'intermission';

    // Ease between follow-cam and the full-map attract view.
    attract.current += ((intermission ? 1 : 0) - attract.current) * Math.min(1, dt * 2.2);
    const blend = reducedMotion ? Math.round(attract.current) : attract.current;

    const boosting = world.now() < local.boostUntil;
    const pullback = reducedMotion ? 0 : boosting ? BOOST_PULLBACK : 0;

    // Follow position, leading toward where the player is aiming.
    const leadX = local.aimX * AIM_LEAD;
    const leadZ = local.aimZ * AIM_LEAD;
    target.current.set(local.x + leadX * 0.5, 0, local.z + leadZ * 0.5);

    const followX = local.x + leadX * 0.35;
    const followY = FOLLOW_HEIGHT + pullback;
    const followZ = local.z + FOLLOW_BACK + pullback * 0.7;

    // Attract view: high and centred, showing the whole painted arena.
    const attractY = 78;
    const attractZ = ARENA_HALF_DEPTH + 30;

    const desiredX = THREE.MathUtils.lerp(followX, 0, blend);
    const desiredY = THREE.MathUtils.lerp(followY, attractY, blend);
    const desiredZ = THREE.MathUtils.lerp(followZ, attractZ, blend);

    // Keep the camera inside sensible bounds so it never drifts past the scenery.
    const clampedX = THREE.MathUtils.clamp(desiredX, -ARENA_HALF_WIDTH - 6, ARENA_HALF_WIDTH + 6);

    const smoothing = reducedMotion ? 1 : Math.min(1, dt * 6.5);
    current.current.x += (clampedX - current.current.x) * smoothing;
    current.current.y += (desiredY - current.current.y) * smoothing;
    current.current.z += (desiredZ - current.current.z) * smoothing;
    camera.position.copy(current.current);

    const lookX = THREE.MathUtils.lerp(target.current.x, 0, blend);
    const lookZ = THREE.MathUtils.lerp(target.current.z, 0, blend);
    lookAt.current.x += (lookX - lookAt.current.x) * smoothing;
    lookAt.current.z += (lookZ - lookAt.current.z) * smoothing;
    camera.lookAt(lookAt.current.x, 0, lookAt.current.z);
  });

  return null;
}
