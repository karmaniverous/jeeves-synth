/**
 * Select the best synthesis candidate from stale metas.
 *
 * Picks the meta with highest effective staleness.
 *
 * @module scheduling/selectCandidate
 */

import {
  computeEffectiveStaleness,
  type StalenessCandidate,
} from './weightedFormula.js';

/**
 * Select the candidate with the highest effective staleness.
 *
 * @param candidates - Array of candidates with computed effective staleness.
 * @returns The winning candidate, or null if no candidates.
 */
export function selectCandidate(
  candidates: StalenessCandidate[],
): StalenessCandidate | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].effectiveStaleness > best.effectiveStaleness) {
      best = candidates[i];
    }
  }

  return best;
}

/**
 * Extract stale candidates from a list and return the stalest path.
 *
 * Consolidates the repeated pattern of:
 *   filter → computeEffectiveStaleness → selectCandidate → return path
 *
 * @param candidates - Array with node, meta, and stalenessSeconds.
 * @param depthWeight - Depth weighting exponent from config.
 * @returns The stalest candidate's metaPath, or null if none are stale.
 */
export function discoverStalestPath(
  candidates: Omit<StalenessCandidate, 'effectiveStaleness'>[],
  depthWeight: number,
): string | null {
  const weighted = computeEffectiveStaleness(candidates, depthWeight);
  const winner = selectCandidate(weighted);
  return winner?.node.metaPath ?? null;
}
