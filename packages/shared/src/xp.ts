import {
  CREDITS_PER_ROUND,
  CREDITS_PER_WIN,
  XP_CHALLENGE_COMPLETE,
  XP_MAX_NET_AREA_PERCENT,
  XP_MAX_TAGS_COUNTED,
  XP_PER_NET_AREA_PERCENT,
  XP_PER_TAG,
  XP_ROUND_COMPLETE,
  XP_WINNING_TEAM,
} from './constants.js';

export interface RoundContribution {
  tags: number;
  /** Net percentage of the paintable floor this player claimed. */
  netAreaPercent: number;
  won: boolean;
  completedRound: boolean;
  challengeCompleted?: boolean;
}

export interface RoundReward {
  xp: number;
  credits: number;
}

/**
 * XP for one round, with farming caps so a single player camping a repaint loop
 * cannot out-earn everyone else by an order of magnitude.
 */
export function computeRoundReward(contribution: RoundContribution): RoundReward {
  if (!contribution.completedRound) return { xp: 0, credits: 0 };

  const tags = Math.max(0, Math.min(XP_MAX_TAGS_COUNTED, Math.floor(contribution.tags)));
  const area = Math.max(0, Math.min(XP_MAX_NET_AREA_PERCENT, contribution.netAreaPercent));

  let xp = XP_ROUND_COMPLETE;
  if (contribution.won) xp += XP_WINNING_TEAM;
  xp += tags * XP_PER_TAG;
  xp += Math.floor(area * XP_PER_NET_AREA_PERCENT);
  if (contribution.challengeCompleted) xp += XP_CHALLENGE_COMPLETE;

  const credits = CREDITS_PER_ROUND + (contribution.won ? CREDITS_PER_WIN : 0);
  return { xp, credits };
}

/** Gently accelerating curve: rank 2 lands right after the first completed round. */
export function rankForXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.max(1, Math.floor(Math.sqrt(xp / 90)) + 1);
}

export function xpForRank(rank: number): number {
  if (rank <= 1) return 0;
  return (rank - 1) ** 2 * 90;
}

export function xpProgressToNextRank(xp: number): { rank: number; into: number; needed: number } {
  const rank = rankForXp(xp);
  const floor = xpForRank(rank);
  const ceiling = xpForRank(rank + 1);
  return { rank, into: xp - floor, needed: Math.max(1, ceiling - floor) };
}
