import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { serviceWorkerLifecycle } from './serviceWorkerLifecycle.js';
import { Compatibility } from './ui/Compatibility.js';
import './styles.css';

// Every document starts outside gameplay. GameApp raises this guard before an arena match;
// art review and compatibility pages remain safe activation points.
serviceWorkerLifecycle.setMatchActive(false);

/** WebGL is non-negotiable for the 3D arena; fail with something useful instead of a blank page. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<StrictMode>{hasWebGL() ? <App /> : <Compatibility />}</StrictMode>);
}

// Service worker: shell caching only, and it never activates mid-round.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    serviceWorkerLifecycle.register().catch(() => {
      // Offline support is optional; the game works without it.
    });
  });
}
