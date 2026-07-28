import { useEffect, useState } from 'react';
import { GameWorld } from '../game/world.js';
import { CameraMode } from '../game/camera.js';

/**
 * Centre crosshair for the playable cameras.
 *
 * It reddens when the player's *muzzle* is against cover — the shot would hit that cover
 * regardless of what the camera can see past it. The server reaches the same conclusion
 * on its own; this only tells the player before they waste paint.
 */
export function Crosshair({ world, mode }: { world: GameWorld; mode: CameraMode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setBlocked(world.muzzleBlocked), 80);
    return () => clearInterval(id);
  }, [world]);

  if (mode === 'overhead') return null;

  return (
    <div className={`crosshair ${blocked ? 'crosshair--blocked' : ''}`} aria-hidden="true">
      <span className="crosshair__dot" />
      <span className="crosshair__arm crosshair__arm--n" />
      <span className="crosshair__arm crosshair__arm--s" />
      <span className="crosshair__arm crosshair__arm--w" />
      <span className="crosshair__arm crosshair__arm--e" />
    </div>
  );
}
