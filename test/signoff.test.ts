import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialSignOff,
  produceDraft,
  reject,
  revise,
  sign,
} from '../src/engine/signoff.ts';

test('sign requires a produced draft', () => {
  assert.throws(() => sign(initialSignOff), /no draft produced/);
});

test('draft -> signed requires sign-off', () => {
  const withDraft = produceDraft(initialSignOff, 'final text');
  assert.equal(withDraft.state, 'draft');
  const signed = sign(withDraft, 'lgtm');
  assert.equal(signed.state, 'signed');
  assert.equal(signed.draft, 'final text');
  assert.equal(signed.note, 'lgtm');
});

test('a signed draft cannot be re-signed or replaced', () => {
  const signed = sign(produceDraft(initialSignOff, 'x'));
  assert.throws(() => sign(signed), /already signed/);
  assert.throws(() => produceDraft(signed, 'y'), /cannot replace a signed draft/);
});

test('reject then revise returns to draft', () => {
  const withDraft = produceDraft(initialSignOff, 'final text');
  const rejected = reject(withDraft, 'not good enough');
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.note, 'not good enough');
  const revised = revise(rejected);
  assert.equal(revised.state, 'draft');
  assert.equal(revised.draft, 'final text');
});

test('revise only applies to a rejected draft', () => {
  assert.throws(() => revise(produces('x')), /only a rejected draft/);
});

function produces(text: string) {
  return produceDraft(initialSignOff, text);
}
