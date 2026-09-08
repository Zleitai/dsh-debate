/**
 * Core domain types for the debate pipeline.
 *
 * Everything here is erasable-syntax TypeScript so the engine runs directly
 * on Node >= 24 without a build step, and is free of any DSH dependency.
 */

/** Fixed pipeline roles plus a budget worker for drafts/summaries. */
export type RoleName =
  | 'proposer'
  | 'opponent'
  | 'adjudicator'
  | 'reviewer'
  | 'drafter'
  | 'cheap';

/** Where a role's model runs: a provider id and an optional model override. */
export interface ModelRoute {
  provider: string;
  model?: string;
}

/** Binds one role to the model that answers for it. */
export interface RoleAssignment {
  role: RoleName;
  route: ModelRoute;
}

/** Supported verification instruments behind the adjudication defense line. */
export type VerificationTool = 'code-execution' | 'fact-retrieval';

export type VerificationStatus = 'passed' | 'failed' | 'unverified';

/** One auditable verification result tied to a contested claim. */
export interface EvidenceBlock {
  claim: string;
  tool: VerificationTool;
  status: VerificationStatus;
  /** Summarized result: output snippet, citation, or command outcome. */
  summary: string;
  /** Provenance: URL, file path, or command that produced `summary`. */
  source?: string;
}

/** One side's position on a contested point. */
export interface Stance {
  role: RoleName;
  position: string;
}

/**
 * A point of substantive disagreement, tracked until the adjudicator rules
 * on it. `resolution` stays absent until a verdict and evidence are assigned.
 */
export interface Disagreement {
  id: string;
  topic: string;
  stances: Stance[];
  evidence: EvidenceBlock[];
  resolution?: string;
  /** Round in which the disagreement first appeared. */
  firstRound: number;
}

/** Whether the human has accepted the final draft. */
export type SignOffState = 'draft' | 'signed' | 'rejected';

/** One role's output within a round. */
export interface RoundStatement {
  role: RoleName;
  round: number;
  content: string;
  /** Provenance: which provider/model produced this statement. */
  route: ModelRoute;
  /** Ids of disagreements introduced by this statement. */
  introducedDisagreements: string[];
}

/** Everything one round produced. */
export interface RoundRecord {
  round: number;
  statements: RoundStatement[];
}

export interface DebateConfig {
  topic: string;
  roles: RoleAssignment[];
  /** Absolute hard cap on discussion rounds (excludes adjudication/review). */
  maxRounds: number;
  /**
   * Consecutive rounds with no new disagreement after which discussion is
   * considered converged. Defaults to 1.
   */
  convergenceQuietRounds?: number;
  /** Instruments the adjudicator may use to verify contested claims. */
  verificationTools: VerificationTool[];
  /** Require human sign-off before a final answer is released. */
  requireHumanSignOff: boolean;
}
