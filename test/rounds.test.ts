import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDiscussion,
  discussionPhase,
  hasConverged,
  introducedDisagreements,
  shouldContinue,
  submitRound,
} from '../src/engine/rounds.ts';
import type { DebateConfig, RoundRecord } from '../src/engine/types.ts';

const config: DebateConfig = {
  topic: 'topic',
  roles: [
    { role: 'proposer', route: { provider: 'a' } },
    { role: 'opponent', route: { provider: 'b' } },
    { role: 'adjudicator', route: { provider: 'c' } },
    { role: 'reviewer', route: { provider: 'c' } },
    { role: 'drafter', route: { provider: 'd' } },
  ],
  maxRounds: 3,
  convergenceQuietRounds: 1,
  verificationTools: [],
  requireHumanSignOff: true,
};

function record(round: number, introduced: string[]): RoundRecord {
  return {
    round,
    statements: [
      { role: 'proposer', round, content: 'x', route: { provider: 'a' }, introducedDisagreements: introduced },
    ],
  };
}

test('a new discussion starts at round 0', () => {
  const s = createDiscussion(config);
  assert.equal(s.round, 0);
  assert.deepEqual(s.history, []);
  assert.equal(hasConverged(s), false);
});

test('submitRound rejects out-of-order rounds', () => {
  const s = createDiscussion(config);
  assert.throws(() => submitRound(s, record(2, []), []), /round out of order/);
});

test('introducedDisagreements flattens statement ids', () => {
  assert.deepEqual(introducedDisagreements(record(1, ['a', 'b'])), ['a', 'b']);
});

test('converges after a quiet round with no new disagreement', () => {
  let s = createDiscussion(config);
  s = submitRound(s, record(1, ['a']), []);
  assert.equal(hasConverged(s), false);
  s = submitRound(s, record(2, []), []);
  assert.equal(hasConverged(s), true);
  assert.equal(shouldContinue(s), false);
  assert.equal(discussionPhase(s), 'converged');
});

test('hits round-cap when maxRounds is reached without converging', () => {
  let s = createDiscussion(config);
  s = submitRound(s, record(1, ['a']), []);
  s = submitRound(s, record(2, ['b']), []);
  s = submitRound(s, record(3, ['c']), []);
  assert.equal(hasConverged(s), false);
  assert.equal(shouldContinue(s), false);
  assert.equal(discussionPhase(s), 'round-cap');
});
