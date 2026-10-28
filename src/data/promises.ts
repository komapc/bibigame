// Promises: say it now, (maybe) deliver later. Text in src/i18n/en.ts (promise.<id>).
import type { PromiseDef } from '../engine/types.ts';

export const PROMISES: PromiseDef[] = [
  { id: 'exemption', to: ['haredi'], deliveredBy: 'exempt' },
  { id: 'settlement', to: ['farright'], deliveredBy: 'settle', alsoBy: ['settlelaw'] },
  { id: 'lebanon', to: ['farright'], deliveredBy: 'lebanon' },
  { id: 'saudi', to: ['centrist'], deliveredBy: 'saudi' },
  { id: 'reform', to: ['farright', 'pm'], deliveredBy: 'reform' },
  { id: 'constitution', to: ['secular', 'centrist'], deliveredBy: 'constitution' },
  { id: 'ceasefire', to: ['centrist', 'arab', 'left'], deliveredBy: 'ceasefire' },
  // note: 'saudi' and 'lebanon' are delivered by once-per-game / tension-gated moves
  { id: 'funds', to: ['any'], deliveredBy: 'funds' },
  { id: 'ministry', to: ['any'], deliveredBy: 'ministry' },
  { id: 'norwegian', to: ['any'], deliveredBy: 'norwegian' },
  { id: 'newministry', to: ['any'], deliveredBy: 'newministry' },
  // the classic: a huge boost now, a rotation date later (card: hand over = ending, or break it)
  { id: 'rotation', to: ['any'], deliveredBy: 'handover', card: 'rotation', minSeats: 4, cardOnly: true },
];

export const promiseById = new Map(PROMISES.map((p) => [p.id, p]));
