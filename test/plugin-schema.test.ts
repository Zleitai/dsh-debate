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
function mountWithStubContext(options: { agent: boolean }): unknown[] {
  const registered: unknown[] = [];
  const ctx = {
    // An Agent is present only on the agent plane (a preset row). The host web
    // plane mount carries none.
    ...(options.agent ? { agent: { id: 'session-test' } } : {}),
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

test('the agent-plane mount registers all three tools with DSL-valid schemas', () => {
  const registered = mountWithStubContext({ agent: true });
  assert.equal(registered.length, 3, 'run_debate, debate_config and debate_sign must all register');

  const names = registered.map((tool) => (tool as { name?: string }).name);
  assert.deepEqual(names, ['run_debate', 'debate_config', 'debate_sign']);
});

test('the host web-plane mount registers nothing', () => {
  // The host web row exists only so `dsh-client-modules` discovers the package's
  // `dsh.client` declaration; registering the tools there would both expose them
  // to every session and collide with the agent-plane registration.
  assert.deepEqual(mountWithStubContext({ agent: false }), []);
});
