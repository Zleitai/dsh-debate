import type { Disagreement, EvidenceBlock, Stance } from './types.ts';

function cloneStances(stances: readonly Stance[]): Stance[] {
  return stances.map((s) => ({ ...s }));
}

/** Merge stances keeping the most recent position per role. */
function mergeStances(existing: readonly Stance[], incoming: readonly Stance[]): Stance[] {
  const byRole = new Map<string, Stance>();
  for (const s of [...existing, ...incoming]) byRole.set(s.role, { ...s });
  return [...byRole.values()];
}

/** De-duplicate evidence blocks keyed by claim + tool. */
function dedupeEvidence(list: readonly EvidenceBlock[]): EvidenceBlock[] {
  const seen = new Set<string>();
  const out: EvidenceBlock[] = [];
  for (const e of list) {
    const key = `${e.claim}\u0000${e.tool}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e });
  }
  return out;
}

/**
 * Upsert incoming disagreements into the ledger. Existing entries keep their
 * `firstRound`, gain any new stances/evidence, and are otherwise untouched.
 */
export function mergeDisagreements(
  ledger: readonly Disagreement[],
  incoming: readonly Disagreement[],
): Disagreement[] {
  const byId = new Map(ledger.map((d) => [d.id, d]));
  for (const inc of incoming) {
    const existing = byId.get(inc.id);
    if (existing === undefined) {
      byId.set(inc.id, {
        id: inc.id,
        topic: inc.topic,
        stances: cloneStances(inc.stances),
        evidence: dedupeEvidence(inc.evidence),
        ...(inc.resolution !== undefined ? { resolution: inc.resolution } : {}),
        firstRound: inc.firstRound,
      });
      continue;
    }
    byId.set(inc.id, {
      ...existing,
      topic: inc.topic,
      stances: mergeStances(existing.stances, inc.stances),
      evidence: dedupeEvidence([...existing.evidence, ...inc.evidence]),
      ...(inc.resolution !== undefined ? { resolution: inc.resolution } : {}),
      firstRound: Math.min(existing.firstRound, inc.firstRound),
    });
  }
  return [...byId.values()];
}

/** Attach one verification result to a disagreement. */
export function addEvidence(
  ledger: readonly Disagreement[],
  id: string,
  evidence: EvidenceBlock,
): Disagreement[] {
  assertKnown(ledger, id);
  return ledger.map((d) =>
    d.id === id ? { ...d, evidence: dedupeEvidence([...d.evidence, evidence]) } : d,
  );
}

/** Record the adjudicator's ruling on a disagreement. */
export function resolveDisagreement(
  ledger: readonly Disagreement[],
  id: string,
  resolution: string,
): Disagreement[] {
  assertKnown(ledger, id);
  return ledger.map((d) => (d.id === id ? { ...d, resolution } : d));
}

/** Disagreements that still lack an adjudicator resolution. */
export function openDisagreements(ledger: readonly Disagreement[]): Disagreement[] {
  return ledger.filter((d) => d.resolution === undefined);
}

export function allDisagreementsResolved(ledger: readonly Disagreement[]): boolean {
  return ledger.length > 0 && openDisagreements(ledger).length === 0;
}

function assertKnown(ledger: readonly Disagreement[], id: string): void {
  if (!ledger.some((d) => d.id === id)) {
    throw new Error(`unknown disagreement id: ${id}`);
  }
}
