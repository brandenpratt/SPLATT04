import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TeamId, isBlocked } from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { PALETTE } from './materials.js';

/**
 * First-person marker view model.
 *
 * Parented to the camera so it tracks the view exactly, offset down and to the right so
 * it never covers the crosshair, tinted with the team colour, and kicked slightly on
 * fire. It lowers and fades as the muzzle approaches cover rather than clipping through
 * a wall.
 */
export function ViewModel({
  world,
  visible,
  reducedMotion,
}: {
  world: GameWorld;
  visible: boolean;
  reducedMotion: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const group = useRef<THREE.Group>(null);
  const kick = useRef(0);
  const lastFireAt = useRef(0);
  const stow = useRef(0);

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const bodyMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.vinylBlack, roughness: 0.35 }),
    [],
  );
  const chromeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: PALETTE.chrome, roughness: 0.18, metalness: 0.9 }),
    [],
  );
  const teamMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.cyan, roughness: 0.3 }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      bodyMaterial.dispose();
      chromeMaterial.dispose();
      teamMaterial.dispose();
    },
    [geometry, bodyMaterial, chromeMaterial, teamMaterial],
  );

  // Attach to the camera so the model inherits the view transform directly.
  useEffect(() => {
    const node = group.current;
    if (!node) return;
    camera.add(node);
    return () => {
      camera.remove(node);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    node.visible = visible && world.local.alive;
    if (!node.visible) return;

    teamMaterial.color.set(world.localTeam === TeamId.Cyan ? PALETTE.cyan : PALETTE.magenta);

    // Recoil: a short kick when a new shot goes out.
    if (world.lastShotAt > lastFireAt.current) {
      lastFireAt.current = world.lastShotAt;
      kick.current = reducedMotion ? 0.35 : 1;
    }
    kick.current = Math.max(0, kick.current - delta * 7);

    // Stow the marker when the muzzle is about to be inside geometry.
    const local = world.local;
    const ahead = 0.9;
    const nose = {
      x: local.x + local.aimX * ahead,
      z: local.z + local.aimZ * ahead,
    };
    const crowded = isBlocked(nose.x, nose.z, 0.1);
    stow.current += ((crowded ? 1 : 0) - stow.current) * Math.min(1, delta * 12);

    // Offset right and down from the eye; never across the centre of the screen.
    node.position.set(0.28, -0.24 - stow.current * 0.32, -0.58 + kick.current * 0.1);
    node.rotation.set(kick.current * 0.22, -0.06, 0);
    node.scale.setScalar(1 - stow.current * 0.15);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={bodyMaterial} scale={[0.09, 0.09, 0.42]} />
      <mesh
        geometry={geometry}
        material={teamMaterial}
        scale={[0.07, 0.1, 0.09]}
        position={[0, 0.08, 0.08]}
      />
      <mesh
        geometry={geometry}
        material={chromeMaterial}
        scale={[0.055, 0.055, 0.13]}
        position={[0, 0, -0.26]}
      />
      <mesh
        geometry={geometry}
        material={bodyMaterial}
        scale={[0.07, 0.16, 0.08]}
        position={[0, -0.1, 0.14]}
        rotation={[0.25, 0, 0]}
      />
    </group>
  );
}
