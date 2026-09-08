import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addEvidence,
  allDisagreementsResolved,
  mergeDisagreements,
  openDisagreements,
  resolveDisagreement,
} from '../src/engine/ledger.ts';
import type { Disagreement } from '../src/engine/types.ts';

function d(id: string, firstRound = 1, topic = `topic-${id}`): Disagreement {
  return {
    id,
    topic,
    stances: [{ role: 'proposer', position: 'yes' }],
    evidence: [],
    firstRound,
  };
}

test('mergeDisagreements inserts unknown ids', () => {
  const ledger = mergeDisagreements([], [d('a')]);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].id, 'a');
});

test('mergeDisagreements upserts and preserves the earliest firstRound', () => {
  const ledger = mergeDisagreements([d('a', 2)], [{ ...d('a', 5), stances: [{ role: 'opponent', position: 'no' }] }]);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].firstRound, 2);
  assert.equal(ledger[0].stances.length, 2);
});

test('mergeDisagreements keeps the latest stance per role', () => {
  const ledger = mergeDisagreements([d('a')], [d('a'), { ...d('a'), stances: [{ role: 'proposer', position: 'yes-REVISED' }] }]);
  const stance = ledger.find((x) => x.id === 'a')!.stances.find((s) => s.role === 'proposer');
  assert.equal(stance?.position, 'yes-REVISED');
});

test('evidence is de-duplicated by claim + tool', () => {
  const ev = { claim: 'c', tool: 'code-execution' as const, status: 'passed' as const, summary: 'ok' };
  const first = { ...d('a'), evidence: [ev] };
  const second = { ...d('a'), evidence: [ev] };
  const ledger = mergeDisagreements([first], [second]);
  assert.equal(ledger[0].evidence.length, 1);
});

test('resolveDisagreement sets the resolution and throws on unknown id', () => {
  const ledger = resolveDisagreement([d('a')], 'a', 'decided');
  assert.equal(ledger[0].resolution, 'decided');
  assert.throws(() => resolveDisagreement(ledger, 'nope', 'x'), /unknown disagreement id/);
});

test('addEvidence attaches an evidence block', () => {
  const ledger = addEvidence([d('a')], 'a', {
    claim: 'claim',
    tool: 'fact-retrieval',
    status: 'failed',
    summary: 'not found',
  });
  assert.equal(ledger[0].evidence.length, 1);
  assert.equal(ledger[0].evidence[0].status, 'failed');
});

test('open and all-disagreements-resolved reflect resolution state', () => {
  assert.equal(openDisagreements([d('a')]).length, 1);
  assert.equal(allDisagreementsResolved([d('a')]), false);
  const resolved = resolveDisagreement([d('a')], 'a', 'done');
  assert.equal(openDisagreements(resolved).length, 0);
  assert.equal(allDisagreementsResolved(resolved), true);
});
