import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerInput, stepPlayer } from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { InputController } from '../game/input.js';
import { LocalGame } from '../game/localgame.js';
import { NetClient } from '../game/net.js';
import { Settings } from '../game/storage.js';
import { Arena } from './Arena.js';
import { CameraRig } from './CameraRig.js';
import { PaintFloor } from './PaintFloor.js';
import { Players } from './Players.js';
import { Projectiles } from './Projectiles.js';
import { Scenery } from './Scenery.js';
import { TargetDummies } from './TargetDummies.js';

export interface SceneProps {
  world: GameWorld;
  input: InputController;
  net: NetClient | null;
  local: LocalGame | null;
  settings: Settings;
  quality: 'low' | 'high';
  onQualitySample?: (fps: number) => void;
  onFire?: () => void;
  onBoost?: () => void;
}

export function GameScene(props: SceneProps) {
  const dpr = useMemo<[number, number]>(
    // Cap device pixel ratio — a 3x phone display is not worth 9x the fragments.
    () => (props.quality === 'low' ? [1, 1] : [1, Math.min(2, window.devicePixelRatio || 1)]),
    [props.quality],
  );

  return (
    <Canvas
      dpr={dpr}
      shadows={props.quality === 'high'}
      gl={{ antialias: props.quality === 'high', powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.5, far: 700, position: [0, 26, 22] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#12203c');
        scene.fog = new THREE.Fog('#f0a184', 130, 420);
      }}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}

function SceneContents({
  world,
  input,
  net,
  local,
  settings,
  quality,
  onQualitySample,
  onFire,
  onBoost,
}: SceneProps) {
  return (
    <>
      <Lights quality={quality} />
      <CameraRig world={world} reducedMotion={settings.reducedMotion} />
      <GroundAim input={input} />
      <FrameDriver
        world={world}
        input={input}
        net={net}
        local={local}
        settings={settings}
        onQualitySample={onQualitySample}
        onFire={onFire}
        onBoost={onBoost}
      />

      <PaintFloor world={world} highContrast={settings.highContrast} />
      <Arena quality={quality} />
      <Scenery quality={quality} />
      <Players world={world} quality={quality} />
      <Projectiles world={world} />
      {local?.kind === 'range' && <TargetDummies game={local} />}
    </>
  );
}

/** One sun, one hemisphere fill. Shadows only on the high-quality path. */
function Lights({ quality }: { quality: 'low' | 'high' }) {
  return (
    <>
      <hemisphereLight args={['#ffd9b8', '#4a6d8c', 1.05]} />
      <directionalLight
        position={[38, 54, -26]}
        intensity={2.1}
        color="#fff1d8"
        castShadow={quality === 'high'}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-far={160}
        shadow-bias={-0.0012}
      />
      <ambientLight intensity={0.28} color="#ffd2c0" />
    </>
  );
}

/**
 * Projects the mouse onto the ground plane so desktop aim is "point at the floor",
 * exactly as a 2004 sports game would do it.
 */
function GroundAim({ input }: { input: InputController }) {
  const { camera, gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useRef(new THREE.Vector2(0, 0));
  const hit = useRef(new THREE.Vector3());
  const hasPointer = useRef(false);

  useEffect(() => {
    const element = gl.domElement;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return; // touch aims with the right stick
      const rect = element.getBoundingClientRect();
      pointer.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      hasPointer.current = true;
    };
    element.addEventListener('pointermove', onMove);
    return () => element.removeEventListener('pointermove', onMove);
  }, [gl]);

  useFrame(() => {
    if (!hasPointer.current) return;
    raycaster.setFromCamera(pointer.current, camera);
    if (raycaster.ray.intersectPlane(plane, hit.current)) {
      input.groundX = hit.current.x;
      input.groundZ = hit.current.z;
    }
  });

  return null;
}

/**
 * The single place per-frame game logic runs: sample input, step the simulation
 * (locally or through prediction), interpolate remotes, and sample FPS for auto quality.
 */
function FrameDriver({
  world,
  input,
  net,
  local,
  settings,
  onQualitySample,
  onFire,
  onBoost,
}: Omit<SceneProps, 'quality'>) {
  const fpsWindow = useRef<{ frames: number; since: number }>({ frames: 0, since: 0 });
  const wasFiring = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const nowLocal = Date.now();
    const localPlayer = world.local;

    // Aim from the mouse position on the ground plane, relative to the player.
    if (!input.aimStick.active) {
      const dx = input.groundX - localPlayer.x;
      const dz = input.groundZ - localPlayer.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.3) {
        input.aimWorldX = dx / length;
        input.aimWorldZ = dz / length;
      }
    }

    const snapshot = input.sample();
    if (snapshot.firing && !wasFiring.current) onFire?.();
    wasFiring.current = snapshot.firing;
    if (snapshot.boostPressed && world.now() >= localPlayer.boostReadyAt) onBoost?.();

    if (local) {
      const command: PlayerInput = { ...snapshot, seq: 0, clientTime: nowLocal };
      local.step(dt, command);
    } else if (net) {
      // Predict locally with the same shared rules the server runs.
      const command = net.sendInput(snapshot, nowLocal);
      stepLocalPrediction(world, command, dt);
    }

    world.interpolate(nowLocal, dt);

    // Auto-quality sampler.
    if (onQualitySample) {
      const window = fpsWindow.current;
      if (window.since === 0) window.since = nowLocal;
      window.frames++;
      if (nowLocal - window.since >= 2000) {
        onQualitySample((window.frames * 1000) / (nowLocal - window.since));
        window.frames = 0;
        window.since = nowLocal;
      }
    }
  });

  return null;
}

/** Local prediction runs the exact shared step the server will run for this input. */
function stepLocalPrediction(world: GameWorld, command: PlayerInput, dt: number): void {
  const local = world.local;
  if (!local.alive) return;
  stepPlayer(local, command, dt, { now: world.now(), sampleOwner: world.sampleOwner });
}
