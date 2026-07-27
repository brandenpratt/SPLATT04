/**
 * Future economy seam — deliberately inert.
 *
 * The long-term product may layer non-transferable XP / Credits / League Points beneath a
 * separate, regulated transferable layer. Nothing here touches a chain, a wallet or a
 * payment rail, and the prototype ships only the two local implementations below.
 */

import { GuestProfile } from './types.js';

export interface XpEvent {
  guestId: string;
  amount: number;
  reason: 'round' | 'win' | 'tag' | 'area' | 'challenge';
  at: number;
}

export interface CreditEvent {
  guestId: string;
  amount: number;
  reason: 'round' | 'win' | 'purchase';
  at: number;
}

export interface RewardLedger {
  recordXp(event: XpEvent): Promise<void>;
  recordCredits(event: CreditEvent): Promise<void>;
}

/** Persistence seam so a database can replace localStorage without touching game code. */
export interface ProfileRepository {
  load(): Promise<GuestProfile | null>;
  save(profile: GuestProfile): Promise<void>;
  clear(): Promise<void>;
}

export class NullRewardLedger implements RewardLedger {
  async recordXp(): Promise<void> {}
  async recordCredits(): Promise<void> {}
}
