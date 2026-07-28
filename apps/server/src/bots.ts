import {
  BOOST_COOLDOWN_MS,
  BOT_MAX_FOCUS_PER_HUMAN,
  BOT_SIGHT_RANGE,
  BOT_TARGET_MEMORY_MS,
  BOT_DIFFICULTIES,
  BotDifficulty,
  BotDifficultySpec,
  DEFAULT_BOT_DIFFICULTY,
  OBJECTIVE_RADIUS,
  PLAYER_RADIUS,
  ARENA_CENTRE,
  isShielded,
  BotMode,
  Lane,
  MARKER_IDS,
  MarkerId,
  NAV_NODES,
  NavNode,
  PaintOwner,
  PlayerInput,
  PlayerState,
  TeamId,
  cellIndex,
  colToWorld,
  hasLineOfSight,
  isBlocked,
  nearestNavNode,
  rowToWorld,
  segmentClear,
  worldToCol,
  worldToRow,
} from '@splat04/shared';
import { GRID_COLS, GRID_ROWS } from '@splat04/shared';

export interface BotPersonality {
  name: string;
  /** 0..1 — how eagerly it picks fights over painting. */
  aggression: number;
  preferredLane: Lane;
  marker: MarkerId;
  /** 0..1 chance per decision to spend boost crossing open ground. */
  boostiness: number;
  /**
   * Stable 0..1 position inside the active difficulty band. Keeps bots individually
   * distinct — one always reacts near the fast end, another near the slow end — without
   * letting any of them escape the tier.
   */
  bias: number;
}

const LANES: Lane[] = ['waterfront', 'fountain', 'party'];

/** Small, legible personality differences rather than one tuned optimum. */
export function personalityFor(name: string, index: number): BotPersonality {
  const seed = hashString(name);
  const rand = mulberry32(seed);
  return {
    name,
    aggression: 0.25 + rand() * 0.6,
    preferredLane: LANES[(index + seed) % LANES.length],
    marker: MARKER_IDS[Math.floor(rand() * MARKER_IDS.length)],
    boostiness: 0.15 + rand() * 0.5,
    bias: rand(),
  };
}

export interface BotContext {
  now: number;
  grid: Uint8Array;
  /** An array, not an iterator: the brain traverses this several times per think(). */
  players: readonly PlayerState[];
  /** Room-wide difficulty tier. */
  difficulty: BotDifficulty;
  /**
   * How many bots are already targeting each player id, computed by the room before
   * the think pass. Used to stop a pile-on: coordination has to live above the
   * individual brain, because no single bot can see what the others picked.
   */
  focus: ReadonlyMap<string, number>;
}

/** Muzzle offset must match `createProjectile`, or bots will shoot through their own cover. */
const MUZZLE_OFFSET = PLAYER_RADIUS + 0.35;

/**
 * Lightweight finite-state machine over the pre-validated nav lattice.
 * No per-frame pathfinding: a BFS runs only when the goal changes.
 */
export class BotBrain {
  mode: BotMode = 'paint-route';
  private path: NavNode[] = [];
  private goalId = -1;
  private nextDecisionAt = 0;
  private targetId: string | null = null;
  /** When this bot may first shoot at its current target (reaction delay). */
  private readyToFireAt = 0;
  /** Last moment the current target was actually visible. */
  private targetLastSeenAt = 0;
  /** Current burst window and the pause that follows it. */
  private burstUntil = 0;
  private burstResumeAt = 0;
  /** Aim is rotated toward the target at a capped rate rather than snapping. */
  private aimAngle = 0;
  private lastAimX = 1;
  private lastAimZ = 0;
  private seq = 0;
  private stuckSince = 0;
  private lastX = 0;
  private lastZ = 0;
  private aimWander = 0;
  private rand: () => number;

  constructor(
    readonly personality: BotPersonality,
    seed = Math.floor(Math.random() * 0xffffffff),
  ) {
    this.rand = mulberry32(seed);
  }

  /** Produce the same `PlayerInput` a human client would send. */
  think(self: PlayerState, ctx: BotContext, dtSeconds: number): PlayerInput {
    if (!self.alive) {
      this.path = [];
      this.goalId = -1;
      this.targetId = null;
      this.burstUntil = 0;
      return this.input(self, 0, 0, false, false);
    }

    // Perception runs every tick now; the reaction delay is what gates shooting, so a
    // coarse perception timer would only add a second, invisible source of latency.
    this.perceive(self, ctx);

    if (ctx.now >= this.nextDecisionAt) {
      this.nextDecisionAt = ctx.now + 500 + this.rand() * 700;
      this.decide(self, ctx);
    }

    this.detectStuck(self, ctx.now);

    const target = this.targetId ? findPlayer(ctx.players, this.targetId) : null;
    const { moveX, moveZ } = this.steer(self, ctx);
    const { aimX, aimZ, wantsFire } = this.aimAndFire(self, ctx, target, dtSeconds);

    const boost =
      this.mode === 'boost-reposition' &&
      ctx.now >= self.boostReadyAt &&
      this.rand() < this.personality.boostiness;

    this.lastAimX = aimX;
    this.lastAimZ = aimZ;
    return this.input(self, moveX, moveZ, wantsFire, boost, aimX, aimZ);
  }

  private input(
    self: PlayerState,
    moveX: number,
    moveZ: number,
    firing: boolean,
    boostPressed: boolean,
    aimX = this.lastAimX,
    aimZ = this.lastAimZ,
  ): PlayerInput {
    return {
      seq: ++this.seq,
      moveX,
      moveZ,
      aimX,
      aimZ,
      firing,
      boostPressed,
      selectedMarker: self.marker,
      clientTime: 0,
    };
  }

  private spec(ctx: BotContext): BotDifficultySpec {
    return BOT_DIFFICULTIES[ctx.difficulty] ?? BOT_DIFFICULTIES[DEFAULT_BOT_DIFFICULTY];
  }

  /** Roll a personality value inside the difficulty tier's band. */
  private band(ctx: BotContext, min: number, max: number): number {
    return min + (max - min) * this.personality.bias;
  }

  /** The point paintballs actually leave from. Line of sight must be checked from here. */
  private muzzle(self: PlayerState): { x: number; z: number } {
    return {
      x: self.x + Math.cos(this.aimAngle) * MUZZLE_OFFSET,
      z: self.z + Math.sin(this.aimAngle) * MUZZLE_OFFSET,
    };
  }

  private canSee(self: PlayerState, target: PlayerState): boolean {
    // From the muzzle, not the body centre — otherwise bots "see" around their own cover.
    const muzzle = this.muzzle(self);
    return (
      hasLineOfSight(muzzle.x, muzzle.z, target.x, target.z) &&
      hasLineOfSight(self.x, self.z, target.x, target.z)
    );
  }

  /**
   * Pick a target from distance, visibility and exposure plus a small random weight.
   *
   * Humans get no special priority — that is the whole point. Spawn-shielded players are
   * never chosen, and a human already covered by the focus cap is skipped unless they are
   * standing on the objective.
   */
  private perceive(self: PlayerState, ctx: BotContext): void {
    const previous = this.targetId;
    let best: PlayerState | null = null;
    let bestScore = -Infinity;

    for (const candidate of ctx.players) {
      if (!candidate.alive || candidate.team === self.team || candidate.id === self.id) continue;
      if (isShielded(candidate, ctx.now)) continue;

      const distance = Math.hypot(candidate.x - self.x, candidate.z - self.z);
      if (distance > BOT_SIGHT_RANGE) continue;
      if (!this.canSee(self, candidate)) continue;

      if (!candidate.isBot && candidate.id !== previous) {
        const onObjective =
          Math.hypot(candidate.x - ARENA_CENTRE.x, candidate.z - ARENA_CENTRE.z) <=
          OBJECTIVE_RADIUS;
        const alreadyFocused = ctx.focus.get(candidate.id) ?? 0;
        if (!onObjective && alreadyFocused >= BOT_MAX_FOCUS_PER_HUMAN) continue;
      }

      // Closer and more exposed targets score higher; the random weight stops every bot
      // on a team converging on the same pick.
      const exposure = 1 - areaOwnership(ctx.grid, candidate.x, candidate.z, 3, candidate.team);
      const score = 30 - distance + exposure * 6 + this.rand() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best) {
      if (best.id !== previous) {
        // Fresh acquisition: pay the reaction delay before this bot may shoot.
        const spec = this.spec(ctx);
        this.readyToFireAt = ctx.now + this.band(ctx, spec.reactionMsMin, spec.reactionMsMax);
        this.burstUntil = 0;
        this.burstResumeAt = 0;
      }
      this.targetId = best.id;
      this.targetLastSeenAt = ctx.now;
      return;
    }

    // Nothing visible: hold the old target briefly, then forget it entirely.
    if (previous && ctx.now - this.targetLastSeenAt > BOT_TARGET_MEMORY_MS) {
      this.targetId = null;
      this.burstUntil = 0;
    }
  }

  private decide(self: PlayerState, ctx: BotContext): void {
    const target = this.targetId ? findPlayer(ctx.players, this.targetId) : null;
    const nearbyEnemies = countEnemiesWithin(ctx.players, self, 12);
    const previousMode = this.mode;

    const hunting = this.spec(ctx).hunting;
    if (target && nearbyEnemies >= 3 && this.personality.aggression < 0.6) {
      this.mode = 'retreat';
    } else if (target && Math.hypot(target.x - self.x, target.z - self.z) < 16) {
      // Chill bots mostly keep painting even with someone in view.
      this.mode =
        this.rand() < this.personality.aggression * hunting + hunting * 0.4 ? 'hunt' : 'defend';
    } else {
      const ownHalfHeld = teamShareOfHalf(ctx.grid, self.team, ownHalfSign(self.team));
      if (ownHalfHeld < 0.35 && this.rand() < 0.6) this.mode = 'defend';
      else if (this.rand() < this.personality.boostiness * 0.5) this.mode = 'boost-reposition';
      else this.mode = 'paint-route';
    }

    if (this.mode !== previousMode || this.goalId < 0 || this.path.length === 0) {
      this.chooseGoal(self, ctx, target);
    }
  }

  private chooseGoal(self: PlayerState, ctx: BotContext, target: PlayerState | null): void {
    const start = nearestNavNode(self.x, self.z);
    let goal: NavNode;

    switch (this.mode) {
      case 'hunt':
        goal = target ? nearestNavNode(target.x, target.z) : this.paintGoal(self, ctx);
        break;
      case 'retreat':
        goal = nearestNavNode(ownHalfSign(self.team) * 34, self.z);
        break;
      case 'defend':
        goal = this.weakestOwnedNode(self, ctx);
        break;
      case 'boost-reposition':
      case 'paint-route':
      default:
        goal = this.paintGoal(self, ctx);
        break;
    }

    this.goalId = goal.id;
    this.path = findPath(start, goal);
  }

  /** Head for floor this team does not own, biased toward the enemy half and the preferred lane. */
  private paintGoal(self: PlayerState, ctx: BotContext): NavNode {
    const enemySign = -ownHalfSign(self.team);
    let best = NAV_NODES[0];
    let bestScore = -Infinity;
    for (const node of NAV_NODES) {
      const held = areaOwnership(ctx.grid, node.x, node.z, 4, self.team);
      let score = (1 - held) * 10;
      if (node.lane === this.personality.preferredLane) score += 3;
      // Push forward, but not so far that everyone abandons their own half.
      score += (node.x * enemySign) / 12;
      score -= Math.hypot(node.x - self.x, node.z - self.z) / 14;
      score += this.rand() * 2.5;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  private weakestOwnedNode(self: PlayerState, ctx: BotContext): NavNode {
    const sign = ownHalfSign(self.team);
    let best = NAV_NODES[0];
    let bestScore = -Infinity;
    for (const node of NAV_NODES) {
      if (Math.sign(node.x) !== sign && node.x !== 0) continue;
      const held = areaOwnership(ctx.grid, node.x, node.z, 4, self.team);
      const score = (1 - held) * 10 - Math.hypot(node.x - self.x, node.z - self.z) / 10;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  private steer(self: PlayerState, ctx: BotContext): { moveX: number; moveZ: number } {
    while (this.path.length > 0) {
      const next = this.path[0];
      if (Math.hypot(next.x - self.x, next.z - self.z) < 2.2) this.path.shift();
      else break;
    }
    if (this.path.length === 0) {
      this.chooseGoal(self, ctx, this.targetId ? findPlayer(ctx.players, this.targetId) : null);
      if (this.path.length === 0) return { moveX: 0, moveZ: 0 };
    }

    const waypoint = this.path[0];
    let dx = waypoint.x - self.x;
    let dz = waypoint.z - self.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;

    // The lattice edges are already collision-free, but players drift; nudge around
    // anything directly ahead rather than grinding along it.
    if (!segmentClear(self.x, self.z, self.x + dx * 2.5, self.z + dz * 2.5, 0.75)) {
      const angle = Math.atan2(dz, dx) + (this.rand() < 0.5 ? 0.9 : -0.9);
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    }
    return { moveX: dx, moveZ: dz };
  }

  /**
   * Rotate toward the target at a capped angular speed, add tier-scaled aim error, and
   * fire only in disciplined bursts from an unobstructed muzzle.
   */
  private aimAndFire(
    self: PlayerState,
    ctx: BotContext,
    target: PlayerState | null,
    dtSeconds: number,
  ): { aimX: number; aimZ: number; wantsFire: boolean } {
    const spec = this.spec(ctx);
    let desired = this.aimAngle;
    let engaging = false;

    if (target && (this.mode === 'hunt' || this.mode === 'defend' || this.mode === 'retreat')) {
      const lead = 0.12;
      desired = Math.atan2(
        target.z + target.vz * lead - self.z,
        target.x + target.vx * lead - self.x,
      );
      engaging = true;
    } else {
      // Paint ahead of the run so the bot skates through its own colour.
      const waypoint = this.path[0];
      if (Math.hypot(self.vx, self.vz) > 0.5) desired = Math.atan2(self.vz, self.vx);
      else if (waypoint) desired = Math.atan2(waypoint.z - self.z, waypoint.x - self.x);
    }

    // Capped turn: a bot cannot snap 180 degrees onto someone who just rounded a corner.
    let delta = desired - this.aimAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = ((spec.turnRateDegPerSecond * Math.PI) / 180) * dtSeconds;
    this.aimAngle += Math.max(-maxTurn, Math.min(maxTurn, delta));

    // Persistent, slowly drifting aim error rather than per-frame jitter.
    const errorDeg = this.band(ctx, spec.aimErrorDegMin, spec.aimErrorDegMax);
    this.aimWander += (this.rand() - 0.5) * 0.35;
    this.aimWander = Math.max(-1, Math.min(1, this.aimWander));
    const aimed = this.aimAngle + this.aimWander * ((errorDeg * Math.PI) / 180);

    const aimX = Math.cos(aimed);
    const aimZ = Math.sin(aimed);

    let wantsFire = false;

    if (engaging && target) {
      const settled = Math.abs(delta) < 0.5; // roughly on target
      const reacted = ctx.now >= this.readyToFireAt;
      const visible = this.canSee(self, target);
      if (visible) this.targetLastSeenAt = ctx.now;

      if (reacted && settled && visible) {
        if (ctx.now < this.burstUntil) {
          wantsFire = true;
        } else if (ctx.now >= this.burstResumeAt) {
          // Open a new burst window, then force a pause.
          const rounds = Math.round(this.band(ctx, spec.burstMin, spec.burstMax));
          const burstMs = Math.max(120, rounds * 110);
          this.burstUntil = ctx.now + burstMs;
          this.burstResumeAt =
            this.burstUntil + this.band(ctx, spec.burstCooldownMsMin, spec.burstCooldownMsMax);
          wantsFire = true;
        }
      }
    } else {
      // Painting: keep laying colour down, but never into a wall or onto own paint.
      wantsFire = true;
    }

    // Never fire with a blocked muzzle — this is what stops corner and wall shots.
    if (wantsFire) {
      const muzzle = this.muzzle(self);
      if (isBlocked(muzzle.x, muzzle.z, 0.05)) wantsFire = false;
      else if (
        !segmentClear(muzzle.x, muzzle.z, muzzle.x + aimX * 3.2, muzzle.z + aimZ * 3.2, 0.25)
      ) {
        wantsFire = false;
      }
    }

    // And do not waste paint on floor this team already owns.
    if (wantsFire && !engaging) {
      const ahead = 6;
      if (
        areaOwnership(ctx.grid, self.x + aimX * ahead, self.z + aimZ * ahead, 2, self.team) > 0.8
      ) {
        wantsFire = this.rand() < 0.2;
      }
    }

    return { aimX, aimZ, wantsFire };
  }

  private detectStuck(self: PlayerState, now: number): void {
    if (Math.hypot(self.x - this.lastX, self.z - this.lastZ) > 0.35) {
      this.lastX = self.x;
      this.lastZ = self.z;
      this.stuckSince = now;
      return;
    }
    if (this.stuckSince === 0) this.stuckSince = now;
    if (now - this.stuckSince > 1500) {
      // Wedged on a corner: drop the path and pick somewhere else entirely.
      this.path = [];
      this.goalId = -1;
      this.stuckSince = now;
      this.nextDecisionAt = 0;
    }
  }

  /** The room reads this to build its focus-fire map. */
  get currentTargetId(): string | null {
    return this.targetId;
  }

  /** Earliest moment this bot may shoot at its current target. Exposed for tests and debug. */
  get readyAt(): number {
    return this.readyToFireAt;
  }

  /** Current FSM state. Exposed for tests and the debug overlay. */
  get currentMode(): BotMode {
    return this.mode;
  }

  resetForRound(): void {
    this.path = [];
    this.goalId = -1;
    this.nextDecisionAt = 0;
    this.targetId = null;
    this.readyToFireAt = 0;
    this.targetLastSeenAt = 0;
    this.burstUntil = 0;
    this.burstResumeAt = 0;
    this.mode = 'paint-route';
  }
}

// --- helpers ---------------------------------------------------------------

export function ownHalfSign(team: TeamId): number {
  return team === TeamId.Cyan ? -1 : 1;
}

function findPlayer(players: readonly PlayerState[], id: string): PlayerState | null {
  for (const p of players) if (p.id === id) return p;
  return null;
}

function countEnemiesWithin(
  players: readonly PlayerState[],
  self: PlayerState,
  radius: number,
): number {
  let count = 0;
  for (const p of players) {
    if (!p.alive || p.team === self.team) continue;
    if (Math.hypot(p.x - self.x, p.z - self.z) <= radius) count++;
  }
  return count;
}

/** Fraction of paintable cells near (x, z) already owned by `team`. */
export function areaOwnership(
  grid: Uint8Array,
  x: number,
  z: number,
  radius: number,
  team: TeamId,
): number {
  const minCol = Math.max(0, worldToCol(x - radius));
  const maxCol = Math.min(GRID_COLS - 1, worldToCol(x + radius));
  const minRow = Math.max(0, worldToRow(z - radius));
  const maxRow = Math.min(GRID_ROWS - 1, worldToRow(z + radius));
  let owned = 0;
  let total = 0;
  for (let row = minRow; row <= maxRow; row += 2) {
    for (let col = minCol; col <= maxCol; col += 2) {
      const dx = colToWorld(col) - x;
      const dz = rowToWorld(row) - z;
      if (dx * dx + dz * dz > radius * radius) continue;
      total++;
      if (grid[cellIndex(col, row)] === (team as number as PaintOwner)) owned++;
    }
  }
  return total === 0 ? 1 : owned / total;
}

function teamShareOfHalf(grid: Uint8Array, team: TeamId, sign: number): number {
  let owned = 0;
  let total = 0;
  for (let row = 0; row < GRID_ROWS; row += 3) {
    for (let col = 0; col < GRID_COLS; col += 3) {
      const x = colToWorld(col);
      if (Math.sign(x) !== sign) continue;
      total++;
      if (grid[cellIndex(col, row)] === (team as number as PaintOwner)) owned++;
    }
  }
  return total === 0 ? 1 : owned / total;
}

/** Breadth-first search across the nav lattice. Runs only when a bot's goal changes. */
export function findPath(start: NavNode, goal: NavNode): NavNode[] {
  if (start.id === goal.id) return [goal];
  const cameFrom = new Map<number, number>();
  const queue: number[] = [start.id];
  const seen = new Set<number>([start.id]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === goal.id) break;
    for (const next of NAV_NODES[current].neighbours) {
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, current);
      queue.push(next);
    }
  }
  if (!seen.has(goal.id)) return [];

  const path: NavNode[] = [];
  let cursor: number | undefined = goal.id;
  while (cursor !== undefined && cursor !== start.id) {
    path.unshift(NAV_NODES[cursor]);
    cursor = cameFrom.get(cursor);
  }
  return path;
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { BOOST_COOLDOWN_MS };
