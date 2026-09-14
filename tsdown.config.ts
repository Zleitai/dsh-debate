import { defineConfig } from 'tsdown';

// Two builds:
// 1. ESM + dts for the Host entries (`index`, `engine`) and for the client's
//    type declarations.
// 2. CJS for the client entry, which `scripts/wrap-client.mjs` then wraps in
//    `window.__ModuleLoader__.load({ id, factory })` — the format DSH's web
//    shell consumes for browser bundles.
const peer = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
];

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      client: 'src/client.ts',
      web: 'src/web.ts',
      engine: 'src/engine/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node24',
    outDir: 'lib',
    sourcemap: false,
    deps: { neverBundle: [...peer, 'react', 'react/jsx-runtime'] },
  },
  {
    entry: { client: 'src/client.ts' },
    format: ['cjs'],
    clean: false,
    target: 'node24',
    outDir: 'lib',
    sourcemap: false,
    deps: { neverBundle: [...peer, 'react', 'react/jsx-runtime'] },
  },
]);
