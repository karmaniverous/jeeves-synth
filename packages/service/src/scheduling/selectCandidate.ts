/**
 * Select the best synthesis candidate from stale metas.
 *
 * Picks the meta with highest effective staleness.
 *
 * Module: scheduling/selectCandidate
 */

import type { StalenessCandidate } from './weightedFormula.js';

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
