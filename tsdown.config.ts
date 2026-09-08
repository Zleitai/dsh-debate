import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    engine: 'src/engine/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node24',
  outDir: 'lib',
  sourcemap: false,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/schemastery',
  ],
});
