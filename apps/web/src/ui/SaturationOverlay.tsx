import { useEffect, useRef, useState } from 'react';
import { SATURATION_MAX, SATURATION_WARNING_FRACTION, TeamId } from '@splat04/shared';
import { GameWorld } from '../game/world.js';

/**
 * Suit Saturation, shown as paint creeping in from the edges of the visor.
 *
 * The centre of the screen is deliberately left completely clear — this is a shooter, and
 * the damage readout must never sit where the player is aiming. Splats take the attacking
 * team's colour so you can tell who is soaking you.
 */
export function SaturationOverlay({
  world,
  onCritical,
}: {
  world: GameWorld;
  onCritical: () => void;
}) {
  const [fraction, setFraction] = useState(0);
  const [team, setTeam] = useState<TeamId>(TeamId.Magenta);
  const wasCritical = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.max(0, Math.min(1, world.saturation / SATURATION_MAX));
      setFraction(next);
      if (world.lastHit) setTeam(world.lastHit.team as TeamId);

      const critical = next >= SATURATION_WARNING_FRACTION;
      if (critical && !wasCritical.current) onCritical();
      wasCritical.current = critical;
    }, 80);
    return () => clearInterval(id);
  }, [world, onCritical]);

  if (fraction <= 0.001) return null;

  const critical = fraction >= SATURATION_WARNING_FRACTION;
  const colour = team === TeamId.Cyan ? 'var(--cyan)' : 'var(--magenta)';

  return (
    <div
      className={`saturation ${critical ? 'saturation--critical' : ''}`}
      aria-hidden="true"
      style={
        {
          '--sat': fraction.toFixed(3),
          '--sat-colour': colour,
        } as React.CSSProperties
      }
    >
      <div className="saturation__edge saturation__edge--top" />
      <div className="saturation__edge saturation__edge--bottom" />
      <div className="saturation__edge saturation__edge--left" />
      <div className="saturation__edge saturation__edge--right" />
      {critical && (
        <div className="saturation__warning" role="status">
          SUIT SOAKED
        </div>
      )}
    </div>
  );
}
