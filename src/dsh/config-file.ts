import type { RoleAssignment, VerificationTool } from '../engine/types.ts';

/**
 * What the persisted `.debate/config.json` holds: the *defaults* a run uses
 * when the model does not override them. The debate topic is per-run and is
 * deliberately NOT persisted.
 */
export interface DebateDefaults {
  roles: RoleAssignment[];
  maxRounds: number;
  convergenceQuietRounds?: number;
  verificationTools: VerificationTool[];
  requireHumanSignOff: boolean;
}

/** Minimal filesystem seam so this module stays testable without a harness. */
export interface HostFs {
  /** Return file text, or `null` when the path does not exist. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
}

export const VERIFICATION_TOOLS: readonly VerificationTool[] = [
  'code-execution',
  'fact-retrieval',
];

export function defaultDebateDefaults(): DebateDefaults {
  return {
    roles: [],
    maxRounds: 3,
    convergenceQuietRounds: 1,
    verificationTools: [...VERIFICATION_TOOLS],
    requireHumanSignOff: true,
  };
}

const ROLE_NAMES = new Set([
  'proposer',
  'opponent',
  'adjudicator',
  'reviewer',
  'drafter',
  'cheap',
]);

/** Tolerant parse of an on-disk/defaults object into a structured value. */
export function normalizeDefaults(input: unknown): DebateDefaults {
  const base = defaultDebateDefaults();
  if (typeof input !== 'object' || input === null) return base;

  const raw = input as Record<string, unknown>;

  const maxRounds = raw.maxRounds;
  const max: number = Number.isInteger(maxRounds) && (maxRounds as number) >= 1
    ? (maxRounds as number)
    : base.maxRounds;

  const quiet = raw.convergenceQuietRounds;
  const convergenceQuietRounds =
    Number.isInteger(quiet) && (quiet as number) >= 1 ? (quiet as number) : base.convergenceQuietRounds;

  const verificationTools = Array.isArray(raw.verificationTools)
    ? (raw.verificationTools.filter((t): t is VerificationTool =>
        t === 'code-execution' || t === 'fact-retrieval') as VerificationTool[])
    : base.verificationTools;

  const requireHumanSignOff =
    typeof raw.requireHumanSignOff === 'boolean' ? raw.requireHumanSignOff : base.requireHumanSignOff;

  const roles: RoleAssignment[] = [];
  if (Array.isArray(raw.roles)) {
    for (const entry of raw.roles) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const role = e.role;
      const route = e.route as Record<string, unknown> | undefined;
      const provider = route?.provider;
      if (typeof role !== 'string' || !ROLE_NAMES.has(role)) continue;
      if (typeof provider !== 'string' || provider.length === 0) continue;
      roles.push({
        role: role as RoleAssignment['role'],
        route: {
          provider,
          ...(typeof route?.model === 'string' && route.model.length > 0
            ? { model: route.model }
            : {}),
        },
      });
    }
  }

  return {
    roles,
    maxRounds: max,
    convergenceQuietRounds,
    verificationTools,
    requireHumanSignOff,
  };
}

/** Read persisted defaults, falling back to the built-in defaults when absent. */
export async function readDebateDefaults(fs: HostFs, path: string): Promise<DebateDefaults> {
  const text = await fs.readText(path);
  if (text === null) return defaultDebateDefaults();
  try {
    return normalizeDefaults(JSON.parse(text));
  } catch {
    return defaultDebateDefaults();
  }
}

export async function writeDebateDefaults(
  fs: HostFs,
  path: string,
  defaults: DebateDefaults,
): Promise<void> {
  await fs.writeText(path, `${JSON.stringify(normalizeDefaults(defaults), null, 2)}\n`);
}
