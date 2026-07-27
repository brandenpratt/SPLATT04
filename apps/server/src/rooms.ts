import { ARENA_SLUG } from '@splat04/shared';
import { Room } from './room.js';
import { config } from './config.js';

/**
 * Continuous arenas. Quick Splat drops a guest into the fullest room that still has a
 * seat, so a small player population clusters together instead of scattering.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private sequence = 0;
  private timer: NodeJS.Timeout | null = null;
  private snapshotAccumulator = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Room for Quick Splat: the busiest joinable one, or a fresh room. */
  findOrCreateRoom(): Room {
    let best: Room | null = null;
    for (const room of this.rooms.values()) {
      if (!room.hasCapacityForHuman()) continue;
      if (!best || room.connectedHumanCount > best.connectedHumanCount) best = room;
    }
    return best ?? this.createRoom();
  }

  getRoom(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  /** Crew links must land everyone in the same room, creating it if it lapsed. */
  getOrCreateRoomById(id: string): Room {
    const existing = this.rooms.get(id);
    if (existing) return existing;
    const room = new Room(id, this.now);
    this.rooms.set(id, room);
    return room;
  }

  createRoom(): Room {
    const id = `${ARENA_SLUG}-${++this.sequence}`;
    const room = new Room(id, this.now);
    this.rooms.set(id, room);
    return room;
  }

  get all(): Room[] {
    return Array.from(this.rooms.values());
  }

  start(tickRate: number = config.tickRate, snapshotRate: number = config.snapshotRate): void {
    if (this.timer) return;
    const tickMs = 1000 / tickRate;
    const snapshotEvery = Math.max(1, Math.round(tickRate / snapshotRate));
    let last = this.now();

    this.timer = setInterval(() => {
      const current = this.now();
      // Clamp dt so a stalled event loop cannot teleport everyone across the arena.
      const dt = Math.min(0.25, Math.max(0.001, (current - last) / 1000));
      last = current;

      for (const room of this.rooms.values()) room.tick(dt);

      if (++this.snapshotAccumulator >= snapshotEvery) {
        this.snapshotAccumulator = 0;
        for (const room of this.rooms.values()) {
          room.broadcastSnapshot(config.maxDeltaCellsPerSnapshot);
        }
      }
      this.retireEmptyRooms();
    }, tickMs);

    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Keep one warm room; drop the rest once every human has gone. */
  private retireEmptyRooms(): void {
    if (this.rooms.size <= 1) return;
    for (const [id, room] of this.rooms) {
      if (room.humanCount === 0 && this.rooms.size > 1) this.rooms.delete(id);
    }
  }
}
