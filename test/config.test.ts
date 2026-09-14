import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distinctProviders,
  normalizeConfig,
  validateConfig,
} from '../src/engine/config.ts';
import type { DebateConfig } from '../src/engine/types.ts';

function makeConfig(overrides: Partial<DebateConfig> = {}): DebateConfig {
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
    verificationTools: ['code-execution', 'fact-retrieval'],
    requireHumanSignOff: true,
    ...overrides,
  };
}

test('a complete config validates clean', () => {
  assert.deepEqual(validateConfig(makeConfig()), []);
});

test('missing required role is reported', () => {
  const config = makeConfig();
  config.roles = config.roles.filter((a) => a.role !== 'reviewer');
  const problems = validateConfig(config);
  assert.ok(problems.some((p) => p.includes('reviewer')));
});

test('a single model route is rejected (multi-model is a hard rule)', () => {
  const config = makeConfig({
    roles: [
      { role: 'proposer', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'opponent', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'adjudicator', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'reviewer', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'drafter', route: { provider: 'opencode-go', model: 'glm-5.3' } },
    ],
  });
  const problems = validateConfig(config);
  assert.ok(problems.some((p) => p.includes('at least two distinct model routes')));
});

test('two vendors on one gateway count as two routes', () => {
  // GLM and DeepSeek both sit behind `opencode-go`; they must still qualify.
  const config = makeConfig({
    roles: [
      { role: 'proposer', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'opponent', route: { provider: 'opencode-go', model: 'deepseek-v4-flash' } },
      { role: 'adjudicator', route: { provider: 'opencode-go', model: 'glm-5.3' } },
      { role: 'reviewer', route: { provider: 'opencode-go', model: 'deepseek-v4-flash' } },
      { role: 'drafter', route: { provider: 'opencode-go', model: 'deepseek-v4-flash' } },
    ],
  });
  assert.deepEqual(validateConfig(config), []);
});

test('blank topic and bad maxRounds are reported', () => {
  const problems = validateConfig(makeConfig({ topic: '   ', maxRounds: 0 }));
  assert.ok(problems.some((p) => p.includes('topic')));
  assert.ok(problems.some((p) => p.includes('maxRounds')));
});

test('duplicate role assignment is reported', () => {
  const config = makeConfig();
  config.roles = [...config.roles, { role: 'proposer', route: { provider: 'gemini' } }];
  assert.ok(validateConfig(config).some((p) => p.includes('proposer')));
});

test('normalizeConfig applies defaults and trims the topic', () => {
  const config = makeConfig({ topic: '  T  ', convergenceQuietRounds: undefined });
  const normalized = normalizeConfig(config);
  assert.equal(normalized.topic, 'T');
  assert.equal(normalized.convergenceQuietRounds, undefined);
});

test('normalizeConfig throws on an invalid config', () => {
  assert.throws(() => normalizeConfig(makeConfig({ maxRounds: 0 })), /invalid debate config/);
});

test('distinctProviders deduplicates in role order', () => {
  assert.deepEqual(distinctProviders(makeConfig()), [
    'deepseek',
    'openai',
    'anthropic',
    'gemini',
  ]);
});
