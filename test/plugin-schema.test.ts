import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/dsh/plugin.ts';

/**
 * `defineTool` validates every parameter schema against the harness value-schema
 * DSL at definition time, so mounting the plugin against a stub context proves
 * the schemas are accepted. This is the regression guard for the
 * `parameters.roles.items.required is not supported by the value schema DSL`
 * mount failure (nested `required: [...]` arrays are illegal; requiredness is a
 * per-property `required: true`).
 */
function mountWithStubContext(): unknown[] {
  const registered: unknown[] = [];
  const ctx = {
    tools: {
      register(tool: unknown) {
        registered.push(tool);
        return () => {};
      },
    },
  };
  apply(ctx as never, {
    subagentProvider: 'spawn',
    configPath: '.debate/config.json',
    maxRoundsCap: 10,
  });
  return registered;
}

test('applying the plugin registers both tools with DSL-valid schemas', () => {
  const registered = mountWithStubContext();
  assert.equal(registered.length, 2, 'run_debate and debate_config must both register');

  const names = registered.map((tool) => (tool as { name?: string }).name);
  assert.deepEqual(names, ['run_debate', 'debate_config']);
});
