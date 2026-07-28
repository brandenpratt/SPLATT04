import { useEffect, useMemo, useRef } from 'react';
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
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 70, near: 0.12, far: 700, position: [0, 3, 6] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#0a0f1a');
        // Filmic tone mapping keeps the bright Miami palette from clipping to flat white,
        // which is most of what made the old look feel like untextured plastic.
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        // Light atmospheric haze around the distant skyline, tinted to the dusk sky.
        scene.fog = new THREE.Fog('#2a2f47', 120, 420);
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
  cameraMode,
  onQualitySample,
  onFire,
  onBoost,
}: SceneProps) {
  return (
    <>
      <SunsetEnvironment />
      <Lights quality={quality} />
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
      <Arena quality={quality} />
      <Scenery quality={quality} />
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

/**
 * A procedurally generated sunset environment map.
 *
 * Chrome and glossy vinyl need something to reflect — without it they render as flat
 * shaded blobs, which is most of what made the arena look like untextured plastic. This
 * builds a small equirectangular gradient in memory and prefilters it, so there is still
 * no downloaded asset anywhere.
 */
function SunsetEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  // Developer handle for live profiling from the console.
  useEffect(() => {
    const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
      string,
      unknown
    >;
    hook.gl = gl;
    hook.scene = scene;
    (window as unknown as Record<string, unknown>).__splat04 = hook;
  }, [gl, scene]);

  useEffect(() => {
    const width = 128;
    const height = 64;
    const data = new Uint8Array(width * height * 4);

    // Kept cool and dark on purpose. This map lights *every* surface through image-based
    // lighting, so a saturated orange horizon tints the entire estate pink no matter what
    // the material colours say. Only a narrow band near the horizon stays warm.
    const sky = new THREE.Color('#141d33');
    const horizon = new THREE.Color('#4a4358');
    const warm = new THREE.Color('#a86a4a');
    const ground = new THREE.Color('#1a1d24');
    const colour = new THREE.Color();

    for (let y = 0; y < height; y++) {
      // v runs 0 at the top of the sphere to 1 at the bottom.
      const v = y / (height - 1);
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1);
        if (v < 0.5) {
          colour.copy(sky).lerp(horizon, Math.pow(v / 0.5, 3.0));
          // A narrow warm glow low in the west, nowhere near full strength.
          const glow = Math.max(0, 1 - Math.abs(u - 0.25) * 6) * Math.pow(v / 0.5, 6);
          colour.lerp(warm, glow * 0.55);
        } else {
          colour.copy(horizon).lerp(ground, Math.pow((v - 0.5) / 0.5, 0.7));
        }
        const offset = (y * width + x) * 4;
        data[offset] = Math.round(colour.r * 255);
        data[offset + 1] = Math.round(colour.g * 255);
        data[offset + 2] = Math.round(colour.b * 255);
        data[offset + 3] = 255;
      }
    }

    const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.colorSpace = THREE.SRGBColorSpace;
    source.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const environment = pmrem.fromEquirectangular(source).texture;
    scene.environment = environment;

    source.dispose();
    pmrem.dispose();

    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Key sun, sky fill and a cool rim so silhouettes separate from the background. */
function Lights({ quality }: { quality: 'low' | 'high' }) {
  return (
    <>
      {/*
        Balance matters more than any single light here: a strong coral key with almost no
        fill washes every surface salmon, which is the opposite of the intended 55%
        graphite. The key is warm but restrained, and the aqua fill carries the shadows.
      */}
      <hemisphereLight args={['#93b4d6', '#1d2430', 1.15]} />
      <directionalLight
        position={[-34, 30, -46]}
        intensity={0.95}
        color="#ffc9a8"
        castShadow={quality === 'high'}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-camera-far={170}
        shadow-normalBias={0.035}
        shadow-bias={-0.0006}
      />
      {/* Strong cool rim so characters separate from dark scenery. */}
      <directionalLight position={[26, 20, 40]} intensity={0.75} color="#8fc0ff" />
      {/* Deep ambient: blacks stay black rather than washing to grey. */}
      <ambientLight intensity={0.22} color="#6b7c9c" />
    </>
  );
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
