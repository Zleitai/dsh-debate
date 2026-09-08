import type { DebateConfig, Disagreement, EvidenceBlock, RoundRecord } from './types.ts';
import { normalizeConfig } from './config.ts';
import type { DebateDiscussion } from './rounds.ts';
import {
  createDiscussion,
  discussionPhase,
  hasConverged as discussionHasConverged,
  shouldContinue as shouldContinueDiscussion,
  submitRound as submitRoundToDiscussion,
} from './rounds.ts';
import { addEvidence, allDisagreementsResolved, resolveDisagreement } from './ledger.ts';
import * as signoff from './signoff.ts';
import type { SignOff } from './signoff.ts';

/**
 * One adjudicator disposition: how a single disagreement was verified and ruled.
 */
export interface AdjudicationDisposition {
  id: string;
  resolution: string;
  evidence?: readonly EvidenceBlock[];
}

/**
 * The complete, serializable state of one debate run. This is the pure core
 * the DSH adapter (Phase 2) drives: it produces round records by invoking
 * subagents per role, and calls these operations to fold the results in.
 */
export interface Debate {
  discussion: DebateDiscussion;
  signOff: SignOff;
  /** The adjudicator's overall verdict, absent until ruled. */
  verdict?: string;
}

export type { DebatePhase } from './rounds.ts';

/** Start a debate after validating and normalizing its configuration. */
export function start(config: DebateConfig): Debate {
  return { discussion: createDiscussion(normalizeConfig(config)), signOff: signoff.initialSignOff };
}

/** Fold one completed round's statements and disagreements into the run. */
export function submitRound(
  debate: Debate,
  record: RoundRecord,
  disagreements: readonly Disagreement[],
): Debate {
  return {
    ...debate,
    discussion: submitRoundToDiscussion(debate.discussion, record, disagreements),
  };
}

/** Apply the adjudicator's verdict and per-disagreement rulings + evidence. */
export function adjudicate(
  debate: Debate,
  verdict: string,
  dispositions: readonly AdjudicationDisposition[],
): Debate {
  let ledger = debate.discussion.ledger;
  for (const d of dispositions) {
    for (const e of d.evidence ?? []) ledger = addEvidence(ledger, d.id, e);
    ledger = resolveDisagreement(ledger, d.id, d.resolution);
  }
  return {
    ...debate,
    verdict,
    discussion: { ...debate.discussion, ledger },
  };
}

/** Record the reviewer-produced final draft. */
export function produceDraft(debate: Debate, draft: string): Debate {
  return { ...debate, signOff: signoff.produceDraft(debate.signOff, draft) };
}

/** Human accepts the final draft. */
export function sign(debate: Debate, note?: string): Debate {
  return { ...debate, signOff: signoff.sign(debate.signOff, note) };
}

/** Human rejects the final draft. */
export function reject(debate: Debate, reason: string): Debate {
  return { ...debate, signOff: signoff.reject(debate.signOff, reason) };
}

/** Return a rejected run to draft for revision. */
export function revise(debate: Debate): Debate {
  return { ...debate, signOff: signoff.revise(debate.signOff) };
}

export function hasConverged(debate: Debate): boolean {
  return discussionHasConverged(debate.discussion);
}

export function shouldContinue(debate: Debate): boolean {
  return shouldContinueDiscussion(debate.discussion);
}

export function phase(debate: Debate): ReturnType<typeof discussionPhase> {
  return discussionPhase(debate.discussion);
}

/**
 * A run is complete when it has a verdict, every disagreement is resolved,
 * a final draft exists, and the draft has been signed (or sign-off is waived).
 */
export function isComplete(debate: Debate): boolean {
  return (
    debate.verdict !== undefined &&
    debate.signOff.draft !== undefined &&
    allDisagreementsResolved(debate.discussion.ledger) &&
    (debate.signOff.state === 'signed' || !debate.discussion.config.requireHumanSignOff)
  );
}
