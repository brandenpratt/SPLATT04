import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PlayerInput,
  aimDirectionTo,
  clampAimDistance,
  isMuzzleBlocked,
  stepPlayer,
} from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { InputController } from '../game/input.js';
import { LocalGame } from '../game/localgame.js';
import { NetClient } from '../game/net.js';
import { Settings } from '../game/storage.js';
import { CameraMode } from '../game/camera.js';
import { Arena } from './Arena.js';
import { CameraRig } from './CameraRig.js';
import { PaintFloor } from './PaintFloor.js';
import { Players } from './Players.js';
import { Projectiles } from './Projectiles.js';
import { Scenery } from './Scenery.js';
import { TargetDummies } from './TargetDummies.js';
import { ViewModel } from './ViewModel.js';
import {
  configureViceEstateRenderer,
  VICE_ESTATE_CAMERA_FAR,
  ViceEstateEnvironment,
  ViceEstateLighting,
} from './ViceEstateEnvironment.js';
import { ViceEstateVisualLayer, type ViceEstateVisualStatus } from './ViceEstateVisualLayer.js';
import { resolveViceEstateRendererMode, type ViceEstateRendererMode } from './viceEstateMode.js';
import { resolveViceEstateInitialYaw } from './viceEstateVisual.js';

export interface SceneProps {
  world: GameWorld;
  input: InputController;
  net: NetClient | null;
  local: LocalGame | null;
  settings: Settings;
  quality: 'low' | 'high';
  cameraMode: CameraMode;
  onQualitySample?: (fps: number) => void;
  onFire?: () => void;
  onBoost?: () => void;
  onVisualStatus?: (status: ViceEstateVisualStatus) => void;
}

export function GameScene(props: SceneProps) {
  const dpr = useMemo<[number, number]>(
    // Cap device pixel ratio — a 3x phone display is not worth 9x the fragments.
    () => (props.quality === 'low' ? [1, 1] : [1, Math.min(2, window.devicePixelRatio || 1)]),
    [props.quality],
  );
  const requestedRendererMode = useMemo(resolveViceEstateRendererMode, []);
  const [rendererMode, setRendererMode] = useState<ViceEstateRendererMode>(requestedRendererMode);

  const handleVisualStatus = useCallback(
    (status: ViceEstateVisualStatus) => {
      // A critical GLB failure must not blank or deadlock production gameplay.
      if (status === 'error') {
        setRendererMode('legacy');
        props.onVisualStatus?.('gltf-failed-legacy');
        return;
      }
      props.onVisualStatus?.(status);
    },
    [props.onVisualStatus],
  );

  useEffect(() => {
    if (requestedRendererMode === 'legacy') props.onVisualStatus?.('legacy-ready');
  }, [props.onVisualStatus, requestedRendererMode]);

  return (
    <Canvas
      dpr={dpr}
      shadows={props.quality === 'high'}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{
        fov: 70,
        near: 0.12,
        far: VICE_ESTATE_CAMERA_FAR,
        position: [0, 3, 6],
      }}
      onCreated={({ gl, scene }) => configureViceEstateRenderer(gl, scene)}
    >
      <SceneContents {...props} rendererMode={rendererMode} onVisualStatus={handleVisualStatus} />
    </Canvas>
  );
}

interface SceneContentsProps extends SceneProps {
  rendererMode: ViceEstateRendererMode;
  onVisualStatus: (status: ViceEstateVisualStatus) => void;
}

function SceneContents({
  world,
  input,
  net,
  local,
  settings,
  quality,
  cameraMode,
  onQualitySample,
  onFire,
  onBoost,
  rendererMode,
  onVisualStatus,
}: SceneContentsProps) {
  const cameraTarget = useCallback(() => world.local, [world]);

  return (
    <>
      <ViceEstateEnvironment />
      <ViceEstateLighting quality={quality} />
      {rendererMode === 'gltf' && <InitialEstateAim world={world} input={input} />}
      <CameraRig
        world={world}
        input={input}
        mode={cameraMode}
        reducedMotion={settings.reducedMotion}
      />
      <CrosshairAim world={world} input={input} cameraMode={cameraMode} />
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
      {rendererMode === 'legacy' ? (
        <>
          <Arena quality={quality} />
          <Scenery quality={quality} />
        </>
      ) : (
        <ViceEstateVisualLayer
          purpose="gameplay"
          quality={quality}
          cameraTarget={cameraTarget}
          onReadiness={onVisualStatus}
        />
      )}
      <Players world={world} quality={quality} cameraMode={cameraMode} />
      <Projectiles world={world} />
      <ViewModel
        world={world}
        visible={cameraMode === 'first'}
        reducedMotion={settings.reducedMotion}
      />
      {local?.kind === 'range' && <TargetDummies game={local} />}
    </>
  );
}

/** Aim once per game mode down the open fountain lane; respawns keep the chosen view. */
function InitialEstateAim({ world, input }: { world: GameWorld; input: InputController }) {
  const aimedMode = useRef<GameWorld['mode'] | null>(null);

  useFrame(() => {
    if (aimedMode.current === world.mode) return;
    aimedMode.current = world.mode;
    input.yaw = resolveViceEstateInitialYaw(world.local.x, world.local.z);
  });

  return null;
}

/**
 * Resolves the crosshair into a world aim point.
 *
 * A ray is cast from the camera through the centre of the screen (or through the cursor,
 * for the overhead debug camera) and intersected with the ground plane. The player then
 * shoots from their own muzzle toward that point — which is what stops a third-person
 * camera peeking around a corner from turning into a shot around that corner.
 */
function CrosshairAim({
  world,
  input,
  cameraMode,
}: {
  world: GameWorld;
  input: InputController;
  cameraMode: CameraMode;
}) {
  const { camera, gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const screenPoint = useRef(new THREE.Vector2(0, 0));
  const hit = useRef(new THREE.Vector3());

  useEffect(() => {
    // The overhead debug camera keeps cursor aiming; the playable cameras use the centre.
    const element = gl.domElement;
    const onMove = (event: PointerEvent) => {
      if (cameraMode !== 'overhead' || event.pointerType === 'touch') return;
      const rect = element.getBoundingClientRect();
      screenPoint.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      screenPoint.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl, cameraMode]);

  useFrame(() => {
    const local = world.local;
    const point = cameraMode === 'overhead' ? screenPoint.current : CENTRE;
    raycaster.setFromCamera(point, camera);

    let aimPoint: { x: number; z: number };
    if (raycaster.ray.intersectPlane(plane, hit.current)) {
      aimPoint = clampAimDistance(local, { x: hit.current.x, z: hit.current.z });
    } else {
      // Aiming at or above the horizon: project the camera's forward vector instead, so
      // the shot still goes where the player is looking.
      const forward = raycaster.ray.direction;
      const length = Math.hypot(forward.x, forward.z) || 1;
      aimPoint = { x: local.x + (forward.x / length) * 30, z: local.z + (forward.z / length) * 30 };
    }

    input.groundX = aimPoint.x;
    input.groundZ = aimPoint.z;

    const direction = aimDirectionTo(local, aimPoint);
    input.aimWorldX = direction.x;
    input.aimWorldZ = direction.z;
    // Purely advisory: the server decides whether the paintball reaches anything.
    world.muzzleBlocked = isMuzzleBlocked(local, aimPoint);
  });

  return null;
}

const CENTRE = new THREE.Vector2(0, 0);

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
}: Omit<SceneProps, 'quality' | 'cameraMode'>) {
  const fpsWindow = useRef<{ frames: number; since: number }>({ frames: 0, since: 0 });
  const wasFiring = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    const nowLocal = Date.now();
    const localPlayer = world.local;

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
    //
    // Only sample while the document is actually visible. A backgrounded or occluded tab
    // has its animation frames throttled to a couple of hertz, and treating that as a
    // genuine frame rate would permanently latch the game into low quality.
    if (onQualitySample) {
      const sampler = fpsWindow.current;
      if (typeof document !== 'undefined' && document.hidden) {
        sampler.frames = 0;
        sampler.since = nowLocal;
      } else {
        if (sampler.since === 0) sampler.since = nowLocal;
        sampler.frames++;
        if (nowLocal - sampler.since >= 2000) {
          onQualitySample((sampler.frames * 1000) / (nowLocal - sampler.since));
          sampler.frames = 0;
          sampler.since = nowLocal;
        }
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
