import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjudicate,
  isComplete,
  phase,
  produceDraft,
  reject,
  revise,
  sign,
  start,
  submitRound,
} from '../src/engine/debate.ts';
import type { DebateConfig, Disagreement, RoundRecord } from '../src/engine/types.ts';

function config(requireHumanSignOff = true): DebateConfig {
  return {
    topic: 'Should AI own copyright?',
    roles: [
      { role: 'proposer', route: { provider: 'deepseek' } },
      { role: 'opponent', route: { provider: 'openai' } },
      { role: 'adjudicator', route: { provider: 'anthropic' } },
      { role: 'reviewer', route: { provider: 'anthropic' } },
      { role: 'drafter', route: { provider: 'gemini' } },
    ],
    maxRounds: 3,
    convergenceQuietRounds: 1,
    verificationTools: ['code-execution', 'fact-retrieval'],
    requireHumanSignOff,
  };
}

function round(round: number, introduced: string[]): RoundRecord {
  return {
    round,
    statements: [
      { role: 'proposer', round, content: 'statement', route: { provider: 'deepseek' }, introducedDisagreements: introduced },
      { role: 'opponent', round, content: 'rebuttal', route: { provider: 'openai' }, introducedDisagreements: [] },
    ],
  };
}

const disagreement: Disagreement = {
  id: 'd1',
  topic: 'Who owns the output?',
  stances: [
    { role: 'proposer', position: 'the human does' },
    { role: 'opponent', position: 'the model vendor does' },
  ],
  evidence: [],
  firstRound: 1,
};

test('start normalizes a valid config', () => {
  const debate = start(config());
  assert.equal(debate.discussion.round, 0);
  assert.equal(debate.signOff.state, 'draft');
  assert.equal(debate.verdict, undefined);
});

test('full happy path completes only after human sign-off', () => {
  let debate = start(config(true));

  debate = submitRound(debate, round(1, ['d1']), [disagreement]);
  debate = submitRound(debate, round(2, []), []);
  assert.equal(phase(debate), 'converged');

  debate = adjudicate(debate, 'The human owns the output.', [
    {
      id: 'd1',
      resolution: 'Resolved: copyright vests in the human author.',
      evidence: [
        {
          claim: 'US Copyright Office treats human authorship as required.',
          tool: 'fact-retrieval',
          status: 'passed',
          summary: 'USCO guidance requires human authorship for registration.',
          source: 'https://example.com/usco',
        },
      ],
    },
  ]);
  debate = produceDraft(debate, 'Final draft: ...');

  assert.equal(isComplete(debate), false, 'unsigned with sign-off required must not be complete');

  debate = sign(debate, 'approved');
  assert.equal(isComplete(debate), true);
});

test('completes without sign-off when explicitly waived', () => {
  let debate = start(config(false));
  debate = submitRound(debate, round(1, ['d1']), [disagreement]);
  debate = adjudicate(debate, 'verdict', [{ id: 'd1', resolution: 'resolved', evidence: [] }]);
  debate = produceDraft(debate, 'Final draft: ...');
  assert.equal(isComplete(debate), true);
});

test('unresolved disagreements prevent completion', () => {
  let debate = start(config(true));
  debate = submitRound(debate, round(1, ['d1']), [disagreement]);
  debate = adjudicate(debate, 'verdict', [{ id: 'd1', resolution: 'resolved', evidence: [] }]);

  // Introduce a second, unresolved disagreement via a fresh ledger entry.
  debate = submitRound(debate, round(2, ['d2']), [
    { id: 'd2', topic: 't', stances: [], evidence: [], firstRound: 2 },
  ]);
  debate = produceDraft(debate, 'draft');
  debate = sign(debate);

  assert.equal(isComplete(debate), false);
});

test('reject then revise restores a draft for another pass', () => {
  let debate = start(config(true));
  debate = produceDraft(debate, 'draft');
  debate = reject(debate, 'weak support');
  assert.equal(debate.signOff.state, 'rejected');
  debate = revise(debate);
  assert.equal(debate.signOff.state, 'draft');
});
