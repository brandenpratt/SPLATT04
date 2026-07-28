import type { GameModeSelection } from '../appFlow.js';
import './FrontDoor.css';

export const HOME_MENU_ASSET = '/ui/vice-estate-home-v3.jpg';

export const HOME_MENU_ACTIONS = {
  play: 'enabled',
  locker: 'coming-soon',
  crew: 'coming-soon',
  settings: 'enabled',
} as const;

const MODES: ReadonlyArray<{
  id: GameModeSelection;
  label: string;
  detail: string;
  available: boolean;
}> = [
  { id: 'coverage', label: 'Coverage', detail: '4v4 arena control', available: true },
  { id: 'coreball', label: 'Coreball', detail: 'Coming soon', available: false },
  { id: 'practice', label: 'Practice', detail: 'Local bots', available: true },
];
const AVAILABLE_MODE_IDS = MODES.filter((mode) => mode.available).map((mode) => mode.id);

export function nextModeForKey(current: GameModeSelection, key: string): GameModeSelection | null {
  if (key === 'Home') return AVAILABLE_MODE_IDS[0];
  if (key === 'End') return AVAILABLE_MODE_IDS[AVAILABLE_MODE_IDS.length - 1];
  const direction =
    key === 'ArrowRight' || key === 'ArrowDown'
      ? 1
      : key === 'ArrowLeft' || key === 'ArrowUp'
        ? -1
        : 0;
  if (direction === 0) return null;
  const currentIndex = Math.max(0, AVAILABLE_MODE_IDS.indexOf(current));
  return AVAILABLE_MODE_IDS[
    (currentIndex + direction + AVAILABLE_MODE_IDS.length) % AVAILABLE_MODE_IDS.length
  ];
}

export function HomeMenu({
  guestName,
  selectedMode,
  networkLabel,
  onModeChange,
  onPlay,
  onOpenSettings,
}: {
  guestName: string;
  selectedMode: GameModeSelection;
  networkLabel: string;
  onModeChange: (mode: GameModeSelection) => void;
  onPlay: (mode: GameModeSelection) => void;
  onOpenSettings: () => void;
}) {
  const selected = MODES.find((mode) => mode.id === selectedMode) ?? MODES[0];
  const rovingMode = selected.available ? selected.id : AVAILABLE_MODE_IDS[0];

  const handleModeKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    mode: GameModeSelection,
  ) => {
    const next = nextModeForKey(mode, event.key);
    if (!next) return;
    event.preventDefault();
    onModeChange(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)
      ?.focus();
  };

  return (
    <main className="home-menu" aria-label="SPLAT 04 home menu">
      <img className="home-menu__art" src={HOME_MENU_ASSET} alt="" aria-hidden="true" />
      <div className="home-menu__shade" aria-hidden="true" />

      <header className="home-menu__header">
        <div className="home-menu__logo" aria-label="SPLAT 04">
          <span>SPLAT</span>
          <strong>04</strong>
        </div>
        <nav className="home-menu__nav" aria-label="Main">
          <button type="button" className="home-menu__nav-item is-selected" aria-current="page">
            Play
          </button>
          <button type="button" className="home-menu__nav-item" disabled title="Coming soon">
            Locker <small>Coming soon</small>
          </button>
          <button type="button" className="home-menu__nav-item" disabled title="Coming soon">
            Crew <small>Coming soon</small>
          </button>
          <button
            type="button"
            className="home-menu__settings"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            Settings
          </button>
        </nav>
        <div className="home-menu__crew" aria-label={`Playing as ${guestName}`}>
          <span className="home-menu__crew-dot" aria-hidden="true" />
          <span>
            {guestName}
            <small>Crew 1/4 · invites coming soon</small>
          </span>
        </div>
      </header>

      <section className="home-menu__panel">
        <p className="home-menu__eyebrow">Vice Estate 04</p>
        <h1>Quick Splat</h1>
        <p className="home-menu__summary">{selected.detail}</p>

        <div className="home-menu__modes" role="radiogroup" aria-label="Game mode">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              role="radio"
              aria-checked={selectedMode === mode.id}
              data-mode={mode.id}
              tabIndex={rovingMode === mode.id ? 0 : -1}
              className={`home-menu__mode home-menu__mode--${mode.id}`}
              disabled={!mode.available}
              onClick={() => onModeChange(mode.id)}
              onKeyDown={(event) => handleModeKeyDown(event, mode.id)}
            >
              <span>{mode.label}</span>
              <small>{mode.detail}</small>
            </button>
          ))}
        </div>

        <button type="button" className="home-menu__play" onClick={() => onPlay(selectedMode)}>
          <span aria-hidden="true">▶</span> Play {selected.label}
        </button>
        <p className="home-menu__status" aria-live="polite">
          {networkLabel}
        </p>
      </section>
    </main>
  );
}
