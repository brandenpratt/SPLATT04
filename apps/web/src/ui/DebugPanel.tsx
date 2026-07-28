import { useEffect, useState } from 'react';
import { BotDifficulty, SATURATION_MAX } from '@splat04/shared';
import { GameWorld } from '../game/world.js';
import { DebugState } from '../game/debug.js';
import { CameraMode } from '../game/camera.js';

export interface DebugActions {
  restartRound(): void;
  addTime(seconds: number): void;
  clearPaint(): void;
  teleport(team: 'cyan' | 'magenta'): void;
}

interface Props {
  world: GameWorld;
  state: DebugState;
  onChange: (patch: Partial<DebugState>) => void;
  actions: DebugActions;
  cameraMode: CameraMode;
  fps: number;
  onClose: () => void;
}

/**
 * Developer gameplay panel — backtick or F3.
 *
 * Exists so gameplay, networking, collision and camera bugs can be chased without being
 * repeatedly tagged. Only rendered when `debugAllowed`, which is a dev-build constant, so
 * this whole component drops out of a production bundle.
 */
export function DebugPanel({ world, state, onChange, actions, cameraMode, fps, onClose }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="debug" role="dialog" aria-label="Developer panel">
      <div className="debug__head">
        <strong>DEV PANEL</strong>
        <button className="debug__close" onClick={onClose} aria-label="Close developer panel">
          ×
        </button>
      </div>

      <Section title="Player">
        <Toggle label="Invulnerable" value={state.god} onChange={(god) => onChange({ god })} />
        <Row label="Saturation" value={`${world.saturation.toFixed(0)} / ${SATURATION_MAX}`} />
        <Row label="Camera" value={cameraMode} />
        <div className="debug__buttons">
          <button onClick={() => actions.teleport('cyan')}>To Cyan spawn</button>
          <button onClick={() => actions.teleport('magenta')}>To Magenta spawn</button>
        </div>
      </Section>

      <Section title="Bots">
        <Toggle
          label="Freeze bots"
          value={state.botsFrozen}
          onChange={(botsFrozen) => onChange({ botsFrozen })}
        />
        <Toggle
          label="Remove bots"
          value={state.botsRemoved}
          onChange={(botsRemoved) => onChange({ botsRemoved })}
        />
        <div className="debug__seg">
          {(['chill', 'arcade', 'pro'] as BotDifficulty[]).map((tier) => (
            <button
              key={tier}
              aria-pressed={state.difficulty === tier}
              onClick={() => onChange({ difficulty: tier })}
            >
              {tier}
            </button>
          ))}
        </div>
        <Toggle
          label="Bot aim lines"
          value={state.showBotAim}
          onChange={(showBotAim) => onChange({ showBotAim })}
        />
        <Toggle
          label="Bot state labels"
          value={state.showBotLabels}
          onChange={(showBotLabels) => onChange({ showBotLabels })}
        />
      </Section>

      <Section title="Round">
        <div className="debug__buttons">
          <button onClick={actions.restartRound}>Restart round</button>
          <button onClick={() => actions.addTime(30)}>+30 seconds</button>
          <button onClick={actions.clearPaint}>Clear paint</button>
        </div>
      </Section>

      <Section title="Visualisation">
        <Toggle
          label="Collision outlines"
          value={state.showCollision}
          onChange={(showCollision) => onChange({ showCollision })}
        />
        <Toggle
          label="Nav waypoints"
          value={state.showWaypoints}
          onChange={(showWaypoints) => onChange({ showWaypoints })}
        />
        <Toggle
          label="Projectile traces"
          value={state.showProjectileTraces}
          onChange={(showProjectileTraces) => onChange({ showProjectileTraces })}
        />
        <Toggle
          label="Overhead camera (F4)"
          value={state.overheadCamera}
          onChange={(overheadCamera) => onChange({ overheadCamera })}
        />
      </Section>

      <Section title="Network">
        <Row label="Ping" value={`${Math.round(world.latencyMs)} ms`} />
        <Row label="Server tick" value={`${world.serverTickRate} Hz`} />
        <Row label="Snapshot rate" value={`${world.snapshotRate.toFixed(1)} Hz`} />
        <Row label="Client FPS" value={fps.toFixed(0)} />
        <Row label="Input seq" value={`${world.inputSeq}`} />
        <Row label="Acked seq" value={`${world.ackedSeq}`} />
        <Row label="Players" value={`${world.players.size}`} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="debug__section">
      <div className="debug__title">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug__row">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="debug__toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
