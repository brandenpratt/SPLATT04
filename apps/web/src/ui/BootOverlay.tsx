import { useEffect, useState } from 'react';

const LINES = [
  '> VICE ESTATE BROADCAST NET .... ONLINE',
  '> INFLATION PRESSURE ......... NOMINAL',
  '> PAINT RESERVOIRS ........... FULL',
  '> CROWD SIMULATOR ............ ENTHUSIASTIC',
  '> LEGAL DEPARTMENT ........... ASLEEP',
];

/**
 * A short fake broadcast boot sequence over the already-running game.
 * Skippable, and under three seconds even if the player does nothing.
 */
export function BootOverlay({ onDone, guestName }: { onDone: () => void; guestName: string }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const DURATION = 2600;
    let raf = 0;

    const tick = () => {
      const elapsed = Date.now() - started;
      setProgress(Math.min(1, elapsed / DURATION));
      setVisibleLines(Math.min(LINES.length, Math.floor(elapsed / 420) + 1));
      if (elapsed >= DURATION) onDone();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // rAF is paused while the tab is in the background, which would otherwise leave the
    // boot overlay stuck over an already-running game. A wall-clock timer always finishes it.
    const backstop = window.setTimeout(onDone, DURATION + 200);

    const skip = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'Escape') onDone();
    };
    window.addEventListener('keydown', skip);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(backstop);
      window.removeEventListener('keydown', skip);
    };
  }, [onDone]);

  return (
    <div className="boot" onPointerDown={onDone} role="dialog" aria-label="Loading SPLAT 04">
      <div className="boot__logo chrome-text">SPLAT 04</div>
      <div className="boot__tagline">THE FUTURE&rsquo;S MESSIEST PROFESSIONAL SPORT</div>

      <pre className="boot__lines">
        {LINES.slice(0, visibleLines).join('\n')}
        {visibleLines >= LINES.length ? `\n> WELCOME, ${guestName.toUpperCase()}` : ''}
      </pre>

      <div className="boot__bar">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <button className="btn btn--ghost" onClick={onDone} style={{ marginTop: '0.4rem' }}>
        Skip
      </button>
    </div>
  );
}
