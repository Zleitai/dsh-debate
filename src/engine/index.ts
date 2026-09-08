// Public engine surface. The `debate.ts` facade owns the top-level operation
// names (start/submitRound/adjudicate/produceDraft/sign/reject/revise/...), so
// the lower-level modules are re-exported selectively to avoid ambiguity.
export * from './types.ts';
export * from './config.ts';
export * from './ledger.ts';
export { createDiscussion, introducedDisagreements, discussionPhase } from './rounds.ts';
export type { DebateDiscussion } from './rounds.ts';
export { initialSignOff } from './signoff.ts';
export type { SignOff } from './signoff.ts';
export * from './debate.ts';
