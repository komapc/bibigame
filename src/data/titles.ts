// Titles. Display names (Hebrew transliteration + English gloss) live in
// src/i18n/en.ts (title.<id> / title.<id>.gloss). Thresholds are data — tune freely.
import type { TitleDef } from '../engine/types.ts';

const Y = 365.25;

export const TITLES: TitleDef[] = [
  // tenure ladder: total days as PM
  { id: 'lapid', kind: 'tenure', threshold: 0.5 * Y },
  { id: 'bennett', kind: 'tenure', threshold: Y + 1 },
  { id: 'tovlayehudim', kind: 'tenure', threshold: 2 * Y },
  { id: 'rakbibi', kind: 'tenure', threshold: 4 * Y },
  { id: 'gushbibi', kind: 'tenure', threshold: 6 * Y },
  { id: 'melech', kind: 'tenure', threshold: 8 * Y },
  { id: 'melechyisrael', kind: 'tenure', threshold: 10 * Y },
  { id: 'bengurion', kind: 'tenure', threshold: 13.5 * Y },
  { id: 'archaeology', kind: 'tenure', threshold: 20 * Y },
  { id: 'moses', kind: 'tenure', threshold: 40 * Y },
  // achievements (stat >= threshold)
  { id: 'kosem', kind: 'achievement', stat: 'electionsSurvived', threshold: 3 },
  { id: 'bitachon', kind: 'achievement', stat: 'warsEnded', threshold: 3 },
  { id: 'loyihyeklum', kind: 'achievement', stat: 'casesSurvived', threshold: 5 },
  { id: 'crimeminister', kind: 'achievement', stat: 'maxOpenCases', threshold: 3 },
  { id: 'raklobibi', kind: 'achievement', stat: 'refusedByAll', threshold: 1 },
  { id: 'mahapach', kind: 'achievement', stat: 'comebacks', threshold: 1 },
  { id: 'havtachot', kind: 'achievement', stat: 'brokenPromises', threshold: 10 },
  { id: 'kablan', kind: 'achievement', stat: 'bigCoalitionBest', threshold: 365 },
  { id: 'shiva', kind: 'achievement', stat: 'returns', threshold: 1 },
  // special endings
  { id: 'miamivice', kind: 'ending', ending: 'miami', threshold: 0 },
  { id: 'turpitude', kind: 'ending', ending: 'plea', threshold: 0 },
  { id: 'rotated', kind: 'ending', ending: 'rotation', threshold: 0 },
];
