import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TeamId } from '@splat04/shared';
import { GameWorld, RenderPlayer } from '../game/world.js';
import { PALETTE, createGeometries, createMaterials, disposeAll } from './materials.js';
import { CameraMode } from '../game/camera.js';

/**
 * Chunky low-poly paintballers assembled from primitives and animated with rigless
 * transforms — bob while moving, lean into a boost, recoil on fire, squash into a
 * paint burst when tagged. No skeletal rig, which keeps the scope honest.
 */
export function Players({
  world,
  quality,
  cameraMode,
}: {
  world: GameWorld;
  quality: 'low' | 'high';
  cameraMode: CameraMode;
}) {
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
          isLocal={id === world.localId}
          cameraMode={cameraMode}
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
  isLocal: boolean;
  cameraMode: CameraMode;
}

function Paintballer({
  id,
  world,
  g,
  m,
  teamMaterials,
  quality,
  isLocal,
  cameraMode,
}: PaintballerProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Mesh>(null);
  const legs = useRef<THREE.Group>(null);
  const markers = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const player = world.players.get(id);
    if (!player || !root.current) return;

    root.current.visible = true;
    root.current.position.set(player.x, 0, player.z);
    // Every character — local and remote — faces the aim direction the server reports,
    // so what you see is genuinely where that player is pointing.
    root.current.rotation.y = Math.atan2(player.aimX, player.aimZ);

    const splatting = player.splatBurst > 0;
    // The local player's own body is hidden in first person — the camera sits inside it.
    const hideSelf = isLocal && cameraMode === 'first';
    if (markers.current) markers.current.visible = player.alive && !hideSelf;
    if (body.current) {
      body.current.visible = player.alive && !hideSelf;
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
    if (shield.current) {
      shield.current.visible = player.shielded && player.alive && !hideSelf;
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
      {/*
        Ground markers travel with the body: hidden while splatted, so a respawning
        player leaves no ownerless ring behind.
      */}
      <group ref={markers}>
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
          Team ring. At this camera distance a coloured torso is only a few pixels, so the
          ring — plus the pip below — is what actually makes teams readable.
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
      </group>

      {/*
        Protective sporting equipment, not block-toy anatomy: small helmeted head with a
        dark mirrored visor, angular shoulder plates, a slim torso, separated upper and
        lower arms gripping the marker two-handed, knee pads, boots and an air tank.
        Roughly 1.85m tall so the shoulder camera frames it at the intended 20-25%.
      */}
      <group ref={body}>
        {/* Boots and lower legs */}
        <group ref={legs} position={[0, 0.46, 0]}>
          <mesh
            geometry={g.box}
            material={m.graphite}
            scale={[0.21, 0.46, 0.22]}
            position={[-0.16, -0.22, 0]}
          />
          <mesh
            geometry={g.box}
            material={m.graphite}
            scale={[0.21, 0.46, 0.22]}
            position={[0.16, -0.22, 0]}
          />
          {/* Knee pads */}
          <mesh
            geometry={g.box}
            material={m.blackVinyl}
            scale={[0.23, 0.13, 0.09]}
            position={[-0.16, -0.06, 0.11]}
          />
          <mesh
            geometry={g.box}
            material={m.blackVinyl}
            scale={[0.23, 0.13, 0.09]}
            position={[0.16, -0.06, 0.11]}
          />
          {/* Boots */}
          <mesh
            geometry={g.box}
            material={m.vinylBoot}
            scale={[0.24, 0.14, 0.34]}
            position={[-0.16, -0.46, 0.05]}
          />
          <mesh
            geometry={g.box}
            material={m.vinylBoot}
            scale={[0.24, 0.14, 0.34]}
            position={[0.16, -0.46, 0.05]}
          />
        </group>

        {/* Hips and slim torso */}
        <mesh
          geometry={g.box}
          material={m.graphite}
          scale={[0.38, 0.18, 0.26]}
          position={[0, 0.78, 0]}
        />
        <mesh
          geometry={g.box}
          material={m.torsoShell}
          scale={[0.44, 0.5, 0.3]}
          position={[0, 1.1, 0]}
          castShadow={shadow}
        />
        {/* Team chest and back panels — the recognition surfaces. */}
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.3, 0.26, 0.02]}
          position={[0, 1.14, 0.16]}
        />
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.34, 0.3, 0.02]}
          position={[0, 1.14, -0.16]}
        />

        {/* Angular shoulder protection */}
        <mesh
          geometry={g.box}
          material={m.blackVinyl}
          scale={[0.2, 0.17, 0.28]}
          position={[-0.3, 1.3, 0]}
          rotation={[0, 0, 0.32]}
          castShadow={shadow}
        />
        <mesh
          geometry={g.box}
          material={m.blackVinyl}
          scale={[0.2, 0.17, 0.28]}
          position={[0.3, 1.3, 0]}
          rotation={[0, 0, -0.32]}
          castShadow={shadow}
        />
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.21, 0.04, 0.29]}
          position={[-0.3, 1.37, 0]}
          rotation={[0, 0, 0.32]}
        />
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.21, 0.04, 0.29]}
          position={[0.3, 1.37, 0]}
          rotation={[0, 0, -0.32]}
        />

        {/* Compressed-air tank on the back */}
        <mesh
          geometry={g.cylinder}
          material={m.chrome}
          scale={[0.09, 0.16, 0.09]}
          position={[0, 1.06, -0.2]}
          rotation={[0.16, 0, 0]}
        />

        {/* Upper and lower arms, both hands on the marker */}
        <mesh
          geometry={g.box}
          material={m.graphite}
          scale={[0.13, 0.26, 0.13]}
          position={[-0.29, 1.08, 0.04]}
          rotation={[0.5, 0, 0.1]}
        />
        <mesh
          geometry={g.box}
          material={m.graphite}
          scale={[0.12, 0.24, 0.12]}
          position={[-0.24, 0.94, 0.26]}
          rotation={[1.15, 0, 0.05]}
        />
        <mesh
          geometry={g.box}
          material={m.graphite}
          scale={[0.13, 0.26, 0.13]}
          position={[0.29, 1.08, 0.04]}
          rotation={[0.7, 0, -0.1]}
        />
        <mesh
          geometry={g.box}
          material={m.graphite}
          scale={[0.12, 0.24, 0.12]}
          position={[0.22, 0.92, 0.3]}
          rotation={[1.25, 0, -0.05]}
        />
        {/* Gloves */}
        <mesh
          geometry={g.box}
          material={m.blackVinyl}
          scale={[0.13, 0.12, 0.14]}
          position={[-0.2, 0.9, 0.4]}
        />
        <mesh
          geometry={g.box}
          material={m.blackVinyl}
          scale={[0.13, 0.12, 0.14]}
          position={[0.18, 0.88, 0.44]}
        />

        {/* Small helmeted head with a dark mirrored visor */}
        <mesh
          geometry={g.lowSphere}
          material={m.helmet}
          scale={[0.17, 0.19, 0.19]}
          position={[0, 1.55, 0]}
          castShadow={shadow}
        />
        <mesh
          geometry={g.box}
          material={m.helmet}
          scale={[0.3, 0.09, 0.28]}
          position={[0, 1.63, -0.01]}
        />
        <mesh
          geometry={g.lowSphere}
          material={m.visor}
          scale={[0.155, 0.1, 0.16]}
          position={[0, 1.53, 0.08]}
        />
        {/* Thin team light strip across the helmet crown. */}
        <mesh
          geometry={g.box}
          material={teamMaterial}
          scale={[0.05, 0.02, 0.2]}
          position={[0, 1.71, -0.01]}
        />

        {/* Compact paint marker, held forward in both hands */}
        <group ref={marker} position={[0.02, 0.92, 0.5]}>
          <mesh geometry={g.box} material={m.blackVinyl} scale={[0.09, 0.1, 0.5]} />
          <mesh
            geometry={g.cylinder}
            material={m.chrome}
            scale={[0.05, 0.1, 0.05]}
            position={[0, 0.11, -0.08]}
          />
          <mesh
            geometry={g.box}
            material={m.chrome}
            scale={[0.055, 0.055, 0.16]}
            position={[0, 0, 0.31]}
          />
          <mesh
            geometry={g.box}
            material={teamMaterial}
            scale={[0.095, 0.03, 0.14]}
            position={[0, 0.06, 0.04]}
          />
          {/* Hopper */}
          <mesh
            geometry={g.lowSphere}
            material={m.graphite}
            scale={[0.08, 0.08, 0.1]}
            position={[0, 0.14, 0.02]}
          />
        </group>
      </group>

      {/* Spawn shield bubble: visible protection, so nobody wonders why shots do nothing. */}
      <mesh ref={shield} geometry={g.lowSphere} position={[0, 1.0, 0]} scale={1.35} visible={false}>
        <meshBasicMaterial
          color={team === TeamId.Cyan ? PALETTE.cyan : PALETTE.magenta}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>

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
