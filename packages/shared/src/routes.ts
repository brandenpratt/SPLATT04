import { ARENA_SLUG } from './constants.js';
import { sanitiseCrewCode, sanitiseId } from './protocol.js';

export type Route =
  | { kind: 'boot' }
  | { kind: 'arena'; slug: string }
  | { kind: 'crew'; code: string }
  | { kind: 'challenge'; id: string }
  /** Isolated art-review scene for the Blender kit. Never part of the match flow. */
  | { kind: 'art-review'; arena: string }
  | { kind: 'unknown' };

/**
 * Every route renders the same SPA; this only decides how the client enters the arena.
 *   /                    instant target-range boot flow
 *   /play/vice-estate-04 direct arena entry
 *   /c/:crewCode         crew link entry
 *   /challenge/:id       challenge entry with a score target
 */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'boot' };

  if (parts[0] === 'play') {
    const slug = (parts[1] ?? '').toLowerCase();
    // Only one arena ships in the prototype; an unknown slug is not a valid arena route.
    if (slug === '' || slug === ARENA_SLUG) return { kind: 'arena', slug: ARENA_SLUG };
    return { kind: 'unknown' };
  }
  if (parts[0] === 'art-review') {
    const arena = (parts[1] ?? '').toLowerCase();
    if (arena === '' || arena === 'vice-estate')
      return { kind: 'art-review', arena: 'vice-estate' };
    return { kind: 'unknown' };
  }
  if (parts[0] === 'c') {
    const code = sanitiseCrewCode(parts[1]);
    return code ? { kind: 'crew', code } : { kind: 'unknown' };
  }
  if (parts[0] === 'challenge') {
    const id = sanitiseId(parts[1], 32);
    return id ? { kind: 'challenge', id } : { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

export function crewUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/c/${code}`;
}

export function challengeUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, '')}/challenge/${id}`;
}

export function arenaUrl(origin: string, slug: string = ARENA_SLUG): string {
  return `${origin.replace(/\/$/, '')}/play/${slug}`;
}

export function artReviewUrl(origin: string, arena = 'vice-estate'): string {
  return `${origin.replace(/\/$/, '')}/art-review/${arena}`;
}
