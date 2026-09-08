# dsh-debate

Multi-agent debate plugin for the DeepSeek Harness (DSH): a **multi-round convergence + final-draft review** pipeline with a **tool-verified adjudication defense line** and **per-role multi-vendor model routing**.

## What it does

- **Full debate pipeline** (not the one-round compressed variant): participants read each other's statements and critiques, revise their positions, converge, then adjudicate, and the adjudication result is itself re-reviewed before release.
- **Adjudication defense line**: contested claims are verified with real tools (code execution / fact retrieval), every open disagreement is tracked in a structured ledger, and a **human** retains final sign-off — the system never trusts the adjudicator to be right.
- **Multi-vendor routing**: each role (proposer / opponent / adjudicator / reviewer / drafter / cheap worker) is bound to its own provider+model, so a debate really does run across at least two independent vendors (recommend three vendors + one cheap model for drafts and summaries).
- **Configurable in the UI**: rounds and model routing are chosen at runtime, not hard-coded.

## Architecture

| Layer | Responsibility | Where |
| --- | --- | --- |
| Engine (pure) | Config validation, round/convergence state, disagreement ledger, evidence blocks, sign-off state machine | `src/engine/` |
| DSH adapter | Host tool `run_debate` (spawns subagents per role via `ctx.subagents` with `provider`/`model`), config persistence, client UI | to be added in later phases |

The engine is deliberately free of DSH dependencies so it can be unit-tested and CI'd without a live harness.

## Layout

```
src/
  engine/
    types.ts     # roles, routing, evidence, disagreements, sign-off, config
    config.ts    # validation / normalization of a debate configuration
    rounds.ts    # round bookkeeping and convergence detection
    ledger.ts    # disagreement ledger and evidence
    signoff.ts   # draft -> signed|rejected state machine
    debate.ts    # pure pipeline facade used by the future DSH adapter
    index.ts     # public exports
  index.ts
test/
  *.test.ts      # Node built-in test runner (no framework dependency)
```

## Development

Requires Node >= 24 (runs TypeScript natively via type stripping — no build step).

```sh
npm install     # installs typescript (typecheck only)
npm test        # node --test
npm run typecheck
```

> Note: currently only the pure engine (Phase 0–1) exists. The DSH Host tool and client UI (Phases 2–4) land next; see the project plan.
