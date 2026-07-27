import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TeamId } from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { PALETTE } from './materials.js';

const MAX_PROJECTILES = 160;
const MAX_SPLATS = 64;

const dummy = new THREE.Object3D();
const cyan = new THREE.Color(PALETTE.cyan);
const magenta = new THREE.Color(PALETTE.magenta);

/**
 * Two fixed-size instanced pools: paintballs in flight, and the cosmetic splats left on
 * cover. Nothing is allocated per shot, and the arena never accumulates draw calls.
 */
export function Projectiles({ world }: { world: GameWorld }) {
  const ballsRef = useRef<THREE.InstancedMesh>(null);
  const splatsRef = useRef<THREE.InstancedMesh>(null);

  const ballGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const splatGeometry = useMemo(() => new THREE.CircleGeometry(1, 10), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.25, vertexColors: true }),
    [],
  );
  const splatMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.85,
        vertexColors: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );

  useEffect(
    () => () => {
      ballGeometry.dispose();
      splatGeometry.dispose();
      material.dispose();
      splatMaterial.dispose();
    },
    [ballGeometry, splatGeometry, material, splatMaterial],
  );

  useFrame(() => {
    const balls = ballsRef.current;
    if (balls) {
      let index = 0;
      for (const projectile of world.projectiles.values()) {
        if (index >= MAX_PROJECTILES) break;
        // A shallow arc sells the throw without any of it mattering to the simulation.
        const arc = Math.sin(projectile.progress * Math.PI) * 1.15;
        dummy.position.set(projectile.x, 1.0 + arc, projectile.z);
        const squash = 1 + Math.min(0.5, Math.hypot(projectile.vx, projectile.vz) / 90);
        dummy.scale.setScalar(projectile.radius * 0.24);
        dummy.scale.z *= squash;
        dummy.rotation.set(0, Math.atan2(projectile.vx, projectile.vz), 0);
        dummy.updateMatrix();
        balls.setMatrixAt(index, dummy.matrix);
        balls.setColorAt(index, projectile.team === TeamId.Cyan ? cyan : magenta);
        index++;
      }
      // Park unused instances well out of frame rather than resizing the pool.
      dummy.position.set(0, -500, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      for (let i = index; i < MAX_PROJECTILES; i++) balls.setMatrixAt(i, dummy.matrix);

      balls.instanceMatrix.needsUpdate = true;
      if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
      balls.count = MAX_PROJECTILES;
    }

    const splats = splatsRef.current;
    if (splats) {
      const now = Date.now();
      let index = 0;
      for (const splat of world.coverSplats) {
        if (index >= MAX_SPLATS) break;
        const age = (now - splat.born) / 9000;
        // Splats sit on cover, so they are drawn as flat discs just above the floor.
        dummy.position.set(splat.x, 0.06, splat.z);
        dummy.rotation.set(-Math.PI / 2, 0, splat.scale * 7);
        dummy.scale.setScalar(splat.scale * (1 - age * 0.25));
        dummy.updateMatrix();
        splats.setMatrixAt(index, dummy.matrix);
        splats.setColorAt(index, splat.team === TeamId.Cyan ? cyan : magenta);
        index++;
      }
      dummy.position.set(0, -500, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      for (let i = index; i < MAX_SPLATS; i++) splats.setMatrixAt(i, dummy.matrix);

      splats.instanceMatrix.needsUpdate = true;
      if (splats.instanceColor) splats.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh
        ref={ballsRef}
        args={[ballGeometry, material, MAX_PROJECTILES]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={splatsRef}
        args={[splatGeometry, splatMaterial, MAX_SPLATS]}
        frustumCulled={false}
      />
    </group>
  );
}
