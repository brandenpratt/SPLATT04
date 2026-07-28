import {
  ARENA_SLUG,
  INTERPOLATION_DELAY_MS,
  MarkerId,
  PlayerInput,
  PlayerRoundSummary,
  RoundEndMessage,
  ServerMessage,
  TeamId,
  applyDelta,
  decodeGrid,
  safeJsonParse,
  stepPlayer,
} from '@splat04/shared';
import { GameWorld } from './world.js';

export interface NetHandlers {
  onWelcome?: (info: {
    playerId: string;
    team: TeamId;
    roomId: string;
    crewCode?: string;
    challenge?: { id: string; scoreToBeat: number; createdByName: string };
    markerUnlocked: MarkerId[];
    botDifficulty: string;
    debugEnabled: boolean;
  }) => void;
  onRoundEnd?: (result: RoundEndMessage) => void;
  onCallout?: (text: string) => void;
  onTag?: (byLocal: boolean, onLocal: boolean) => void;
  /** A non-fatal saturation hit landed on the local player. */
  onHit?: (team: number, saturation: number) => void;
  onStatus?: (status: NetStatus) => void;
}

export type NetStatus = 'connecting' | 'open' | 'closed' | 'failed';

export interface NetOptions {
  guestId: string;
  displayName: string;
  marker: MarkerId;
  matchesCompleted: number;
  unlockAll: boolean;
  crewCode?: string;
  challengeId?: string;
}

const RECONNECT_TOKEN_KEY = 'splat04.reconnect';

/**
 * Authoritative client: sends compact inputs, predicts the local player locally, and
 * reconciles against the acknowledged input sequence. Server results always win.
 */
export class NetClient {
  private socket: WebSocket | null = null;
  private pending: PlayerInput[] = [];
  private seq = 0;
  private lastSendAt = 0;
  private pingAt = 0;
  private reconnectAttempts = 0;
  private closedByUs = false;
  private roomId = '';
  status: NetStatus = 'connecting';
  summaries: PlayerRoundSummary[] = [];

  constructor(
    private readonly world: GameWorld,
    private readonly options: NetOptions,
    private readonly handlers: NetHandlers = {},
  ) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closedByUs = false;
    this.setStatus('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      socket.send(
        JSON.stringify({
          t: 'hello',
          v: 1,
          guestId: this.options.guestId,
          displayName: this.options.displayName,
          marker: this.options.marker,
          matchesCompleted: this.options.matchesCompleted,
          unlockAll: this.options.unlockAll,
          crewCode: this.options.crewCode,
          challengeId: this.options.challengeId,
          reconnectToken: sessionStorage.getItem(RECONNECT_TOKEN_KEY) ?? undefined,
        }),
      );
      this.ping();
    };

    socket.onmessage = (event) => {
      const message = safeJsonParse(String(event.data)) as ServerMessage | null;
      if (message) this.handle(message);
    };

    socket.onclose = () => {
      this.world.connected = false;
      this.setStatus('closed');
      if (!this.closedByUs) this.scheduleReconnect();
    };

    socket.onerror = () => {
      // `onclose` always follows, which is where reconnection is handled.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= 5) {
      this.setStatus('failed');
      return;
    }
    const delay = Math.min(4000, 400 * 2 ** this.reconnectAttempts++);
    setTimeout(() => {
      if (!this.closedByUs) this.connect();
    }, delay);
  }

  private setStatus(status: NetStatus): void {
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  private handle(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome': {
        this.world.localId = message.playerId;
        this.world.localTeam = message.team;
        this.world.local.id = message.playerId;
        this.world.local.team = message.team;
        this.world.local.name = this.options.displayName;
        this.world.grid = decodeGrid(message.grid);
        this.world.gridVersion++;
        this.world.coverage = message.coverage;
        this.world.phase = message.phase;
        this.world.phaseEndsAt = message.phaseEndsAt;
        this.world.serverTimeOffset = message.serverTime - Date.now();
        this.world.connected = true;
        this.world.mode = 'online';
        this.world.saturation = 0;
        this.world.interpolationDelayMs = INTERPOLATION_DELAY_MS;
        this.roomId = message.roomId;
        sessionStorage.setItem(RECONNECT_TOKEN_KEY, message.reconnectToken);
        this.handlers.onWelcome?.({
          playerId: message.playerId,
          team: message.team,
          roomId: message.roomId,
          crewCode: message.crewCode,
          challenge: message.challenge,
          markerUnlocked: message.markerUnlocked,
          botDifficulty: message.botDifficulty,
          debugEnabled: message.debugEnabled === true,
        });
        break;
      }

      case 'snap': {
        const world = this.world;
        world.noteSnapshot(Date.now());
        world.ackedSeq = message.ack;
        world.coverage = message.coverage;
        world.phase = message.phase;
        world.phaseEndsAt = message.phaseEndsAt;
        // Smooth the clock rather than snapping, so interpolation does not judder.
        const observedOffset = message.st - Date.now();
        world.serverTimeOffset += (observedOffset - world.serverTimeOffset) * 0.1;

        if (message.delta.length > 0) {
          applyDelta(world.grid, message.delta);
          world.gridVersion++;
        }
        world.ingestPlayers(message.players, message.st);
        world.ingestProjectiles(message.projectiles, Date.now());
        if (message.self) {
          world.saturation = message.self.sat;
          world.shieldUntil = message.self.shield;
          this.reconcile(message.self, message.ack);
        }

        for (const event of message.events) {
          if (event.e === 'callout') this.handlers.onCallout?.(event.text);
          else if (event.e === 'cover') {
            world.addCoverSplat(event.x, event.z, event.tm, Date.now());
          } else if (event.e === 'tag') {
            this.handlers.onTag?.(event.by === world.localId, event.on === world.localId);
          } else if (event.e === 'hit' && event.on === world.localId) {
            world.lastHit = { team: event.tm, at: Date.now() };
            this.handlers.onHit?.(event.tm, event.sat);
          }
        }
        break;
      }

      case 'gridReset': {
        this.world.grid.fill(0);
        this.world.gridVersion++;
        this.world.coverSplats.length = 0;
        break;
      }

      case 'roundEnd': {
        this.summaries = message.summaries;
        this.handlers.onRoundEnd?.(message);
        break;
      }

      case 'pong': {
        this.world.latencyMs = Date.now() - message.time;
        break;
      }

      case 'error':
        console.warn('[splat04] server error', message.code, message.message);
        break;
    }
  }

  /**
   * Snap the local player to the authoritative state, then replay every input the
   * server has not acknowledged yet. Without this, prediction drifts on any packet loss.
   */
  private reconcile(
    self: NonNullable<Extract<ServerMessage, { t: 'snap' }>['self']>,
    ack: number,
  ): void {
    const local = this.world.local;
    local.x = self.x;
    local.z = self.z;
    local.vx = self.vx;
    local.vz = self.vz;
    local.alive = self.alive === 1;
    local.respawnAt = self.respawnAt;
    local.boostReadyAt = self.boostReadyAt;
    local.boostUntil = self.boostUntil;

    this.pending = this.pending.filter((input) => input.seq > ack);
    const step = 1 / 20;
    let simTime = this.world.now();
    for (const input of this.pending) {
      stepPlayer(local, input, step, { now: simTime, sampleOwner: this.world.sampleOwner });
      simTime += step * 1000;
    }
  }

  /** Called every frame with the current input; throttled to the send rate internally. */
  sendInput(input: Omit<PlayerInput, 'seq' | 'clientTime'>, nowLocal: number): PlayerInput {
    const full: PlayerInput = { ...input, seq: ++this.seq, clientTime: nowLocal };
    this.world.inputSeq = this.seq;
    if (input.firing) this.world.lastShotAt = nowLocal;
    if (this.connected && nowLocal - this.lastSendAt >= 1000 / 20) {
      this.lastSendAt = nowLocal;
      this.socket!.send(JSON.stringify({ t: 'input', input: full }));
      this.pending.push(full);
      if (this.pending.length > 40) this.pending.shift();
      if (nowLocal - this.pingAt > 2000) this.ping();
    }
    return full;
  }

  /**
   * Send a developer command. The server drops these unless it was started with
   * `SPLAT04_DEBUG=1`, so this is a request, never an instruction.
   */
  sendDebug(action: string, value?: string | number | boolean): void {
    if (!this.connected) return;
    this.socket!.send(JSON.stringify({ t: 'debug', action, value }));
  }

  private ping(): void {
    this.pingAt = Date.now();
    if (this.connected) this.socket!.send(JSON.stringify({ t: 'ping', time: Date.now() }));
  }

  updateOptions(patch: Partial<NetOptions>): void {
    Object.assign(this.options, patch);
  }

  get currentRoomId(): string {
    return this.roomId;
  }

  get arenaSlug(): string {
    return ARENA_SLUG;
  }

  close(): void {
    this.closedByUs = true;
    this.socket?.close();
    this.socket = null;
    this.world.connected = false;
  }
}
