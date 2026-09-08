import type { DebateConfig, RoleName, VerificationTool } from './types.ts';

/** Pipeline roles a debate must have for the full converge→adjudicate→review flow. */
export const REQUIRED_ROLES: readonly RoleName[] = [
  'proposer',
  'opponent',
  'adjudicator',
  'reviewer',
  'drafter',
] as const;

export const DEFAULT_CONVERGENCE_QUIET_ROUNDS = 1;

export const DEFAULT_VERIFICATION_TOOLS: readonly VerificationTool[] = [
  'code-execution',
  'fact-retrieval',
] as const;

/** Human-readable problems with a config; an empty array means it is valid. */
export function validateConfig(config: DebateConfig): string[] {
  const problems: string[] = [];

  if (typeof config.topic !== 'string' || config.topic.trim().length === 0) {
    problems.push('topic must be a non-empty string');
  }
  if (!Number.isInteger(config.maxRounds) || config.maxRounds < 1) {
    problems.push('maxRounds must be a positive integer');
  }
  if (
    config.convergenceQuietRounds !== undefined &&
    (!Number.isInteger(config.convergenceQuietRounds) || config.convergenceQuietRounds < 1)
  ) {
    problems.push('convergenceQuietRounds must be a positive integer when set');
  }

  const roles = Array.isArray(config.roles) ? config.roles : [];
  const seen = new Set<RoleName>();
  for (const assignment of roles) {
    if (typeof assignment.role !== 'string' || seen.has(assignment.role)) {
      problems.push(`duplicate or missing role identifier: ${String(assignment.role)}`);
    } else {
      seen.add(assignment.role);
    }
    if (
      typeof assignment.route?.provider !== 'string' ||
      assignment.route.provider.trim().length === 0
    ) {
      problems.push(`role ${assignment.role} is missing a provider`);
    }
  }
  for (const required of REQUIRED_ROLES) {
    if (!seen.has(required)) problems.push(`missing required role: ${required}`);
  }

  const providers = new Set(
    roles
      .map((a) => a.route?.provider)
      .filter((p): p is string => typeof p === 'string' && p.length > 0),
  );
  if (providers.size < 2) {
    problems.push('at least two distinct providers are required for a real multi-vendor debate');
  }

  return problems;
}

/** Return a normalized config with defaults applied, or throw on invalid input. */
export function normalizeConfig(input: DebateConfig): DebateConfig {
  const problems = validateConfig(input);
  if (problems.length > 0) {
    throw new Error(`invalid debate config:\n- ${problems.join('\n- ')}`);
  }
  return {
    topic: input.topic.trim(),
    roles: input.roles.map((a) => ({
      role: a.role,
      route: {
        provider: a.route.provider,
        ...(a.route.model ? { model: a.route.model } : {}),
      },
    })),
    maxRounds: input.maxRounds,
    ...(input.convergenceQuietRounds !== undefined
      ? { convergenceQuietRounds: input.convergenceQuietRounds }
      : {}),
    verificationTools: [...input.verificationTools],
    requireHumanSignOff: input.requireHumanSignOff,
  };
}

/** The distinct providers a config routes roles to, in role order. */
export function distinctProviders(config: DebateConfig): string[] {
  return [...new Set(config.roles.map((a) => a.route.provider))];
}
