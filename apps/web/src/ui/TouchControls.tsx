import { useRef, useState } from 'react';
import { InputController, StickState } from '../game/input.js';

interface Props {
  input: InputController;
  boostReady: boolean;
  onBoost: () => void;
}

/**
 * Left stick moves, right stick aims and auto-fires, and a large separate button boosts.
 * Both sticks are floating: they appear wherever the thumb lands inside their zone,
 * which is far more forgiving than fixed pads on varied phone sizes.
 */
export function TouchControls({ input, boostReady, onBoost }: Props) {
  const [, force] = useState(0);
  const raf = useRef(0);

  // Re-render only while a stick is engaged, to animate the nubs.
  const pump = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => force((n) => n + 1));
  };

  const bind = (stick: StickState) => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      input.beginStick(stick, event.pointerId, event.clientX, event.clientY);
      pump();
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!stick.active || stick.pointerId !== event.pointerId) return;
      input.moveStickTo(stick, event.clientX, event.clientY);
      pump();
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (stick.pointerId !== event.pointerId) return;
      input.endStick(stick);
      pump();
    },
    onPointerCancel: () => {
      input.endStick(stick);
      pump();
    },
  });

  return (
    <div className="touch">
      <div className="touch__zone touch__zone--left" {...bind(input.moveStick)} aria-hidden="true">
        {input.moveStick.active && <Stick stick={input.moveStick} />}
      </div>
      <div className="touch__zone touch__zone--right" {...bind(input.aimStick)} aria-hidden="true">
        {input.aimStick.active && <Stick stick={input.aimStick} />}
      </div>

      <button
        className="touch__boost"
        disabled={!boostReady}
        aria-label="Boost"
        onPointerDown={(event) => {
          event.preventDefault();
          input.touchBoost = true;
          onBoost();
        }}
      >
        BOOST
      </button>
    </div>
  );
}

function Stick({ stick }: { stick: StickState }) {
  return (
    <div className="stick" style={{ left: stick.originX, top: stick.originY }}>
      <div
        className="stick__nub"
        style={{ transform: `translate(${stick.x * 30}px, ${stick.z * 30}px)` }}
      />
    </div>
  );
}
