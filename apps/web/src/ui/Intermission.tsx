import { useEffect, useRef, useState } from 'react';
import {
  ARENA_NAME,
  Coverage,
  GuestProfile,
  MARKERS,
  MARKER_IDS,
  MarkerId,
  PlayerRoundSummary,
  TeamId,
  challengeUrl,
  crewUrl,
  markerUnlocked,
} from '@splat04/shared';
import { copyText, downloadCard, drawHighlightCard } from '../game/highlight.js';
import { Locker } from './Locker.js';

interface Props {
  winner: TeamId | null;
  coverage: Coverage;
  summaries: PlayerRoundSummary[];
  localPlayerId: string;
  profile: GuestProfile;
  practice: boolean;
  roomId: string;
  onRematch: () => void;
  onProfileChange: (profile: GuestProfile) => void;
  onMarkerChange: (marker: MarkerId) => void;
  secondsToNextRound: number;
}

/**
 * Intermission: the camera has already pulled out to show the painted map, so this
 * overlay stays out of the way and offers the three large actions plus the locker.
 */
export function Intermission({
  winner,
  coverage,
  summaries,
  localPlayerId,
  profile,
  practice,
  roomId,
  onRematch,
  onProfileChange,
  onMarkerChange,
  secondsToNextRound,
}: Props) {
  const [view, setView] = useState<'result' | 'locker' | 'share'>('result');
  const [crew, setCrew] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mine = summaries.find((s) => s.playerId === localPlayerId);
  const myCoverage = mine
    ? mine.team === TeamId.Cyan
      ? coverage.cyan
      : coverage.magenta
    : coverage.cyan;

  const origin = typeof location !== 'undefined' ? location.origin : 'https://splat04.example';
  const shareUrl = challenge ? challengeUrl(origin, challenge) : origin;

  useEffect(() => {
    if (view !== 'share' || !canvasRef.current || !mine) return;
    drawHighlightCard(canvasRef.current, {
      name: mine.name,
      team: mine.team,
      coverage: myCoverage,
      tags: mine.tags,
      won: mine.won,
      challengeUrl: shareUrl,
    });
  }, [view, mine, myCoverage, shareUrl]);

  const banner =
    winner === null
      ? { className: 'winner-banner--draw', text: 'DEAD HEAT' }
      : winner === TeamId.Cyan
        ? { className: 'winner-banner--cyan', text: 'CYAN TAKES IT' }
        : { className: 'winner-banner--magenta', text: 'MAGENTA TAKES IT' };

  async function createChallenge(): Promise<void> {
    if (practice) return;
    try {
      const response = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scoreToBeat: myCoverage,
          createdByGuestId: profile.guestId,
          createdByName: profile.displayName,
        }),
      });
      const body = await response.json();
      if (body?.challenge?.id) setChallenge(body.challenge.id);
    } catch {
      // Offline or the server went away — the share view still works with the plain URL.
    }
  }

  async function createCrew(): Promise<void> {
    if (practice) return;
    try {
      const response = await fetch('/api/crew', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId, team: mine?.team ?? TeamId.Cyan }),
      });
      const body = await response.json();
      if (body?.crew?.code) setCrew(body.crew.code);
    } catch {
      // Same as above: a crew link is a bonus, never a blocker.
    }
  }

  async function copy(value: string, key: string): Promise<void> {
    const ok = await copyText(value);
    setCopied(ok ? key : null);
    setTimeout(() => setCopied(null), 1800);
  }

  if (view === 'locker') {
    return (
      <Locker
        profile={profile}
        onProfileChange={onProfileChange}
        onMarkerChange={onMarkerChange}
        onClose={() => setView('result')}
      />
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Round results">
      <div className="overlay__card panel">
        <div className={`winner-banner ${banner.className}`}>{banner.text}</div>
        <p className="overlay__sub">
          {ARENA_NAME} · CYAN {coverage.cyan.toFixed(1)}% · MAGENTA {coverage.magenta.toFixed(1)}%
          {practice && ' · PRACTICE (LOCAL ONLY)'}
        </p>

        {view === 'result' && (
          <>
            {mine && (
              <div className="summary-grid">
                <Stat label="AREA PAINTED" value={`${mine.areaPaintedPercent.toFixed(1)}%`} />
                <Stat label="TAGS" value={`${mine.tags}`} />
                <Stat label="ASSISTS" value={`${mine.assists}`} />
                <Stat label="SPLATTED" value={`${mine.splatted}`} />
                <Stat label="XP GAINED" value={`+${mine.xpGained}`} />
                <Stat label="CREDITS" value={`+${mine.creditsGained}`} />
              </div>
            )}

            <table className="scoreboard">
              <caption className="visually-hidden">Round scoreboard</caption>
              <thead>
                <tr>
                  <th className="scoreboard__team" aria-label="Team" />
                  <th>Player</th>
                  <th>Tags</th>
                  <th>Area</th>
                  <th>XP</th>
                </tr>
              </thead>
              <tbody>
                {[...summaries]
                  .sort((a, b) => b.xpGained - a.xpGained)
                  .slice(0, 8)
                  .map((row) => (
                    <tr key={row.playerId} data-you={row.playerId === localPlayerId}>
                      <td
                        className="scoreboard__team"
                        style={{
                          background: row.team === TeamId.Cyan ? 'var(--cyan)' : 'var(--magenta)',
                        }}
                      />
                      <td>
                        {row.name}
                        {row.playerId === localPlayerId && <span className="tag"> YOU</span>}
                      </td>
                      <td>{row.tags}</td>
                      <td>{row.areaPaintedPercent.toFixed(1)}%</td>
                      <td>{row.xpGained}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="actions">
              <button className="btn btn--primary" onClick={onRematch} autoFocus>
                Rematch ({Math.max(0, secondsToNextRound)}s)
              </button>
              <button
                className="btn btn--cyan"
                onClick={async () => {
                  await createChallenge();
                  setView('share');
                }}
              >
                Challenge a friend
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await createChallenge();
                  setView('share');
                }}
              >
                Copy highlight
              </button>
              <button className="btn btn--ghost" onClick={() => setView('locker')}>
                Locker
              </button>
            </div>

            <p className="note">
              Rematch keeps you in this continuous arena — the next round starts on its own either
              way.
            </p>
          </>
        )}

        {view === 'share' && (
          <>
            <h3 className="overlay__title chrome-text" style={{ fontSize: '1.3rem' }}>
              YOUR HIGHLIGHT
            </h3>
            <canvas
              ref={canvasRef}
              className="highlight-canvas"
              aria-label="Shareable result card"
            />

            <div className="share-row">
              <code>{shareUrl}</code>
              <button className="btn btn--cyan" onClick={() => copy(shareUrl, 'challenge')}>
                {copied === 'challenge' ? 'Copied!' : 'Copy link'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (canvasRef.current) downloadCard(canvasRef.current, 'splat04-highlight.png');
                }}
              >
                Download PNG
              </button>
            </div>

            <div className="share-row">
              {crew ? (
                <>
                  <code>{crewUrl(origin, crew)}</code>
                  <button
                    className="btn btn--magenta"
                    onClick={() => copy(crewUrl(origin, crew), 'crew')}
                  >
                    {copied === 'crew' ? 'Copied!' : 'Copy crew link'}
                  </button>
                </>
              ) : (
                <button className="btn btn--magenta" onClick={createCrew} disabled={practice}>
                  Create crew
                </button>
              )}
            </div>

            <div className="actions">
              <button className="btn btn--primary" onClick={() => setView('result')}>
                Back
              </button>
            </div>

            <p className="note">
              Anyone opening a crew link joins this room on your team where there is space. Crew
              codes live in server memory for two hours in this prototype.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}

export { MARKERS, MARKER_IDS, markerUnlocked };
