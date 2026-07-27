import { Settings as SettingsValue } from '../game/storage.js';

interface Props {
  settings: SettingsValue;
  onChange: (patch: Partial<SettingsValue>) => void;
  onClose: () => void;
  onInstall?: () => void;
  canInstall: boolean;
}

/** Esc overlay. Opening it releases gameplay input so the page never eats keystrokes. */
export function SettingsOverlay({ settings, onChange, onClose, onInstall, canInstall }: Props) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="overlay__card panel">
        <h2 className="overlay__title chrome-text">SETTINGS</h2>
        <p className="overlay__sub">The broadcast is paused for you, not for anybody else.</p>

        <Segmented
          label="Quality"
          value={settings.quality}
          options={[
            ['auto', 'Auto'],
            ['low', 'Low'],
            ['high', 'High'],
          ]}
          onChange={(quality) => onChange({ quality: quality as SettingsValue['quality'] })}
        />
        <Toggle label="Sound" value={settings.sound} onChange={(sound) => onChange({ sound })} />
        <Toggle
          label="Haptics"
          value={settings.haptics}
          onChange={(haptics) => onChange({ haptics })}
        />
        <Segmented
          label="Aim assist"
          value={settings.aimAssist}
          options={[
            ['standard', 'Standard'],
            ['reduced', 'Reduced'],
          ]}
          onChange={(aimAssist) => onChange({ aimAssist: aimAssist as SettingsValue['aimAssist'] })}
        />
        <Toggle
          label="Reduced motion"
          value={settings.reducedMotion}
          onChange={(reducedMotion) => onChange({ reducedMotion })}
        />
        <Toggle
          label="High contrast"
          value={settings.highContrast}
          onChange={(highContrast) => onChange({ highContrast })}
        />
        <Toggle
          label="Announcer speech"
          value={settings.speech}
          onChange={(speech) => onChange({ speech })}
        />

        <div className="actions">
          {canInstall && (
            <button className="btn btn--cyan" onClick={onInstall}>
              Install SPLAT 04
            </button>
          )}
          <button className="btn btn--primary" onClick={onClose} autoFocus>
            Back to the game
          </button>
        </div>

        <p className="note">
          Aim assist only nudges paintballs that were already close to on-target, and never more
          than a few degrees in total. Announcer speech uses your browser&rsquo;s own voice and is
          off by default.
        </p>
      </div>
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
    <div className="settings-row">
      <label id={`label-${label}`}>{label}</label>
      <div className="segmented" role="group" aria-labelledby={`label-${label}`}>
        <button aria-pressed={value} onClick={() => onChange(true)}>
          On
        </button>
        <button aria-pressed={!value} onClick={() => onChange(false)}>
          Off
        </button>
      </div>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-row">
      <label id={`label-${label}`}>{label}</label>
      <div className="segmented" role="group" aria-labelledby={`label-${label}`}>
        {options.map(([key, text]) => (
          <button key={key} aria-pressed={value === key} onClick={() => onChange(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
