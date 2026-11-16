import type { Instrument } from './instruments';
import { Pitch, transposePitch } from './notes';

/**
 * Töne, die im Griff-Trainer zusammen geübt werden – von leicht nach schwer.
 * Die Töne sind in der Vorlage (Sopran in C) notiert und werden pro Flöte angepasst.
 */
export interface NotePool {
  id: string;
  title: string;
  hint: string;
  pitches: Pitch[];
}

export const POOLS: NotePool[] = [
  { id: 'hag', title: 'Drei Töne', hint: 'Nur die linke Hand', pitches: ['B5', 'A5', 'G5'] },
  { id: 'cde', title: 'Tiefe Töne', hint: 'Die rechte Hand kommt dazu', pitches: ['C5', 'D5', 'E5'] },
  { id: 'c-g', title: 'Fünf Töne', hint: 'Fünf Töne am Stück', pitches: ['C5', 'D5', 'E5', 'F5', 'G5'] },
  {
    id: 'tonleiter',
    title: 'Tonleiter',
    hint: 'Acht Töne, einmal die ganze Leiter',
    pitches: ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'],
  },
  {
    id: 'halbtoene',
    title: 'Mit Halbtönen',
    hint: 'Kreuz und B-Vorzeichen dazu',
    pitches: ['C5', 'D5', 'E5', 'F5', 'F#5', 'G5', 'A5', 'Bb5', 'B5', 'C6'],
  },
];

/** Übungsvorräte für eine Flöte: Töne so verschoben, wie sie dort klingen; nur Vorräte, die die Flöte ganz greifen kann. */
export function poolsFor(instrument: Instrument): NotePool[] {
  return POOLS.map((pool) => ({
    ...pool,
    pitches: pool.pitches.map((p) => transposePitch(p, instrument.songShift)),
  })).filter((pool) => pool.pitches.every((p) => instrument.fingeringFor(p)));
}
