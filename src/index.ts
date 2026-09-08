// Package entry: the Cordis plugin the harness loader composes, plus the
// pure engine surface re-exported for consumers who use the types directly.
export { name, inject, Config, apply } from './dsh/plugin.ts';
export type { PluginConfig } from './dsh/plugin.ts';
export { defaultDebateDefaults, readDebateDefaults } from './dsh/config-file.ts';
export type { DebateDefaults, HostFs } from './dsh/config-file.ts';
export * from './engine/index.ts';
