/**
 * Scheduling module — staleness detection and candidate selection.
 *
 * @module scheduling
 */

export { selectCandidate } from './selectCandidate.js';
export {
  actualStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
} from './staleness.js';
export {
  computeEffectiveStaleness,
  type StalenessCandidate,
} from './weightedFormula.js';
