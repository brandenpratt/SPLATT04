import {
  CHALLENGE_TTL_MS,
  CREW_TTL_MS,
  Challenge,
  Crew,
  TeamId,
  generateCrewCode,
  generateToken,
} from '@splat04/shared';

/**
 * In-memory crew and challenge records with a TTL.
 *
 * Prototype-only: everything is lost on restart, and a multi-instance deployment would
 * hand out codes that only work on one node. Persistent crews need real storage — see
 * the README's next-steps list.
 */
export class EphemeralStore {
  private crews = new Map<string, Crew>();
  private challenges = new Map<string, Challenge>();

  constructor(private readonly now: () => number = Date.now) {}

  createCrew(roomId: string, team: TeamId): Crew {
    this.sweep();
    let code = generateCrewCode();
    // Collisions are possible with a 100-code namespace; re-roll then fall back to a suffix.
    for (let attempt = 0; attempt < 12 && this.crews.has(code); attempt++) {
      code = generateCrewCode();
    }
    if (this.crews.has(code)) code = `${code}-${Math.floor(Math.random() * 90 + 10)}`;

    const crew: Crew = {
      code,
      roomId,
      team,
      createdAt: this.now(),
      expiresAt: this.now() + CREW_TTL_MS,
    };
    this.crews.set(code, crew);
    return crew;
  }

  getCrew(code: string): Crew | null {
    const crew = this.crews.get(code);
    if (!crew) return null;
    if (crew.expiresAt <= this.now()) {
      this.crews.delete(code);
      return null;
    }
    return crew;
  }

  createChallenge(input: {
    scoreToBeat: number;
    createdByGuestId: string;
    createdByName: string;
    teamPreference?: TeamId;
  }): Challenge {
    this.sweep();
    const challenge: Challenge = {
      id: generateToken().slice(0, 10),
      arenaSlug: 'vice-estate-04',
      teamPreference: input.teamPreference,
      scoreToBeat: Math.max(0, Math.min(100, input.scoreToBeat)),
      createdByGuestId: input.createdByGuestId,
      createdByName: input.createdByName,
      expiresAt: this.now() + CHALLENGE_TTL_MS,
    };
    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  getChallenge(id: string): Challenge | null {
    const challenge = this.challenges.get(id);
    if (!challenge) return null;
    if (challenge.expiresAt <= this.now()) {
      this.challenges.delete(id);
      return null;
    }
    return challenge;
  }

  private sweep(): void {
    const now = this.now();
    for (const [code, crew] of this.crews) if (crew.expiresAt <= now) this.crews.delete(code);
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(id);
    }
  }

  get sizes(): { crews: number; challenges: number } {
    return { crews: this.crews.size, challenges: this.challenges.size };
  }
}
