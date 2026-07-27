import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LocalGame } from '../game/localgame.js';
import { PALETTE } from './materials.js';

/**
 * Three inflatable targets for the boot flow. They teach movement, aim and fire by
 * being shootable within a couple of seconds — no tutorial text required.
 */
export function TargetDummies({ game }: { game: LocalGame }) {
  const group = useRef<THREE.Group>(null);

  const geometry = useMemo(() => new THREE.CapsuleGeometry(0.9, 1.5, 4, 12), []);
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(1.25, 0.16, 6, 18), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.25 }),
    [],
  );
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PALETTE.coral,
        roughness: 0.3,
        emissive: new THREE.Color(PALETTE.coral),
        emissiveIntensity: 0.3,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      ringGeometry.dispose();
      material.dispose();
      ringMaterial.dispose();
    },
    [geometry, ringGeometry, material, ringMaterial],
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    const now = Date.now();
    group.current.children.forEach((child, index) => {
      const target = game.targets[index];
      if (!target) return;
      const since = target.hit ? (now - target.hitAt) / 500 : 0;
      if (target.hit && since > 1) {
        child.visible = false;
        return;
      }
      child.visible = true;
      // A gentle inflatable wobble, then a squash-and-pop when painted.
      const wobble = Math.sin(clock.elapsedTime * 2.4 + index) * 0.09;
      const squash = target.hit ? 1 - since : 0;
      child.position.y = 1.3 + wobble;
      child.scale.set(1 + squash * 0.9, Math.max(0.05, 1 - squash), 1 + squash * 0.9);
      child.rotation.y = clock.elapsedTime * 0.8 + index;
    });
  });

  return (
    <group ref={group}>
      {game.targets.map((target) => (
        <group key={target.id} position={[target.x, 1.3, target.z]}>
          <mesh geometry={geometry} material={material} castShadow />
          <mesh
            geometry={ringGeometry}
            material={ringMaterial}
            position={[0, 0.2, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <mesh
            geometry={ringGeometry}
            material={ringMaterial}
            position={[0, -0.5, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.8}
          />
        </group>
      ))}
    </group>
  );
}
