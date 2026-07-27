import { useEffect, useRef, useState } from 'react';
import {
  BOOST_COOLDOWN_MS,
  FAKE_SPONSORS,
  MARKERS,
  RESPAWN_SECONDS,
  TeamId,
} from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { NetStatus } from '../game/net.js';

interface Props {
  world: GameWorld;
  status: NetStatus | null;
  callout: string | null;
  practice: boolean;
}

/**
 * Only the essentials during play: both coverage percentages, the round clock, boost
 * cooldown, selected marker, a small connection indicator and the current callout.
 * The centre of the screen is left clear.
 *
 * Reads game state on an interval rather than per frame — the numbers only need to
 * change a few times a second, and this keeps React out of the render loop.
 */
export function Hud({ world, status, callout, practice }: Props) {
  const [, force] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  frame.current++;

  const coverage = world.coverage;
  const remaining = Math.max(0, world.phaseEndsAt - world.now());
  const seconds = Math.ceil(remaining / 1000);
  const urgent = world.phase === 'active' && seconds <= 10;

  const local = world.local;
  const now = world.now();
  const boostRemaining = Math.max(0, local.boostReadyAt - now);
  const boostReady = boostRemaining <= 0;
  const boostFill = boostReady ? 1 : 1 - boostRemaining / BOOST_COOLDOWN_MS;

  const marker = MARKERS[local.marker] ?? MARKERS.compressor;
  const respawnIn = local.alive ? 0 : Math.max(0, Math.ceil((local.respawnAt - now) / 1000));

  return (
    <div className="hud">
      {practice && (
        <div className="practice-banner" role="status">
          PRACTICE — LOCAL ONLY, NOT AN ONLINE RESULT
        </div>
      )}

      <div className="hud__top">
        <div className="scorebar" role="group" aria-label="Coverage">
          <div
            className="scorebar__side scorebar__side--cyan"
            style={{ flexGrow: Math.max(0.35, coverage.cyan / 10) }}
          >
            <span aria-label={`Cyan ${coverage.cyan.toFixed(0)} percent`}>
              {coverage.cyan.toFixed(0)}%
            </span>
          </div>
          <div className={`clock ${urgent ? 'clock--urgent' : ''}`}>
            {world.phase === 'intermission' ? 'INT' : formatClock(seconds)}
          </div>
          <div
            className="scorebar__side scorebar__side--magenta"
            style={{ flexGrow: Math.max(0.35, coverage.magenta / 10) }}
          >
            <span aria-label={`Magenta ${coverage.magenta.toFixed(0)} percent`}>
              {coverage.magenta.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {callout && (
        <div className="callout" role="status" aria-live="polite">
          {callout}
        </div>
      )}

      {respawnIn > 0 && (
        <div className="respawn" role="status">
          <div className="respawn__count">{respawnIn}</div>
          <div>SPLATTED — RESPAWNING</div>
        </div>
      )}

      <div className="sponsors" aria-hidden="true">
        {FAKE_SPONSORS.slice(0, 3).map((sponsor) => (
          <div className="sponsor" key={sponsor}>
            {sponsor}
          </div>
        ))}
      </div>

      <div className="hud__bottom">
        <div className="marker-chip panel">
          <span style={{ color: local.team === TeamId.Cyan ? 'var(--cyan)' : 'var(--magenta)' }}>
            {local.team === TeamId.Cyan ? '◤' : '●'}
          </span>
          {marker.name}
        </div>

        <div className="boost">
          <div className="boost__label">{boostReady ? 'BOOST READY' : 'BOOST'}</div>
          <div
            className="boost__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(boostFill * 100)}
            aria-label="Boost cooldown"
          >
            <div
              className={`boost__fill ${boostReady ? 'boost__fill--ready' : ''}`}
              style={{ transform: `scaleX(${boostFill})` }}
            />
          </div>
        </div>

        <div className="connection panel">
          <span
            className={`connection__dot ${connectionClass(status, world.latencyMs, practice)}`}
          />
          {connectionLabel(status, world.latencyMs, practice)}
        </div>
      </div>
    </div>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function connectionClass(status: NetStatus | null, latency: number, practice: boolean): string {
  if (practice) return 'connection__dot--warn';
  if (status !== 'open') return 'connection__dot--bad';
  if (latency > 180) return 'connection__dot--warn';
  return '';
}

function connectionLabel(status: NetStatus | null, latency: number, practice: boolean): string {
  if (practice) return 'LOCAL';
  switch (status) {
    case 'open':
      return `${Math.round(latency)}MS`;
    case 'connecting':
      return 'LINKING';
    case 'closed':
      return 'RECONNECTING';
    case 'failed':
      return 'OFFLINE';
    default:
      return '—';
  }
}

export { RESPAWN_SECONDS };
