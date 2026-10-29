// Drawer moves. Each move's effect is the REMEDIES entry with the same id (src/data/crises.ts),
// so cards and the drawer share effects, previews, quips and remedy fatigue.
// Text in src/i18n/en.ts (remedy.<id>, remedy.<id>.desc, quip.<id>.N).
import type { MoveDef } from '../engine/types.ts';

export const MOVES: MoveDef[] = [
  // governing
  { id: 'poach', phases: ['governing'], cooldownDays: 120, requires: { oppositionDonor: true } },
  { id: 'newministry', phases: ['governing'], cooldownDays: 180 },
  { id: 'un', phases: ['governing'], cooldownDays: 365 },
  { id: 'cottage', phases: ['governing'], cooldownDays: 365 },
  { id: 'nobel', phases: ['governing', 'opposition'] },
  { id: 'wingofzion', phases: ['governing'] },
  { id: 'blameag', phases: ['governing', 'opposition'], cooldownDays: 120 },
  { id: 'lifeitself', phases: ['governing', 'campaign'], cooldownDays: 180 },
  { id: 'securitydetail', phases: ['governing'], cooldownDays: 365 },
  { id: 'postponeelections', phases: ['governing'], oncePerTerm: true, requires: { war: true, electionsWithinDays: 365 } },
  // the last months of a term: two levers on the vote (both show up in the election odds)
  { id: 'electionbudget', phases: ['governing'], oncePerTerm: true, requires: { electionsWithinDays: 180 } },
  { id: 'groundgame', phases: ['governing'], oncePerTerm: true, requires: { electionsWithinDays: 180 } },
  { id: 'primetime', phases: ['governing', 'campaign', 'opposition'], cooldownDays: 60 },
  // early elections: used to be the swipe down on every card
  { id: 'elections', phases: ['governing'] },
  // campaign (once per election)
  { id: 'merger', phases: ['campaign'], oncePerTerm: true },
  { id: 'spoiler', phases: ['campaign'], oncePerTerm: true },
  { id: 'gevalt', phases: ['campaign'], oncePerTerm: true },
  // opposition: topple the rival government
  { id: 'oppattack', phases: ['opposition'], cooldownDays: 45 },
  { id: 'opppoach', phases: ['opposition'], cooldownDays: 120 },
  { id: 'noconfidence', phases: ['opposition'], cooldownDays: 90 },
  // exits (special endings)
  { id: 'plea', phases: ['governing', 'opposition'], requires: { minTrial: 40 }, ending: true },
  { id: 'exilemiami', phases: ['governing', 'campaign', 'opposition'], ending: true },
];

export const moveById = new Map(MOVES.map((m) => [m.id, m]));

/** invented ministries for the "create a new ministry" move, in order */
export const NEW_MINISTRIES = ['jerheritage', 'negevgalilee', 'nationalmissions', 'regionalcoop'];
