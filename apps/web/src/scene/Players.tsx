import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TeamId } from '@splat04/shared';
import { GameWorld, RenderPlayer } from '../game/world.js';
import { PALETTE, createGeometries, createMaterials, disposeAll } from './materials.js';

/**
 * Chunky low-poly paintballers assembled from primitives and animated with rigless
 * transforms — bob while moving, lean into a boost, recoil on fire, squash into a
 * paint burst when tagged. No skeletal rig, which keeps the scope honest.
 */
export function Players({ world, quality }: { world: GameWorld; quality: 'low' | 'high' }) {
  const g = useMemo(createGeometries, []);
  const m = useMemo(createMaterials, []);
  const teamMaterials = useMemo(
    () => ({
      [TeamId.Cyan]: new THREE.MeshStandardMaterial({
        color: PALETTE.cyan,
        roughness: 0.3,
        emissive: new THREE.Color(PALETTE.cyan),
        emissiveIntensity: 0.18,
      }),
      [TeamId.Magenta]: new THREE.MeshStandardMaterial({
        color: PALETTE.magenta,
        roughness: 0.3,
        emissive: new THREE.Color(PALETTE.magenta),
        emissiveIntensity: 0.18,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      disposeAll(g as unknown as Record<string, { dispose(): void }>);
      disposeAll(m as unknown as Record<string, { dispose(): void }>);
      teamMaterials[TeamId.Cyan].dispose();
      teamMaterials[TeamId.Magenta].dispose();
    },
    [g, m, teamMaterials],
  );

  const ids = useLivePlayerIds(world);

  return (
    <group>
      {ids.map((id) => (
        <Paintballer
          key={id}
          id={id}
          world={world}
          g={g}
          m={m}
          teamMaterials={teamMaterials}
          quality={quality}
        />
      ))}
    </group>
  );
}

/**
 * The roster changes rarely (joins, leaves, team swaps), so it is the one piece of
 * game state that is allowed to drive React re-renders.
 */
function useLivePlayerIds(world: GameWorld): string[] {
  const [ids, setIds] = useState<string[]>([]);
  const signature = useRef('');

  useFrame(() => {
    const next = Array.from(world.players.keys()).sort().join('|');
    if (next !== signature.current) {
      signature.current = next;
      setIds(next.length > 0 ? next.split('|') : []);
    }
  });

  return ids;
}

interface PaintballerProps {
  id: string;
  world: GameWorld;
  g: ReturnType<typeof createGeometries>;
  m: ReturnType<typeof createMaterials>;
  teamMaterials: Record<TeamId, THREE.MeshStandardMaterial>;
  quality: 'low' | 'high';
}

function Paintballer({ id, world, g, m, teamMaterials, quality }: PaintballerProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Mesh>(null);
  const legs = useRef<THREE.Group>(null);

  useFrame(() => {
    const player = world.players.get(id);
    if (!player || !root.current) return;

    root.current.visible = true;
    root.current.position.set(player.x, 0, player.z);
    // Fixed world orientation for the camera; the character faces its aim.
    root.current.rotation.y = Math.atan2(player.aimX, player.aimZ);

    const splatting = player.splatBurst > 0;
    if (body.current) {
      body.current.visible = player.alive;
      const bob = Math.sin(player.bob) * 0.07;
      body.current.position.y = bob;
      body.current.rotation.x = player.lean * 0.5;
      body.current.rotation.z = Math.sin(player.bob * 0.5) * 0.04;
    }
    if (legs.current) {
      // Exaggerated skating stride.
      legs.current.rotation.x = Math.sin(player.bob) * 0.5;
    }
    if (marker.current) {
      marker.current.position.z = 0.55 - player.recoil * 0.22;
      marker.current.rotation.x = player.recoil * 0.35;
    }
    if (burst.current) {
      burst.current.visible = splatting;
      if (splatting) {
        const t = 1 - player.splatBurst;
        const scale = 0.6 + t * 3.4;
        burst.current.scale.set(scale, scale * 0.35, scale);
        (burst.current.material as THREE.MeshBasicMaterial).opacity = player.splatBurst * 0.75;
      }
    }
  });

  const player = world.players.get(id);
  const team = player?.team ?? TeamId.Cyan;
  const teamMaterial = teamMaterials[team];
  const shadow = quality === 'high';

  return (
    <group ref={root}>
      {/* Cheap blob shadow — far less expensive than a real shadow map per player. */}
      <mesh
        geometry={g.circle}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        scale={[0.95, 0.95, 1]}
      >
        <meshBasicMaterial color="#000000" transparent opacity={0.26} depthWrite={false} />
      </mesh>

      {/*
        Team ring on the ground. At this camera distance a coloured torso is only a few
        pixels, so the ring — plus the pip below — is what actually makes teams readable.
      */}
      <mesh
        geometry={g.ring}
        material={teamMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        scale={[1.15, 1.15, 1]}
      />
      {/* Motif, not colour alone: Cyan gets a forward wedge, Magenta a dot. */}
      <mesh
        geometry={team === TeamId.Cyan ? g.cone : g.circle}
        material={teamMaterial}
        rotation={team === TeamId.Cyan ? [Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, 0]}
        position={[0, 0.06, team === TeamId.Cyan ? -1.35 : -1.3]}
        scale={team === TeamId.Cyan ? [0.34, 0.55, 0.34] : [0.26, 0.26, 1]}
      />

      <group ref={body} scale={1.3}>
        {/* Legs / boots */}
        <group ref={legs} position={[0, 0.42, 0]}>
          <mesh
            geometry={g.box}
            material={m.blackVinyl}
            scale={[0.3, 0.5, 0.34]}
            position={[-0.2, -0.2, 0]}
          />
          <mesh
            geometry={g.box}
            material={m.blackVinyl}
            scale={[0.3, 0.5, 0.34]}
            position={[0.2, -0.2, 0]}
          />
          <mesh
            geometry={g.box}
            material={m.chrome}
            scale={[0.34, 0.14, 0.46]}
            position={[-0.2, -0.44, 0.06]}
          />
          <mesh
            geometry={g.box}
            material={m.chrome}
            scale={[0.34, 0.14, 0.46]}
            position={[0.2, -0.44, 0.06]}
          />
        </group>

        {/* Chunky chest armour in team colour */}
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.86, 0.66, 0.62]}
          position={[0, 1.0, 0]}
          castShadow={shadow}
        />
        <mesh
          geometry={g.box}
          material={m.whiteVinyl}
          scale={[0.94, 0.14, 0.68]}
          position={[0, 1.34, 0]}
        />
        {/* Shoulders also carry team colour — they are the widest part seen from above. */}
        <mesh
          geometry={g.lowSphere}
          material={teamMaterial}
          scale={[0.3, 0.27, 0.3]}
          position={[-0.52, 1.2, 0]}
        />
        <mesh
          geometry={g.lowSphere}
          material={teamMaterial}
          scale={[0.3, 0.27, 0.3]}
          position={[0.52, 1.2, 0]}
        />

        {/* Head + large visor */}
        <mesh
          geometry={g.lowSphere}
          material={m.whiteVinyl}
          scale={[0.34, 0.34, 0.34]}
          position={[0, 1.62, 0]}
          castShadow={shadow}
        />
        <mesh
          geometry={g.lowSphere}
          material={teamMaterial}
          scale={[0.28, 0.16, 0.28]}
          position={[0, 1.78, -0.04]}
        />
        <mesh
          geometry={g.lowSphere}
          material={m.aquaPlastic}
          scale={[0.3, 0.22, 0.3]}
          position={[0, 1.6, 0.16]}
        />

        {/* Oversized gloves */}
        <mesh
          geometry={g.lowSphere}
          material={m.whiteVinyl}
          scale={[0.19, 0.19, 0.19]}
          position={[-0.44, 0.86, 0.34]}
        />
        <mesh
          geometry={g.lowSphere}
          material={m.whiteVinyl}
          scale={[0.19, 0.19, 0.19]}
          position={[0.44, 0.86, 0.34]}
        />

        {/* Compact paint marker */}
        <group ref={marker} position={[0.26, 0.95, 0.55]}>
          <mesh geometry={g.box} material={m.blackVinyl} scale={[0.16, 0.16, 0.72]} />
          <mesh
            geometry={g.cylinder}
            material={teamMaterial}
            scale={[0.11, 0.16, 0.11]}
            position={[0, 0.16, -0.12]}
          />
          <mesh
            geometry={g.box}
            material={m.chrome}
            scale={[0.1, 0.1, 0.18]}
            position={[0, 0, 0.44]}
          />
        </group>
      </group>

      {/* Paint burst on tag */}
      <mesh ref={burst} geometry={g.lowSphere} position={[0, 0.6, 0]} visible={false}>
        <meshBasicMaterial
          color={team === TeamId.Cyan ? PALETTE.cyan : PALETTE.magenta}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export type { RenderPlayer };
