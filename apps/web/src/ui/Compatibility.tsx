/** Shown when WebGL is unavailable — a blank canvas explains nothing. */
export function Compatibility() {
  return (
    <div className="boot">
      <div className="boot__logo chrome-text">SPLAT 04</div>
      <div className="boot__tagline">SIGNAL LOST</div>
      <div className="overlay__card panel" style={{ maxWidth: 520, marginTop: '1rem' }}>
        <h2 className="overlay__title chrome-text" style={{ fontSize: '1.3rem' }}>
          THIS BROWSER CANNOT RENDER THE ARENA
        </h2>
        <p className="overlay__sub">
          SPLAT 04 needs WebGL, which this browser has either disabled or does not support.
        </p>
        <ul className="note" style={{ textAlign: 'left', lineHeight: 1.8 }}>
          <li>Try a current version of Chrome, Edge, Firefox or Safari.</li>
          <li>
            If you have hardware acceleration turned off, switching it back on usually fixes this.
          </li>
          <li>Some remote-desktop and virtual-machine setups block WebGL entirely.</li>
        </ul>
      </div>
    </div>
  );
}
