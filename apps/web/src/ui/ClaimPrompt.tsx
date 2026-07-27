interface Props {
  rank: number;
  displayName: string;
  onKeepPlaying: () => void;
}

/**
 * Shown once, after the guest's first completed round.
 * Every claim route is prototype UI only — nothing here authenticates anything.
 */
export function ClaimPrompt({ rank, displayName, onKeepPlaying }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Claim this player">
      <div className="overlay__card panel" style={{ maxWidth: 520 }}>
        <h2 className="overlay__title chrome-text">YOU REACHED RANK {rank}</h2>
        <p className="overlay__sub">
          Claim this player? <strong>{displayName}</strong> currently lives only in this
          browser&rsquo;s storage.
        </p>

        <div className="actions">
          <button className="btn btn--coming-later" disabled>
            Email — coming later
          </button>
          <button className="btn btn--coming-later" disabled>
            Passkey — coming later
          </button>
          <button className="btn btn--coming-later" disabled>
            Wallet — coming later
          </button>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <button
            className="btn btn--primary"
            onClick={onKeepPlaying}
            autoFocus
            style={{ width: '100%', fontSize: '1.15rem' }}
          >
            Keep playing as guest
          </button>
        </div>

        <p className="note">
          No account is required and none of the buttons above do anything yet. Clearing site data
          will lose this guest.
        </p>
      </div>
    </div>
  );
}
