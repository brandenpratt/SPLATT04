import { useState } from 'react';
import {
  COSMETICS,
  GuestProfile,
  MARKERS,
  MARKER_IDS,
  MarkerId,
  markerUnlocked,
  xpProgressToNextRank,
} from '@splat04/shared';
import { purchaseCosmetic, setMarker } from '../game/storage.js';

interface Props {
  profile: GuestProfile;
  onProfileChange: (profile: GuestProfile) => void;
  onMarkerChange: (marker: MarkerId) => void;
  onClose: () => void;
}

const unlockAll =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('unlockAll') === '1';

/**
 * Cosmetics and marker sidegrades. Credits only, no checkout, no loot boxes,
 * and nothing here changes a single gameplay number.
 */
export function Locker({ profile, onProfileChange, onMarkerChange, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const progress = xpProgressToNextRank(profile.xp);

  function buy(id: string): void {
    const result = purchaseCosmetic(profile, id);
    onProfileChange(result.profile);
    setMessage(result.ok ? 'Unlocked.' : (result.reason ?? 'Could not buy that.'));
    setTimeout(() => setMessage(null), 2200);
  }

  function chooseMarker(id: MarkerId): void {
    const next = setMarker(profile, id);
    onProfileChange(next);
    onMarkerChange(id);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Locker">
      <div className="overlay__card panel">
        <h2 className="overlay__title chrome-text">LOCKER</h2>
        <p className="overlay__sub">
          RANK {profile.rank} · {profile.credits} CREDITS · {progress.into}/{progress.needed} XP to
          rank {profile.rank + 1}
        </p>

        <h3 className="stat__label" style={{ marginTop: '0.6rem' }}>
          MARKER
        </h3>
        <div className="marker-grid">
          {MARKER_IDS.map((id) => {
            const spec = MARKERS[id];
            const unlocked = markerUnlocked(id, profile.matchesCompleted, unlockAll);
            return (
              <button
                key={id}
                className="marker-card"
                aria-pressed={profile.selectedMarker === id}
                disabled={!unlocked}
                onClick={() => chooseMarker(id)}
              >
                <div className="marker-card__name">{spec.name}</div>
                <div className="marker-card__tagline">{spec.tagline}</div>
                <div className="marker-card__tagline" style={{ marginTop: '0.3rem' }}>
                  {unlocked
                    ? `${Math.round(1000 / spec.fireIntervalMs)} shots/s · ${spec.splashRadius.toFixed(2)} splash`
                    : `Unlocks after 3 matches (${profile.matchesCompleted}/3)`}
                </div>
              </button>
            );
          })}
        </div>
        <p className="note">
          These are sidegrades on an even power budget, not an upgrade ladder. Compressor hoses
          lanes, Brickshot owns ground, Triple Tap tags.
        </p>

        <h3 className="stat__label" style={{ marginTop: '1rem' }}>
          COSMETICS
        </h3>
        <div className="locker-grid">
          {COSMETICS.map((cosmetic) => {
            const owned = profile.unlockedCosmetics.includes(cosmetic.id);
            return (
              <div key={cosmetic.id} className={`locker-item ${owned ? 'locker-item--owned' : ''}`}>
                <div className="locker-item__name">{cosmetic.name}</div>
                <div className="locker-item__blurb">{cosmetic.blurb}</div>
                <button
                  className={`btn ${owned ? 'btn--ghost' : 'btn--primary'}`}
                  disabled={owned || profile.credits < cosmetic.price}
                  onClick={() => buy(cosmetic.id)}
                >
                  {owned ? 'Owned' : `${cosmetic.price} Credits`}
                </button>
              </div>
            );
          })}
        </div>

        {message && (
          <p className="note" role="status">
            {message}
          </p>
        )}

        <div className="actions">
          <button className="btn btn--coming-later" disabled>
            Create Team — coming later
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="note">
          Credits are a local progression currency. They are not money, cannot be transferred, and
          nothing in this prototype can be bought with real funds.
        </p>
      </div>
    </div>
  );
}
