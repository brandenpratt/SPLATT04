import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARENA_NAME,
  GuestProfile,
  MarkerId,
  RoundEndMessage,
  TeamId,
  markerUnlocked,
  parseRoute,
} from '@splat04/shared';
import { GameWorld } from './game/world.js';
import { InputController, isTouchDevice } from './game/input.js';
import { LocalGame } from './game/localgame.js';
import { NetClient, NetStatus } from './game/net.js';
import { audio, vibrate } from './game/audio.js';
import {
  Settings,
  applyRoundResult,
  bumpSession,
  loadProfileSync,
  loadSettings,
  saveSettings,
  setMarker as persistMarker,
} from './game/storage.js';
import { GameScene } from './scene/GameScene.js';
import { ArtReviewScene } from './scene/ArtReviewScene.js';
import { CameraMode, nextCameraMode } from './game/camera.js';
import {
  DEFAULT_DEBUG_STATE,
  DebugState,
  isDebugAllowed,
  readDebugFlags,
  setServerDebugAllowed,
} from './game/debug.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { Crosshair } from './ui/Crosshair.js';
import { SaturationOverlay } from './ui/SaturationOverlay.js';
import { MainScreen } from './ui/MainScreen.js';
import { Hud } from './ui/Hud.js';
import { Intermission } from './ui/Intermission.js';
import { SettingsOverlay } from './ui/Settings.js';
import { ClaimPrompt } from './ui/ClaimPrompt.js';
import { TouchControls } from './ui/TouchControls.js';

type Stage = 'range' | 'online' | 'practice';

const SEARCH = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const UNLOCK_ALL = SEARCH?.get('unlockAll') === '1';
/** Hard ceiling on the tutorial: nobody is stuck in the range waiting for a perfect shot. */
const RANGE_FALLBACK_MS = 16_000;
const CONNECT_GRACE_MS = 6_000;
const DEBUG_FLAGS = readDebugFlags();

export function App() {
  // The art-review route is a completely separate scene: no gameplay, no networking, and
  // none of the procedural arena. Checked before any game state is constructed.
  const initialRoute = useMemo(
    () => parseRoute(typeof location !== 'undefined' ? location.pathname : '/'),
    [],
  );
  if (initialRoute.kind === 'art-review') return <ArtReviewScene />;

  return <GameApp />;
}

function GameApp() {
  const world = useMemo(() => new GameWorld(), []);
  const input = useMemo(() => new InputController(), []);
  const hostRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<GuestProfile>(() => loadProfileSync());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [stage, setStage] = useState<Stage>('range');
  const [booting, setBooting] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [callout, setCallout] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatus | null>(null);
  const [roundEnd, setRoundEnd] = useState<RoundEndMessage | null>(null);
  const [offerPractice, setOfferPractice] = useState(false);
  const [touch, setTouch] = useState(() => isTouchDevice());
  const [autoQuality, setAutoQuality] = useState<'low' | 'high'>('high');
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [targetsLeft, setTargetsLeft] = useState(3);
  const [debug, setDebug] = useState<DebugState>(() => ({
    ...DEFAULT_DEBUG_STATE,
    god: DEBUG_FLAGS.god,
    panelOpen: DEBUG_FLAGS.enabled,
    botsRemoved: DEBUG_FLAGS.bots === 'off',
    difficulty: DEBUG_FLAGS.bots && DEBUG_FLAGS.bots !== 'off' ? DEBUG_FLAGS.bots : 'arcade',
  }));
  const [fps, setFps] = useState(60);
  const poorSamples = useRef(0);

  /** Camera mode: URL flag wins for this session, otherwise the saved preference. */
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    () => DEBUG_FLAGS.camera ?? loadSettings().cameraMode,
  );

  const netRef = useRef<NetClient | null>(null);
  const localRef = useRef<LocalGame | null>(null);
  const claimShown = useRef(false);

  const route = useMemo(
    () => parseRoute(typeof location !== 'undefined' ? location.pathname : '/'),
    [],
  );

  const quality: 'low' | 'high' =
    settings.quality === 'auto' ? autoQuality : settings.quality === 'low' ? 'low' : 'high';

  // --- boot: start the playable target range immediately -------------------

  useEffect(() => {
    localRef.current = new LocalGame(world, 'range');
    input.marker = profile.selectedMarker;
    world.local.marker = profile.selectedMarker;
    setProfile((current) => bumpSession(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (host) input.attach(host);
    return () => input.detach();
  }, [input]);

  useEffect(() => {
    audio.setEnabled(settings.sound);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setEnabled(settings.sound);
      if (settings.sound) audio.startCrowd();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [settings.sound]);

  // Track tutorial progress and hand off to the live arena.
  useEffect(() => {
    if (stage !== 'range') return;
    const started = Date.now();
    const id = setInterval(() => {
      const game = localRef.current;
      if (!game) return;
      setTargetsLeft(game.targetsRemaining);
      const done = game.targetsRemaining === 0;
      const timedOut = Date.now() - started > RANGE_FALLBACK_MS;
      if (done || timedOut) {
        clearInterval(id);
        goOnline();
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const goOnline = useCallback(() => {
    if (netRef.current) return;
    localRef.current = null;
    world.reset();
    setStage('online');

    const client = new NetClient(
      world,
      {
        guestId: profile.guestId,
        displayName: profile.displayName,
        marker: profile.selectedMarker,
        matchesCompleted: profile.matchesCompleted,
        unlockAll: UNLOCK_ALL,
        crewCode: route.kind === 'crew' ? route.code : undefined,
        challengeId: route.kind === 'challenge' ? route.id : undefined,
      },
      {
        onStatus: setNetStatus,
        onWelcome: (info) => {
          // The server decides whether developer commands are honoured at all. Only once
          // it has answered can the privileged URL flags be applied.
          setServerDebugAllowed(info.debugEnabled);
          if (!info.debugEnabled) return;
          const flags = readDebugFlags();
          setDebug((current) => ({
            ...current,
            panelOpen: current.panelOpen || flags.enabled,
            god: current.god || flags.god,
            botsRemoved: current.botsRemoved || flags.bots === 'off',
            difficulty: flags.bots && flags.bots !== 'off' ? flags.bots : current.difficulty,
          }));
          if (flags.god) client.sendDebug('god', true);
          if (flags.bots === 'off') client.sendDebug('removeBots', true);
          else if (flags.bots) client.sendDebug('difficulty', flags.bots);
        },
        onHit: () => {
          audio.play('thump', 0.4);
          vibrate(18, settings.haptics);
        },
        onCallout: (text) => {
          setCallout(text);
          audio.play('buzzer', 0.5);
          window.setTimeout(
            () => setCallout((current) => (current === text ? null : current)),
            1800,
          );
          if (settings.speech && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.15;
            speechSynthesis.speak(utterance);
          }
        },
        onTag: (byLocal, onLocal) => {
          if (byLocal) {
            audio.play('tag');
            vibrate(30, settings.haptics);
          }
          if (onLocal) {
            audio.play('splatted');
            vibrate([40, 40, 60], settings.haptics);
          }
        },
        onRoundEnd: (result) => {
          setRoundEnd(result);
          audio.play('buzzer');
          const mine = result.summaries.find((s) => s.playerId === world.localId);
          if (mine && mine.xpGained > 0) {
            setProfile((current) => {
              const applied = applyRoundResult(current, {
                xpGained: mine.xpGained,
                creditsGained: mine.creditsGained,
              });
              if (applied.unlocked) audio.play('unlock');
              if (!claimShown.current && applied.profile.matchesCompleted >= 1) {
                claimShown.current = true;
                setShowClaim(true);
              }
              return applied.profile;
            });
          }
        },
      },
    );

    netRef.current = client;
    // Developer handle. Harmless in production (it exposes no privileged capability the
    // server would honour) and invaluable for diagnosing client state from the console.
    // Merge, never replace: the scene attaches the renderer handle to this same object.
    const hook = ((window as unknown as Record<string, unknown>).__splat04 ?? {}) as Record<
      string,
      unknown
    >;
    Object.assign(hook, {
      world,
      client,
      input,
      flags: readDebugFlags(),
      debugAllowed: () => isDebugAllowed(),
    });
    (window as unknown as Record<string, unknown>).__splat04 = hook;
    client.connect();

    // Graceful degradation: if the socket never opens, offer local practice.
    window.setTimeout(() => {
      if (netRef.current && !netRef.current.connected) setOfferPractice(true);
    }, CONNECT_GRACE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile.guestId,
    profile.displayName,
    profile.selectedMarker,
    profile.matchesCompleted,
    route,
  ]);

  const startPractice = useCallback(() => {
    netRef.current?.close();
    netRef.current = null;
    setOfferPractice(false);
    setNetStatus(null);
    world.reset();
    localRef.current = new LocalGame(world, 'practice');
    world.local.marker = profile.selectedMarker;
    setStage('practice');
  }, [profile.selectedMarker, world]);

  // Esc opens settings; V swaps camera; F3/backtick and F4 are developer tools.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        setShowSettings((current) => !current);
        return;
      }
      if (event.code === 'KeyV') {
        event.preventDefault();
        switchCamera();
        return;
      }
      if (!isDebugAllowed()) return;
      if (event.code === 'F3' || event.code === 'Backquote') {
        event.preventDefault();
        setDebug((current) => ({ ...current, panelOpen: !current.panelOpen }));
      }
      if (event.code === 'F4') {
        event.preventDefault();
        setDebug((current) => ({ ...current, overheadCamera: !current.overheadCamera }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Camera choice is presentation only, and must survive a respawn — so it lives in
   * component state plus localStorage, never in anything the round lifecycle resets.
   */
  const switchCamera = useCallback(() => {
    setCameraMode((current) => {
      if (current === 'overhead') return current;
      const next = nextCameraMode(current) === 'first' ? 'first' : 'third';
      setSettings((s) => ({ ...s, cameraMode: next }));
      // A camera swap must not leave a virtual stick stuck mid-drag.
      input.releaseAll();
      return next;
    });
  }, [input]);

  const overlayOpen = showSettings || showClaim || Boolean(roundEnd) || offerPractice || booting;
  useEffect(() => {
    input.enabled = !overlayOpen;
    if (overlayOpen) {
      input.releaseAll();
      // Pointer lock must always be given back when a dialog opens.
      input.releasePointerLock();
    }
  }, [overlayOpen, input]);

  // Pause rendering and input while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) input.releaseAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [input]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    const onResize = () => setTouch(isTouchDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Clear the round-end overlay when the next round actually starts.
  useEffect(() => {
    if (!roundEnd) return;
    const id = setInterval(() => {
      if (world.phase === 'active') setRoundEnd(null);
    }, 250);
    return () => clearInterval(id);
  }, [roundEnd, world]);

  const handleQualitySample = useCallback(
    (sampled: number) => {
      setFps(sampled);
      const fps = sampled;
      if (settings.quality !== 'auto') return;
      setAutoQuality((current) => {
        // Require two consecutive poor samples before dropping, so a single hitch — or a
        // moment of compositor throttling — cannot latch the game into low quality.
        if (fps < 40 && current === 'high') {
          poorSamples.current += 1;
          return poorSamples.current >= 2 ? 'low' : current;
        }
        poorSamples.current = 0;
        if (fps > 55 && current === 'low') return 'high';
        return current;
      });
    },
    [settings.quality],
  );

  const changeMarker = useCallback(
    (marker: MarkerId) => {
      if (!markerUnlocked(marker, profile.matchesCompleted, UNLOCK_ALL)) return;
      input.marker = marker;
      world.local.marker = marker;
      netRef.current?.updateOptions({ marker });
      setProfile((current) => persistMarker(current, marker));
    },
    [input, profile.matchesCompleted, world],
  );

  const effectiveCamera: CameraMode = debug.overheadCamera ? 'overhead' : cameraMode;

  // Mouse-look is meaningless for the overhead debug camera, which aims with the cursor.
  useEffect(() => {
    input.mouseLookEnabled = effectiveCamera !== 'overhead';
    if (effectiveCamera === 'overhead') input.releasePointerLock();
  }, [effectiveCamera, input]);

  // Keep the settings overlay and the live camera in step.
  useEffect(() => {
    if (settings.cameraMode !== cameraMode && cameraMode !== 'overhead') {
      setCameraMode(settings.cameraMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.cameraMode]);

  const practice = stage === 'practice';
  const boostReady = world.now() >= world.local.boostReadyAt;

  return (
    <div className="app" ref={hostRef}>
      <div className="canvas-host">
        <GameScene
          world={world}
          input={input}
          net={stage === 'online' ? netRef.current : null}
          local={stage === 'online' ? null : localRef.current}
          settings={settings}
          quality={quality}
          cameraMode={effectiveCamera}
          onQualitySample={handleQualitySample}
          onFire={() => audio.play('splat', 0.5)}
          onBoost={() => {
            audio.play('boost');
            vibrate(25, settings.haptics);
          }}
        />
      </div>

      <div className="vignette" />
      {!settings.reducedMotion && <div className="scanlines" />}

      {stage === 'range' && !booting && (
        <>
          <div className="targets-left">PAINT THE TARGETS · {targetsLeft} LEFT</div>
          <div className="coach">
            <div className="coach__big">
              {touch ? 'LEFT STICK MOVES · RIGHT STICK PAINTS' : 'MOVE AND PAINT'}
            </div>
            {!touch && (
              <div className="coach__keys">
                <span className="key">W A S D</span>
                <span className="key">MOUSE TO AIM</span>
                <span className="key">HOLD LEFT CLICK</span>
                <span className="key">SPACE TO BOOST</span>
              </div>
            )}
          </div>
        </>
      )}

      {!booting && <Hud world={world} status={netStatus} callout={callout} practice={practice} />}
      {!booting && <Crosshair world={world} mode={effectiveCamera} />}
      {!booting && (
        <SaturationOverlay
          world={world}
          onCritical={() => {
            audio.play('splatted', 0.5);
            vibrate([25, 30, 25], settings.haptics);
          }}
        />
      )}

      {isDebugAllowed() && debug.panelOpen && (
        <DebugPanel
          world={world}
          state={debug}
          cameraMode={effectiveCamera}
          fps={fps}
          onChange={(patch) => {
            setDebug((current) => ({ ...current, ...patch }));
            const client = netRef.current;
            if (!client) return;
            if (patch.god !== undefined) client.sendDebug('god', patch.god);
            if (patch.botsFrozen !== undefined) client.sendDebug('freezeBots', patch.botsFrozen);
            if (patch.botsRemoved !== undefined) client.sendDebug('removeBots', patch.botsRemoved);
            if (patch.difficulty !== undefined) client.sendDebug('difficulty', patch.difficulty);
          }}
          actions={{
            restartRound: () => netRef.current?.sendDebug('restartRound'),
            addTime: (seconds) => netRef.current?.sendDebug('addTime', seconds),
            clearPaint: () => netRef.current?.sendDebug('clearPaint'),
            teleport: (team) => netRef.current?.sendDebug('teleport', team),
          }}
          onClose={() => setDebug((current) => ({ ...current, panelOpen: false }))}
        />
      )}

      {touch && !overlayOpen && !booting && (
        <button
          className="camera-toggle"
          onClick={switchCamera}
          aria-label={`Switch to ${cameraMode === 'first' ? 'third' : 'first'} person view`}
        >
          {cameraMode === 'first' ? '1P' : '3P'}
        </button>
      )}

      {touch && !overlayOpen && (
        <TouchControls
          input={input}
          boostReady={boostReady}
          onBoost={() => {
            audio.play('boost');
            vibrate(25, settings.haptics);
          }}
        />
      )}

      {booting && (
        <MainScreen
          guestName={profile.displayName}
          connected={Boolean(netStatus)}
          onPlay={() => setBooting(false)}
        />
      )}

      {offerPractice && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Connection problem">
          <div className="overlay__card panel" style={{ maxWidth: 480 }}>
            <h2 className="overlay__title chrome-text">NO SIGNAL</h2>
            <p className="overlay__sub">
              The broadcast link to {ARENA_NAME} will not open. You can keep trying, or play a local
              practice round against bots.
            </p>
            <div className="actions">
              <button className="btn btn--primary" onClick={startPractice}>
                Practice with bots
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  setOfferPractice(false);
                  netRef.current?.connect();
                }}
              >
                Keep trying
              </button>
            </div>
            <p className="note">
              Practice runs the same rules on your device. Results are local only and are never
              recorded as online play.
            </p>
          </div>
        </div>
      )}

      {roundEnd && (
        <Intermission
          winner={roundEnd.winner}
          coverage={roundEnd.coverage}
          summaries={roundEnd.summaries}
          localPlayerId={world.localId}
          profile={profile}
          practice={practice}
          roomId={netRef.current?.currentRoomId ?? ''}
          secondsToNextRound={Math.ceil((roundEnd.nextRoundAt - world.now()) / 1000)}
          onRematch={() => setRoundEnd(null)}
          onProfileChange={setProfile}
          onMarkerChange={changeMarker}
        />
      )}

      {showClaim && !roundEnd && (
        <ClaimPrompt
          rank={profile.rank}
          displayName={profile.displayName}
          onKeepPlaying={() => setShowClaim(false)}
        />
      )}

      {showSettings && (
        <SettingsOverlay
          settings={settings}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          onClose={() => setShowSettings(false)}
          canInstall={Boolean(installPrompt) && profile.sessionsCompleted >= 3}
          onInstall={() => {
            (installPrompt as any)?.prompt?.();
            setInstallPrompt(null);
          }}
        />
      )}
    </div>
  );
}

export { TeamId };
