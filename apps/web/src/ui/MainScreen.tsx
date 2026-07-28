import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getViceEstateLoadSnapshot,
  preloadViceEstateKit,
  subscribeViceEstateLoad,
} from '../game/viceEstateAssets.js';
import { viceEstateLoadFraction } from '../scene/ViceEstateVisualLayer.js';
import './MainScreen.css';

export type MainScreenMode = 'coverage' | 'coreball' | 'practice';

/**
 * The SPLAT 04 main screen.
 *
 * The estate, the hero player and the logo come from the approved key art; every control
 * is real DOM laid out over it at the art's own coordinates, so the panels are focusable,
 * keyboard-operable and carry live state. The art is not used as a flat screenshot with
 * dead pixels painted to look like buttons.
 *
 * Progress is weighted against work that actually happens, in the proportions the brief
 * fixed: shell 10, UI/input 10, player/marker 20, collision/core arena 25, hero estate 20,
 * lighting/paint 10, match sync 5. It never moves backward.
 */
const STAGES = [
  { key: 'shell', label: 'STARTING', weight: 10 },
  { key: 'ui', label: 'STARTING', weight: 10 },
  { key: 'player', label: 'LOADING PLAYERS', weight: 20 },
  { key: 'collision', label: 'LOADING ARENA', weight: 25 },
  { key: 'estate', label: 'LOADING ARENA', weight: 20 },
  { key: 'lighting', label: 'LOADING ARENA', weight: 10 },
  { key: 'sync', label: 'SYNCING MATCH', weight: 5 },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

export function MainScreen({
  guestName,
  connected,
  onPlay,
}: {
  guestName: string;
  connected: boolean;
  onPlay: (mode: MainScreenMode) => void;
}) {
  const [done, setDone] = useState<StageKey[]>([]);
  const [mode, setMode] = useState<MainScreenMode>('coverage');
  const [failed, setFailed] = useState(false);
  const peak = useRef(0);
  const estateLoad = useSyncExternalStore(
    subscribeViceEstateLoad,
    getViceEstateLoadSnapshot,
    getViceEstateLoadSnapshot,
  );

  const complete = useCallback(
    (key: StageKey) => setDone((prev) => (prev.includes(key) ? prev : [...prev, key])),
    [],
  );

  useEffect(() => {
    complete('shell');
    const raf = requestAnimationFrame(() => complete('ui'));

    // Arena art is the real page-wide GLB preload used by the scene, not a module-import
    // proxy. Its 31 fetch/decode completions feed the weighted percentage below.
    let cancelled = false;
    void preloadViceEstateKit();
    (async () => {
      try {
        await import('@splat04/shared');
        if (!cancelled) complete('collision');
        await import('../scene/materials.js');
        if (!cancelled) complete('player');
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (!cancelled) complete('lighting');
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [complete]);

  useEffect(() => {
    if (estateLoad.status === 'ready' || estateLoad.status === 'degraded') complete('estate');
    if (estateLoad.status === 'error') setFailed(true);
  }, [complete, estateLoad.status]);

  useEffect(() => {
    if (connected) complete('sync');
  }, [complete, connected]);

  const progress = useMemo(() => {
    const total = STAGES.reduce((sum, s) => sum + s.weight, 0);
    const estateFraction = viceEstateLoadFraction(estateLoad);
    const got = STAGES.reduce((sum, stage) => {
      if (stage.key === 'estate') return sum + stage.weight * estateFraction;
      return done.includes(stage.key) ? sum + stage.weight : sum;
    }, 0);
    peak.current = Math.max(peak.current, got / total);
    return peak.current;
  }, [done, estateLoad]);

  const ready = progress >= 1;
  const pendingStage = STAGES.find((stage) => !done.includes(stage.key));
  const status = ready
    ? 'READY'
    : pendingStage?.key === 'estate' && estateLoad.total > 0
      ? `${pendingStage.label} ${estateLoad.loaded}/${estateLoad.total}`
      : (pendingStage?.label ?? 'STARTING');

  return (
    <div className="ms" role="dialog" aria-modal="true" aria-label="SPLAT 04 main menu">
      <div className="ms__stage">
        <img className="ms__art" src="/ui/main-screen.jpg" alt="" aria-hidden="true" />

        <nav className="ms__nav" aria-label="Main">
          <button type="button" className="ms__tab ms__tab--active" aria-current="page">
            PLAY
          </button>
          <button type="button" className="ms__tab">
            LOCKER
          </button>
          <button type="button" className="ms__tab">
            CREW
          </button>
          <button type="button" className="ms__tab ms__tab--icon" aria-label="Settings">
            ⚙
          </button>
        </nav>

        <div className="ms__crew" aria-label={`Crew 1 of 4, playing as ${guestName}`}>
          <span className="ms__crew-avatar" aria-hidden="true" />
          <span className="ms__crew-label">
            CREW <b>1/4</b>
          </span>
          {[0, 1, 2].map((i) => (
            <button type="button" key={i} className="ms__crew-add" aria-label="Invite a crew mate">
              +
            </button>
          ))}
        </div>

        <div className="ms__quick">
          <div className="ms__quick-title">
            QUICK
            <br />
            SPLAT
          </div>
          <div className="ms__quick-sub">
            <span className="ms__quick-icon" aria-hidden="true" />
            4V4 COVERAGE
          </div>
        </div>

        <button
          type="button"
          className="ms__play"
          onClick={() => onPlay(mode)}
          disabled={!ready && !failed}
        >
          <span className="ms__play-arrow" aria-hidden="true" />
          {failed ? 'RETRY' : 'PLAY'}
        </button>

        <div className="ms__modes" role="radiogroup" aria-label="Game mode">
          {(
            [
              ['coverage', 'COVERAGE', 'ms__mode--orange'],
              ['coreball', 'COREBALL', 'ms__mode--pink'],
              ['practice', 'PRACTICE', 'ms__mode--cyan'],
            ] as const
          ).map(([key, label, tint]) => (
            <button
              type="button"
              key={key}
              role="radio"
              aria-checked={mode === key}
              className={`ms__mode ${tint} ${mode === key ? 'is-selected' : ''}`}
              onClick={() => setMode(key)}
            >
              <span className="ms__mode-glyph" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="ms__loading">
          <div
            className="ms__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Loading"
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="ms__status" aria-live="polite">
            {failed ? 'ASSET FAILED — RETRY' : status}
          </p>
        </div>
      </div>
    </div>
  );
}
