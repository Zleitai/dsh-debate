import type { DebateConfig, Disagreement, RoundRecord } from './types.ts';
import { mergeDisagreements } from './ledger.ts';

/** The discussion portion of a debate run: rounds plus the disagreement ledger. */
export interface DebateDiscussion {
  config: DebateConfig;
  /** Completed discussion rounds (0 before the first). */
  round: number;
  history: RoundRecord[];
  ledger: Disagreement[];
}

export function createDiscussion(config: DebateConfig): DebateDiscussion {
  return { config, round: 0, history: [], ledger: [] };
}

/** Disagreement ids introduced by a round's statements, in statement order. */
export function introducedDisagreements(record: RoundRecord): string[] {
  return record.statements.flatMap((s) => s.introducedDisagreements);
}

/** Append a round and fold its disagreements into the ledger. */
export function submitRound(
  state: DebateDiscussion,
  record: RoundRecord,
  disagreements: readonly Disagreement[],
): DebateDiscussion {
  if (record.round !== state.round + 1) {
    throw new Error(`round out of order: expected ${state.round + 1}, got ${record.round}`);
  }
  return {
    ...state,
    round: record.round,
    history: [...state.history, record],
    ledger: mergeDisagreements(state.ledger, disagreements),
  };
}

/**
 * True when the last `convergenceQuietRounds` rounds introduced no new
 * disagreement — i.e. positions have stopped diverging.
 */
export function hasConverged(state: DebateDiscussion): boolean {
  const quiet = state.config.convergenceQuietRounds ?? 1;
  if (state.round === 0) return false;
  const recent = state.history.slice(-quiet);
  if (recent.length < quiet) return false;
  return recent.every((record) => introducedDisagreements(record).length === 0);
}

/** Whether another discussion round should run. */
export function shouldContinue(state: DebateDiscussion): boolean {
  return !hasConverged(state) && state.round < state.config.maxRounds;
}

export type DebatePhase = 'ongoing' | 'converged' | 'round-cap';

/** Why discussion has stopped producing rounds. */
export function discussionPhase(state: DebateDiscussion): DebatePhase {
  if (hasConverged(state)) return 'converged';
  if (state.round >= state.config.maxRounds) return 'round-cap';
  return 'ongoing';
}
