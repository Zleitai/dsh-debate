import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDebateDefaults,
  normalizeDefaults,
  readDebateDefaults,
  writeDebateDefaults,
} from '../src/dsh/config-file.ts';
import type { HostFs } from '../src/dsh/config-file.ts';

function memoryFs(initial: Record<string, string> = {}): HostFs & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async readText(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async writeText(path, text) {
      files.set(path, text);
    },
  };
}

test('defaultDebateDefaults has sane values', () => {
  const d = defaultDebateDefaults();
  assert.equal(d.maxRounds, 3);
  assert.equal(d.requireHumanSignOff, true);
  assert.deepEqual(d.verificationTools, ['code-execution', 'fact-retrieval']);
  assert.deepEqual(d.roles, []);
});

test('normalizeDefaults drops malformed roles and clamps rounds', () => {
  const d = normalizeDefaults({
    roles: [
      { role: 'proposer', route: { provider: 'deepseek', model: 'v3' } },
      { role: 'bogus', route: { provider: 'x' } },
      { role: 'opponent' }, // missing route
    ],
    maxRounds: 0,
    requireHumanSignOff: false,
    verificationTools: ['code-execution', 'not-a-tool'],
  });
  assert.equal(d.roles.length, 1);
  assert.equal(d.roles[0].route.model, 'v3');
  assert.equal(d.maxRounds, 3);
  assert.equal(d.requireHumanSignOff, false);
  assert.deepEqual(d.verificationTools, ['code-execution']);
});

test('normalizeDefaults tolerates non-object input', () => {
  assert.deepEqual(normalizeDefaults(null), defaultDebateDefaults());
  assert.deepEqual(normalizeDefaults('x'), defaultDebateDefaults());
});

test('readDebateDefaults falls back to defaults when missing or corrupt', async () => {
  const fs = memoryFs();
  assert.deepEqual(await readDebateDefaults(fs, '.debate/config.json'), defaultDebateDefaults());

  fs.files.set('.debate/config.json', '{ not json');
  assert.deepEqual(await readDebateDefaults(fs, '.debate/config.json'), defaultDebateDefaults());
});

test('writeDebateDefaults then readDebateDefaults round-trips', async () => {
  const fs = memoryFs();
  await writeDebateDefaults(fs, '.debate/config.json', {
    roles: [{ role: 'proposer', route: { provider: 'deepseek' } }],
    maxRounds: 5,
    verificationTools: ['fact-retrieval'],
    requireHumanSignOff: true,
  });
  const read = await readDebateDefaults(fs, '.debate/config.json');
  assert.equal(read.maxRounds, 5);
  assert.equal(read.roles.length, 1);
  assert.equal(read.roles[0].route.provider, 'deepseek');
  assert.deepEqual(read.verificationTools, ['fact-retrieval']);
});
