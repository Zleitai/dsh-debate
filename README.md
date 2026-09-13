# dsh-debate

Multi-agent debate plugin for the DeepSeek Harness (DSH): a **multi-round convergence + final-draft review** pipeline with a **tool-verified adjudication defense line** and **per-role multi-vendor model routing**.

## What it does

- **Full debate pipeline** (not the one-round compressed variant): participants read each other's statements and critiques, revise their positions, converge, then adjudicate, and the adjudication result is itself re-reviewed before release.
- **Adjudication defense line**: contested claims are verified with real tools (code execution / fact retrieval), every open disagreement is tracked in a structured ledger, and a **human** retains final sign-off — the system never trusts the adjudicator to be right.
- **Multi-vendor routing**: each role (proposer / opponent / adjudicator / reviewer / drafter / cheap worker) is bound to its own provider+model, so a debate really runs across at least two independent vendors (recommend three vendors + one cheap model for drafts and summaries).
- **Configurable in the UI**: rounds and model routing are chosen at runtime and persisted to `.debate/config.json`, not hard-coded.

## Architecture

| Layer | Responsibility | Where |
| --- | --- | --- |
| Engine (pure) | Config validation, round/convergence state, disagreement ledger, evidence blocks, sign-off state machine | `src/engine/` |
| Host adapter | `run_debate` / `debate_config` model tools; spawns per-role subagents via `ctx.subagents` with `provider`/`model` | `src/dsh/plugin.ts` |
| Client UI | Config panel, composer capsule, run card, sign-off control | `src/client.ts` |

The engine is deliberately free of DSH dependencies so it can be unit-tested and CI'd without a live harness.

## Layout

```
src/
  engine/        # pure, dependency-free debate core
    types.ts config.ts rounds.ts ledger.ts signoff.ts debate.ts index.ts
  dsh/
    config-file.ts   # .debate/config.json persistence (injected fs)
    plugin.ts        # Host cordis plugin: run_debate + debate_config tools
  client.ts           # Client cordis plugin: slots UI + sign-off control
  index.ts            # package entry (Host plugin + engine re-exports)
test/                 # Node built-in test runner
```

## Install

### Option A — from the npm registry (once published)

```sh
dsh plugin --profile <name> add dsh-debate
# or, in any npm project:
npm install dsh-debate
```

### Option B — straight from GitHub (no npm account/publish needed)

```sh
npm install git+https://github.com/Zleitai/dsh-debate.git
```

The package's `prepare` script builds `lib/` automatically during a git
install, so no manual build step is needed. In a DSH deployment, add the same
git URL to the project dependencies, then add the composition rows below.

> The `@deepseek-ai/*` runtime packages are regular `dependencies` (pinned to
> `0.1.2-rc.1`, the harness line they were built against), so installers that
> do not auto-install peer dependencies (e.g. DSH profiles managed by pnpm)
> get a working tree out of the box. When the deployment upgrades its harness
> line, bump these pins and release a new patch version.

### Compose the Host tool (agent preset)

Add one loose row to your agent preset's `agent.cordis.yml` (it publishes no
service, so it needs no `isolate` realm):

```yaml
- id: tool-debate
  name: dsh-debate
  config:
    subagentProvider: spawn        # the ctx.subagents provider that spawns each role
    configPath: .debate/config.json
    maxRoundsCap: 10
```

### Compose the Client UI (host web plane)

Add the client entry to the deployment's web composition:

```yaml
- id: debate-client
  name: dsh-debate/client
```

## Usage

1. Configure roles and rounds in the "多智能体辩论" panel (settings section or
   the composer dock), or by calling the `debate_config` tool.
2. Ask the agent to run a debate: it calls `run_debate { topic }`, which
   converges over the configured roles/vendors and returns a **draft** +
   disagreement ledger + verdict.
3. With sign-off enabled (default), accept or reject the draft in the run card.
   A rejected draft can be revised and re-presented.

## Development

Requires Node >= 24 (tests run TypeScript natively via type stripping).

```sh
npm install
npm test           # node --test
npm run typecheck  # tsc --noEmit
npm run build      # tsdown -> lib/*.mjs + *.d.mts
```

> Publish notes: `npm run build` emits `lib/` (gitignored). Publish with
> `npm publish --access public` after setting your git identity and a git
> remote; the `peerDependencies` carry the `@deepseek-ai/dsh-*` runtime contract
> (resolved from the `next` npm dist-tag, e.g. `0.1.2-rc.1`).
