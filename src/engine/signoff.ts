import type { SignOffState } from './types.ts';

/**
 * The human-held final authority. Output is never "done" until this is
 * `signed` (or signing is explicitly waived by the config).
 */
export interface SignOff {
  state: SignOffState;
  /** Final draft text, set when produced. */
  draft?: string;
  /** Free-form note: a sign-off note, or a rejection reason. */
  note?: string;
}

export const initialSignOff: SignOff = { state: 'draft' };

/** Record the produced final draft. */
export function produceDraft(current: SignOff, draft: string): SignOff {
  if (current.state === 'signed') throw new Error('cannot replace a signed draft');
  return { state: 'draft', draft };
}

/** Human accepts the draft as final. */
export function sign(current: SignOff, note?: string): SignOff {
  if (current.state === 'signed') throw new Error('already signed');
  if (current.draft === undefined) throw new Error('cannot sign: no draft produced');
  return { state: 'signed', draft: current.draft, ...(note !== undefined ? { note } : {}) };
}

/** Human rejects the draft; the run can be revised and re-presented. */
export function reject(current: SignOff, reason: string): SignOff {
  if (current.state === 'signed') throw new Error('cannot reject a signed draft');
  return { state: 'rejected', draft: current.draft, note: reason };
}

/** Return a rejected draft to the draft state so it can be revised. */
export function revise(current: SignOff): SignOff {
  if (current.state !== 'rejected') throw new Error('only a rejected draft can be revised');
  return { state: 'draft', draft: current.draft };
}
