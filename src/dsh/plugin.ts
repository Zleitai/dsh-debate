import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SubagentRun, SubagentStartRequest } from '@deepseek-ai/dsh-subagent';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  start,
  shouldContinue,
  submitRound,
  adjudicate,
  produceDraft,
} from '../engine/debate.ts';
import { sign, reject } from '../engine/signoff.ts';
import type { SignOff } from '../engine/signoff.ts';
import { normalizeConfig } from '../engine/config.ts';
import { openDisagreements } from '../engine/ledger.ts';
import type { DebateConfig, Disagreement, RoleAssignment } from '../engine/types.ts';
import {
  readDebateDefaults,
  defaultDebateDefaults,
} from './config-file.ts';
import type { DebateDefaults, HostFs } from './config-file.ts';

export const name = 'dsh-debate';

export const inject = ['tools', 'subagents'];

/** Runtime configuration of this plugin instance (validated by the harness loader). */
export interface PluginConfig {
  subagentProvider: string;
  configPath: string;
  maxRoundsCap: number;
  /** When false (the host web-plane row), register nothing and only carry the `dsh.client` declaration. */
  registerTools: boolean;
}

export const Config = z.object({
  /** Which `ctx.subagents` provider spawns each role's one-shot child. */
  subagentProvider: z.string().default('spawn'),
  /** Workspace-relative path of the persisted defaults file. */
  configPath: z.string().default('.debate/config.json'),
  /** Hard cap on discussion rounds, even when the persisted config asks for more. */
  maxRoundsCap: z.number().step(1).min(1).default(10),
  /** The host web-plane row sets this false: it exists only to expose the browser bundle. */
  registerTools: z.boolean().default(true),
});

const ROLE_DESCRIPTIONS: Record<RoleAssignment['role'], string> = {
  proposer: 'argue FOR the proposition',
  opponent: 'argue AGAINST the proposition',
  adjudicator: 'weigh both sides and issue a verdict',
  reviewer: 'stress-test the adjudicator verdict for errors or gaps',
  drafter: 'produce the final answer text',
  cheap: 'produce quick drafts and summaries',
};

/** Faithfully extract plain text from an LLM content block array. */
function outputText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => (b as { text: string }).text)
    .join('');
}

interface ParticipantOpinion {
  position: string;
  disagreements?: { topic: string; position: string }[];
}

function asOpinion(value: unknown): ParticipantOpinion {
  if (typeof value !== 'object' || value === null) return { position: '' };
  const v = value as Record<string, unknown>;
  const disagreements: { topic: string; position: string }[] = [];
  if (Array.isArray(v.disagreements)) {
    for (const item of v.disagreements) {
      if (typeof item !== 'object' || item === null) continue;
      const it = item as Record<string, unknown>;
      if (typeof it.topic === 'string' && typeof it.position === 'string') {
        disagreements.push({ topic: it.topic, position: it.position });
      }
    }
  }
  return {
    position: typeof v.position === 'string' ? v.position : '',
    disagreements,
  };
}

const PARTICIPANT_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  properties: {
    position: { type: 'string', description: 'Your full statement for this round.' },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          position: { type: 'string' },
        },
        required: ['topic', 'position'],
        additionalProperties: false,
      },
    },
  },
  required: ['position'],
  additionalProperties: false,
};

type SubagentStart = (name: string, request: SubagentStartRequest) => Promise<SubagentRun>;

/** Spawn one role's one-shot child and collect its settled text + structured opinion. */
async function runRole(
  subagents: { start: SubagentStart },
  provider: string,
  role: RoleAssignment,
  prompt: string,
  parent: Agent,
  signal: AbortSignal,
): Promise<{ role: RoleAssignment['role']; text: string; opinion: ParticipantOpinion }> {
  const run = await subagents.start(provider, {
    label: `debate-${role.role}`,
    prompt: [{ type: 'text', text: prompt }],
    parent,
    signal,
    agentOptions: {
      provider: role.route.provider,
      ...(role.route.model !== undefined ? { model: role.route.model } : {}),
    },
    outputSchema: PARTICIPANT_SCHEMA,
  });
  const [settled] = await Promise.allSettled([run.result]);
  let text = '';
  let opinion: ParticipantOpinion = { position: '' };
  if (settled.status === 'fulfilled') {
    text = outputText(settled.value.output);
    opinion = asOpinion(settled.value.structured);
    if (opinion.position.length === 0) opinion = { ...opinion, position: text };
  } else {
    text = `[role ${role.role} failed]`;
  }
  await run.dispose().catch(() => {});
  return { role: role.role, text, opinion };
}

function buildRoundPrompt(
  role: RoleAssignment,
  topic: string,
  roundNumber: number,
  prior: string,
): string {
  const priorBlock = prior.length > 0 ? `\n\nPrior discussion so far:\n${prior}` : '';
  return (
    `You are a debate participant. Your role: ${ROLE_DESCRIPTIONS[role.role]}. ` +
    `Topic: "${topic}" (round ${roundNumber}).\n` +
    `Read and respond to the other participants' statements, either holding your position ` +
    `with sharper support or revising it when they make a stronger point. ` +
    `List every NEW substantive disagreement you have (topic + your position).` +
    priorBlock
  );
}

/**
 * Map the tool's flat wire shape (`{ role, provider, model }`) to the engine's
 * nested {@link RoleAssignment} shape (`{ role, route: { provider, model } }`).
 * Returns `undefined` for an absent/empty/unusable list so callers fall back to
 * the persisted defaults.
 */
function toRoleAssignments(input: unknown): RoleAssignment[] | undefined {
  if (!Array.isArray(input) || input.length === 0) return undefined;
  const assignments: RoleAssignment[] = [];
  for (const entry of input) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.role !== 'string' || typeof e.provider !== 'string') continue;
    assignments.push({
      role: e.role as RoleAssignment['role'],
      route: {
        provider: e.provider,
        ...(typeof e.model === 'string' && e.model.length > 0 ? { model: e.model } : {}),
      },
    });
  }
  return assignments.length > 0 ? assignments : undefined;
}

/** Build a valid DebateConfig from persisted defaults + this run's overrides. */
function debateConfigFrom(
  defaults: DebateDefaults,
  args: { topic: string; rounds?: number; roles?: RoleAssignment[] },
  cap: number,
): DebateConfig {
  const roles = args.roles !== undefined && args.roles.length > 0 ? args.roles : defaults.roles;
  const requestedRounds = typeof args.rounds === 'number' ? args.rounds : defaults.maxRounds;
  return normalizeConfig({
    topic: args.topic,
    roles,
    maxRounds: Math.min(requestedRounds, cap),
    convergenceQuietRounds: defaults.convergenceQuietRounds,
    verificationTools: defaults.verificationTools,
    requireHumanSignOff: defaults.requireHumanSignOff,
  });
}

export function apply(ctx: Context, config: PluginConfig): void {
  // This package is mounted TWICE, on purpose:
  //
  //  - On the host web plane (a loose row in the profile composition) it exists
  //    only so `dsh-client-modules` — which scans HOST Loader entries and keys
  //    them by BARE package name — discovers the `dsh.client` declaration and
  //    serves the browser bundle for the panel. That mount has no Agent, and it
  //    must NOT register the debate tools: they belong to the agent plane, and
  //    a second registration of the same tool name collides.
  //  - On the agent plane (the preset row) it registers `run_debate`,
  //    `debate_config`, and `debate_sign` for that session.
  //
  // A subpath row (`dsh-debate/web`) would NOT work: client-modules rejects any
  // specifier containing "/" that is not a bare "@scope/name".
  //
  // Important: do not key off `ctx.agent` here. A preset's standing mount has no
  // Agent at apply time either (tools register into the preset's scoped layer
  // directly); that check silently disabled the tools in every debate session.
  if (config.registerTools === false) return;

  // Persistence is resolved against the SESSION's working directory (the agent's
  // `session.header.cwd`), not `process.cwd()` — the latter is the host process's
  // cwd and would write the config somewhere the session never reads.
  const workspaceFsFor = (cwd: string): HostFs => ({
    async readText(rel) {
      try {
        return await fsPromises.readFile(path.resolve(cwd, rel), 'utf8');
      } catch {
        return null;
      }
    },
    async writeText(rel, text) {
      await fsPromises.mkdir(path.dirname(path.resolve(cwd, rel)), { recursive: true });
      await fsPromises.writeFile(path.resolve(cwd, rel), text, 'utf8');
    },
  });
  const agentCwd = (agent: { session?: { header?: { cwd?: string } } }): string =>
    agent?.session?.header?.cwd ?? process.cwd();

  // The most recent draft awaiting the human sign-off gate (`debate_sign`).
  let latest: { topic: string; verdict: string; signOff: SignOff } | undefined;

  ctx.tools.register(defineTool({
    name: 'run_debate',
    description:
      'Run a multi-agent debate to convergence, adjudicate each open disagreement, and produce a final draft. ' +
      'Roles run on distinct providers/models from the persisted config (or the optional `roles` override). ' +
      'With human sign-off enabled the returned status is "draft"; the user then signs or rejects it in chat (the agent relays that explicit decision through `debate_sign`).',
    parameters: {
      topic: { type: 'string', required: true, description: 'The proposition to debate.' },
      rounds: { type: 'integer', description: 'Optional discussion-round override (defaults to persisted config).' },
      roles: {
        type: 'array',
        description: 'Optional per-role provider/model routing override.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string', required: true },
            provider: { type: 'string', required: true },
            model: { type: 'string' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          topic: { type: 'string' },
          phase: { type: 'string' },
          round: { type: 'integer' },
          openDisagreements: { type: 'integer' },
          verdict: { type: 'string' },
          draft: { type: 'string' },
          signOff: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === undefined) throw new Error('run_debate requires a calling agent');

      const defaults = await readDebateDefaults(workspaceFsFor(agentCwd(parent as never)), config.configPath);
      const debateConfig = debateConfigFrom(
        defaults,
        { topic: args.topic, rounds: args.rounds, roles: toRoleAssignments(args.roles) },
        config.maxRoundsCap,
      );

      let debate = start(debateConfig);
      let roundNumber = 0;
      while (shouldContinue(debate)) {
        roundNumber += 1;
        const discussionRoles = debateConfig.roles.filter(
          (r) => r.role === 'proposer' || r.role === 'opponent',
        );
        const prior = debate.discussion.history
          .flatMap((r) => r.statements.map((s) => `${s.role}: ${s.content}`))
          .join('\n');

        const opinions = await Promise.all(
          discussionRoles.map((role) =>
            runRole(
              ctx.subagents,
              config.subagentProvider,
              role,
              buildRoundPrompt(role, debateConfig.topic, roundNumber, prior),
              parent,
              exec.signal,
            ),
          ),
        );

        const disagreements: Disagreement[] = [];
        const statements = opinions.map((o) => {
          const ids: string[] = [];
          for (const d of o.opinion.disagreements ?? []) {
            const id = `r${roundNumber}-${o.role}-${ids.length}`;
            ids.push(id);
            disagreements.push({
              id,
              topic: d.topic,
              stances: [{ role: o.role, position: d.position }],
              evidence: [],
              firstRound: roundNumber,
            });
          }
          const routeProvider = debateConfig.roles.find((r) => r.role === o.role)?.route.provider ?? '';
          return {
            role: o.role,
            round: roundNumber,
            content: o.text,
            route: { provider: routeProvider },
            introducedDisagreements: ids,
          };
        });

        debate = submitRound(debate, { round: roundNumber, statements }, disagreements);
      }

      // Adjudication resolves every open disagreement and issues a verdict.
      const adjudicator = debateConfig.roles.find((r) => r.role === 'adjudicator');
      const open = openDisagreements(debate.discussion.ledger);
      let verdict = '';
      if (adjudicator !== undefined) {
        const prompt =
          `You are the adjudicator. Topic: "${debateConfig.topic}".\n` +
          `Open disagreements:\n${open.map((d) => `- subject: ${d.topic}`).join('\n') || '(none)'}\n` +
          `Issue a concise verdict and a ruling for every open disagreement.`;
        const adjudicated = await runRole(
          ctx.subagents,
          config.subagentProvider,
          adjudicator,
          prompt,
          parent,
          exec.signal,
        );
        verdict = adjudicated.opinion.position || adjudicated.text;
        for (const d of open) {
          debate = adjudicate(debate, verdict, [
            { id: d.id, resolution: adjudicated.opinion.position || 'resolved by adjudicator' },
          ]);
        }
      } else {
        verdict = 'no adjudicator role configured; open disagreements remain unsettled';
      }

      // The drafter produces the final answer text.
      let draft = verdict;
      const drafter = debateConfig.roles.find((r) => r.role === 'drafter');
      if (drafter !== undefined) {
        const prompt =
          `You are the drafter. Topic: "${debateConfig.topic}". Verdict: ${verdict}. ` +
          `Produce the final answer text incorporating the verdict and the resolved discussion.`;
        const drafted = await runRole(
          ctx.subagents,
          config.subagentProvider,
          drafter,
          prompt,
          parent,
          exec.signal,
        );
        // Structured output lands in `opinion.position`; `text` may be empty for
        // a schema-captured child. Mirror the adjudicator's fallback chain.
        draft = drafted.opinion.position || drafted.text || verdict;
      }
      debate = produceDraft(debate, draft);

      // Keep the latest draft for the human sign-off gate (`debate_sign`).
      latest = { topic: debateConfig.topic, verdict, signOff: debate.signOff };

      return {
        topic: debateConfig.topic,
        phase: debate.discussion.round >= debateConfig.maxRounds ? 'round-cap' : 'converged',
        round: roundNumber,
        openDisagreements: openDisagreements(debate.discussion.ledger).length,
        verdict,
        draft,
        signOff: debate.signOff.state,
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'debate_config',
    description:
      'Read or write the persisted debate defaults (per-role provider/model routes, max rounds, verification tools, sign-off policy). ' +
      'Call with no arguments to read; pass fields to update them.',
    parameters: {
      roles: {
        type: 'array',
        description: 'Per-role provider/model routing to persist.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string', required: true },
            provider: { type: 'string', required: true },
            model: { type: 'string' },
          },
        },
      },
      maxRounds: { type: 'integer', description: 'Discussion rounds to persist.' },
      requireHumanSignOff: { type: 'boolean', description: 'Whether a human must sign off the draft.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const cwd = agentCwd(exec?.agent as never);
      const current = await readDebateDefaults(workspaceFsFor(cwd), config.configPath);
      const next: DebateDefaults = {
        ...current,
        ...(Array.isArray(args.roles) ? { roles: toRoleAssignments(args.roles) ?? [] } : {}),
        ...(typeof args.maxRounds === 'number' ? { maxRounds: args.maxRounds } : {}),
        ...(typeof args.requireHumanSignOff === 'boolean'
          ? { requireHumanSignOff: args.requireHumanSignOff }
          : {}),
      };
      await workspaceFsFor(cwd).writeText(config.configPath, `${JSON.stringify(next, null, 2)}\n`);
      return JSON.parse(JSON.stringify({ defaults: next }));
    },
  }));

  // The human sign-off gate. The user never signs through the model; the model
  // only relays an explicit sign/reject instruction the human already gave.
  ctx.tools.register(defineTool({
    name: 'debate_sign',
    description:
      'Apply the human decision on the most recent debate draft: sign it as final, or reject it (with a reason) so it can be revised and re-presented. Call this ONLY after the user explicitly says to sign or reject the draft; never decide on the user\'s behalf.',
    parameters: {
      decision: { type: 'string', required: true, enum: ['sign', 'reject'], description: 'The user\'s explicit decision.' },
      note: { type: 'string', description: 'Optional sign-off note or rejection reason.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          state: { type: 'string' },
          topic: { type: 'string' },
          note: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const current = latest;
      if (current === undefined) throw new Error('no debate draft awaiting sign-off; run a debate first');
      const nextSignOff =
        args.decision === 'sign'
          ? sign(current.signOff, args.note)
          : reject(current.signOff, args.note ?? 'rejected by the user');
      latest = { ...current, signOff: nextSignOff };
      return {
        state: nextSignOff.state,
        topic: current.topic,
        note: nextSignOff.note ?? '',
      };
    },
  }));
}

export { defaultDebateDefaults, readDebateDefaults };
export type { DebateDefaults };
