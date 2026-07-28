import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_MENU_ACTIONS, HomeMenu, nextModeForKey } from './HomeMenu.js';

describe('home menu action contract', () => {
  it('has no enabled no-op navigation actions', () => {
    expect(HOME_MENU_ACTIONS).toEqual({
      play: 'enabled',
      locker: 'coming-soon',
      crew: 'coming-soon',
      settings: 'enabled',
    });
  });

  it('uses a clean plate and honest unavailable modes', () => {
    const html = renderToStaticMarkup(
      <HomeMenu
        guestName="Guest"
        selectedMode="coverage"
        networkLabel="Online"
        onModeChange={() => undefined}
        onPlay={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );
    expect(html).toContain('/ui/vice-estate-home-v3.jpg');
    expect(html).toContain('Coreball');
    expect(html).toContain('disabled');
    expect(html).not.toContain('main-screen');
    expect(html).toContain('data-mode="coverage" tabindex="0"');
    expect(html).toContain('data-mode="practice" tabindex="-1"');
    const coreball = html.match(/<button[^>]*data-mode="coreball"[^>]*>[\s\S]*?<\/button>/)?.[0];
    expect(coreball).toBeDefined();
    expect(coreball).toContain('disabled');
    expect(coreball).toContain('Coreball');
    expect(coreball).toContain('Coming soon');
  });

  it('implements wrapping arrow-key and Home/End radio navigation', () => {
    expect(nextModeForKey('coverage', 'ArrowRight')).toBe('practice');
    expect(nextModeForKey('practice', 'ArrowRight')).toBe('coverage');
    expect(nextModeForKey('coverage', 'ArrowLeft')).toBe('practice');
    expect(nextModeForKey('practice', 'Home')).toBe('coverage');
    expect(nextModeForKey('coverage', 'End')).toBe('practice');
    expect(nextModeForKey('coverage', 'Enter')).toBeNull();
  });

  it('keeps front-door roots viewport-bound for the responsive matrix', () => {
    const css = readFileSync(new URL('./FrontDoor.css', import.meta.url), 'utf8');
    expect(css).toContain('position: fixed');
    expect(css).toContain('inset: 0');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain('env(safe-area-inset');
    expect(css).toContain('@media (max-height: 520px)');
    expect(css).toContain('@media (max-aspect-ratio: 1/1)');
    const portrait = css.slice(css.indexOf('@media (max-aspect-ratio: 1/1)'));
    expect(portrait).toMatch(
      /\.home-menu__modes\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(portrait).not.toMatch(/\.home-menu__mode--coreball\s*{[^}]*display:\s*none/);
  });
});
