import { describe, expect, it } from 'vitest';
import {
  ARENA_CENTRE,
  ARENA_HALF_DEPTH,
  ARENA_HALF_WIDTH,
  BOT_DIFFICULTIES,
  BOT_MAX_FOCUS_PER_HUMAN,
  BOT_TARGET_MEMORY_MS,
  OBJECTIVE_RADIUS,
  PLAYER_RADIUS,
  PlayerState,
  TeamId,
  createGrid,
  createPlayerState,
  grantSpawnShield,
  hasLineOfSight,
  isBlocked,
} from '@splat04/shared';
import { BotBrain, personalityFor } from './bots.js';

const grid = createGrid();
type Difficulty = 'chill' | 'arcade' | 'pro';

/**
 * Positions are searched for rather than hand-picked: the estate layout is expected to
 * keep changing, and a test that silently starts spawning players inside a planter
 * stops testing anything.
 */
function findSpot(
  predicate: (x: number, z: number) => boolean,
  step = 1.5,
): { x: number; z: number } {
  for (let z = -ARENA_HALF_DEPTH + 2; z < ARENA_HALF_DEPTH - 2; z += step) {
    for (let x = -ARENA_HALF_WIDTH + 2; x < ARENA_HALF_WIDTH - 2; x += step) {
      if (isBlocked(x, z, PLAYER_RADIUS + 0.6)) continue;
      if (predicate(x, z)) return { x, z };
    }
  }
  throw new Error('no position satisfied the predicate');
}

function brain(seed = 1234): BotBrain {
  return new BotBrain(personalityFor('xX_DARKMOM_Xx', 0), seed);
}

function ctx(
  now: number,
  players: PlayerState[],
  focus = new Map<string, number>(),
  difficulty: Difficulty = 'arcade',
) {
  return { now, grid, players, difficulty, focus } as const;
}

function bot(x: number, z: number, id = 'bot1', team: TeamId = TeamId.Cyan): PlayerState {
  return createPlayerState(id, 'Bot', team, true, { x, z });
}

function human(x: number, z: number, id = 'human1'): PlayerState {
  const p = createPlayerState(id, 'Human', TeamId.Magenta, false, { x, z });
  p.isBot = false;
  return p;
}

interface Sample {
  now: number;
  firing: boolean;
  target: string | null;
  engaging: boolean;
}

/** Run the brain for a stretch of simulated time at 20 Hz, recording what it did. */
function run(
  b: BotBrain,
  self: PlayerState,
  players: PlayerState[],
  fromMs: number,
  toMs: number,
  focus = new Map<string, number>(),
  difficulty: Difficulty = 'arcade',
): Sample[] {
  const samples: Sample[] = [];
  for (let now = fromMs; now <= toMs; now += 50) {
    const input = b.think(self, ctx(now, players, focus, difficulty), 0.05);
    samples.push({
      now,
      firing: input.firing,
      target: b.currentTargetId,
      // Only these modes route fire through the burst gate; the rest is route painting.
      engaging: b.currentTargetId !== null && ['hunt', 'defend', 'retreat'].includes(b.currentMode),
    });
    self.aimX = input.aimX;
    self.aimZ = input.aimZ;
  }
  return samples;
}

/** A pair of open positions roughly `gap` apart with clear line of sight between them. */
function openPair(gap: number): { a: { x: number; z: number }; b: { x: number; z: number } } {
  const a = findSpot(
    (x, z) =>
      !isBlocked(x + gap, z, PLAYER_RADIUS + 0.6) && hasLineOfSight(x, z, x + gap, z) && z > 18,
  );
  return { a, b: { x: a.x + gap, z: a.z } };
}

describe('bot line of sight', () => {
  it('never acquires a target it cannot see', () => {
    const self = bot(-6, 22);
    const hidden = findSpot(
      (x, z) => !hasLineOfSight(self.x, self.z, x, z) && Math.hypot(x - self.x, z - self.z) < 26,
    );
    const enemy = human(hidden.x, hidden.z);
    expect(hasLineOfSight(self.x, self.z, enemy.x, enemy.z)).toBe(false);

    const samples = run(brain(), self, [self, enemy], 0, 4000);
    expect(samples.every((s) => s.target === null)).toBe(true);
  });

  it('acquires the same target with a clear line of sight', () => {
    const { a, b } = openPair(11);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    expect(hasLineOfSight(self.x, self.z, enemy.x, enemy.z)).toBe(true);

    const samples = run(brain(), self, [self, enemy], 0, 2500);
    expect(samples.some((s) => s.target === 'human1')).toBe(true);
  });

  it('forgets a target that stays hidden past the memory window', () => {
    const { a, b } = openPair(11);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    const brainUnderTest = brain();
    run(brainUnderTest, self, [self, enemy], 0, 1500);
    expect(brainUnderTest.currentTargetId).toBe('human1');

    const hidden = findSpot((x, z) => !hasLineOfSight(self.x, self.z, x, z));
    enemy.x = hidden.x;
    enemy.z = hidden.z;
    run(brainUnderTest, self, [self, enemy], 1500, 1500 + BOT_TARGET_MEMORY_MS + 600);
    expect(brainUnderTest.currentTargetId).toBeNull();
  });
});

describe('bot reaction delay', () => {
  it('waits out a tier-appropriate delay after acquiring a target', () => {
    const { a, b } = openPair(11);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    const spec = BOT_DIFFICULTIES.arcade;
    const brainUnderTest = brain();

    let acquiredAt = -1;
    for (let now = 0; now <= 3000; now += 50) {
      brainUnderTest.think(self, ctx(now, [self, enemy]), 0.05);
      if (brainUnderTest.currentTargetId && acquiredAt < 0) acquiredAt = now;
    }

    expect(acquiredAt).toBeGreaterThanOrEqual(0);
    const delay = brainUnderTest.readyAt - acquiredAt;
    expect(delay).toBeGreaterThanOrEqual(spec.reactionMsMin);
    expect(delay).toBeLessThanOrEqual(spec.reactionMsMax);
  });

  it('reacts within a tighter window on Pro than on Chill', () => {
    const { a, b } = openPair(11);
    const measure = (difficulty: Difficulty) => {
      const self = bot(a.x, a.z);
      const enemy = human(b.x, b.z);
      const brainUnderTest = brain();
      for (let now = 0; now <= 4000; now += 50) {
        brainUnderTest.think(self, ctx(now, [self, enemy], new Map(), difficulty), 0.05);
        if (brainUnderTest.currentTargetId) return brainUnderTest.readyAt - now;
      }
      return Infinity;
    };
    expect(measure('pro')).toBeLessThan(measure('chill'));
  });
});

describe('bot burst discipline', () => {
  it('never holds continuous fire on a target', () => {
    const { a, b } = openPair(10);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    const samples = run(brain(), self, [self, enemy], 0, 8000);

    const engaged = samples.filter((s) => s.engaging);
    expect(engaged.length).toBeGreaterThan(10);

    // Longest unbroken run of engagement fire, in milliseconds.
    let longest = 0;
    let current = 0;
    for (const sample of engaged) {
      current = sample.firing ? current + 50 : 0;
      longest = Math.max(longest, current);
    }
    const spec = BOT_DIFFICULTIES.arcade;
    const maxBurstMs = spec.burstMax * 110;
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(maxBurstMs + 200);
  });
});

describe('bot target selection', () => {
  it('ignores spawn-shielded players', () => {
    const { a, b } = openPair(11);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    grantSpawnShield(enemy, 0);

    const brainUnderTest = brain();
    run(brainUnderTest, self, [self, enemy], 0, 1500);
    expect(brainUnderTest.currentTargetId).toBeNull();
  });

  it('respects the focus-fire cap on a human away from the objective', () => {
    const { a, b } = openPair(11);
    const self = bot(a.x, a.z);
    const enemy = human(b.x, b.z);
    expect(Math.hypot(enemy.x - ARENA_CENTRE.x, enemy.z - ARENA_CENTRE.z)).toBeGreaterThan(
      OBJECTIVE_RADIUS,
    );

    const brainUnderTest = brain();
    run(
      brainUnderTest,
      self,
      [self, enemy],
      0,
      2000,
      new Map([[enemy.id, BOT_MAX_FOCUS_PER_HUMAN]]),
    );
    expect(brainUnderTest.currentTargetId).toBeNull();
  });

  it('allows the cap to be exceeded for a human holding the objective', () => {
    // A spot on the objective, and a spot that can see it.
    const onObjective = findSpot(
      (x, z) => Math.hypot(x - ARENA_CENTRE.x, z - ARENA_CENTRE.z) < OBJECTIVE_RADIUS - 2,
    );
    const watcher = findSpot((x, z) => {
      const d = Math.hypot(x - onObjective.x, z - onObjective.z);
      return d > 6 && d < 18 && hasLineOfSight(x, z, onObjective.x, onObjective.z);
    });

    const self = bot(watcher.x, watcher.z);
    const enemy = human(onObjective.x, onObjective.z);
    const brainUnderTest = brain();
    run(
      brainUnderTest,
      self,
      [self, enemy],
      0,
      2500,
      new Map([[enemy.id, BOT_MAX_FOCUS_PER_HUMAN + 2]]),
    );
    expect(brainUnderTest.currentTargetId).toBe('human1');
  });

  it('gives a human no priority over an equally placed bot', () => {
    // A spot with clear, equal-length sightlines in both directions, so the only
    // difference between the two candidates is that one of them is human.
    const gap = 9;
    const centre = findSpot(
      (x, z) =>
        // Both candidates have to be inside the fence. Without this the scan happily
        // returns a corner behind a villa and places the two enemies out of bounds,
        // where nothing can be targeted and the test's premise no longer holds.
        Math.abs(x) + gap < ARENA_HALF_WIDTH - 2 &&
        !isBlocked(x - gap, z, PLAYER_RADIUS + 0.6) &&
        !isBlocked(x + gap, z, PLAYER_RADIUS + 0.6) &&
        hasLineOfSight(x, z, x - gap, z) &&
        hasLineOfSight(x, z, x + gap, z),
    );

    let humanPicks = 0;
    let botPicks = 0;
    for (let seed = 0; seed < 60; seed++) {
      const self = bot(centre.x, centre.z);
      const enemyHuman = human(centre.x - gap, centre.z);
      const enemyBot = bot(centre.x + gap, centre.z, 'bot2', TeamId.Magenta);
      const brainUnderTest = new BotBrain(personalityFor('WetRouter', seed), seed * 7919 + 13);
      run(brainUnderTest, self, [self, enemyHuman, enemyBot], 0, 800);
      if (brainUnderTest.currentTargetId === 'human1') humanPicks++;
      if (brainUnderTest.currentTargetId === 'bot2') botPicks++;
    }

    // Neither may dominate — the human must not be preferentially hunted.
    expect(humanPicks).toBeGreaterThan(0);
    expect(botPicks).toBeGreaterThan(0);
    expect(Math.abs(humanPicks - botPicks)).toBeLessThan(45);
  });
});
