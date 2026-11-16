import { Fingering, RECORDER_BAROQUE, RECORDER_GERMAN, WHISTLE_D, decode } from './fingerings';
import { midiOf, Pitch, transposePitch } from './notes';

export type InstrumentFamily = 'recorder' | 'whistle';
export type FingeringSystem = 'barock' | 'deutsch';
export type InstrumentKind = 'sopran' | 'alt' | 'whistle';

export interface Instrument {
  id: string;
  kind: InstrumentKind;
  family: InstrumentFamily;
  /** Anzeigename, z. B. „Sopranblockflöte“ */
  name: string;
  /** Griffweise (nur Blockflöten) */
  system: FingeringSystem | null;
  /** Löcher von oben nach unten; bei Blockflöten beginnt die Liste mit dem Daumenloch */
  holeLabels: readonly string[];
  /** Wie viele Löcher (von oben) mit der linken Hand gegriffen werden */
  leftHoleCount: number;
  /** Ab diesem Loch-Index sind es Doppellöcher (Blockflöte: 6 und 7), sonst Infinity */
  doubleFrom: number;
  /** Halbtöne, um die jedes Stück verschoben wird, damit es auf dieser Flöte mit den bekannten Griffen klingt */
  songShift: number;
  /** Geschriebene Note = klingende Note + writtenShift (Sopranflöte und Whistle werden eine Oktave tiefer notiert) */
  writtenShift: number;
  /** Alle Töne, die die Flöte greifen kann (klingende MIDI-Nummern, aufsteigend) */
  midis: readonly number[];
  fingeringFor(sounding: Pitch): Fingering | null;
}

/** Tabelle nach klingendem MIDI-Ton: patterns sind für die Sopranflöte geschrieben, shift verschiebt sie. */
function buildTable(patterns: Record<Pitch, string>, shift: number): Map<number, Fingering> {
  return new Map(Object.entries(patterns).map(([p, pattern]) => [midiOf(p) + shift, decode(pattern)]));
}

const RECORDER_LABELS = ['D', '1', '2', '3', '4', '5', '6', '7'] as const;
const WHISTLE_LABELS = ['1', '2', '3', '4', '5', '6'] as const;

function recorder(kind: 'sopran' | 'alt', system: FingeringSystem): Instrument {
  // Die Altflöte (in F) klingt bei gleichem Griff eine Quinte tiefer als die Sopranflöte (in C).
  const table = buildTable(system === 'barock' ? RECORDER_BAROQUE : RECORDER_GERMAN, kind === 'alt' ? -7 : 0);
  return {
    id: `${kind}-${system}`,
    kind,
    family: 'recorder',
    name: kind === 'sopran' ? 'Sopranblockflöte' : 'Altblockflöte',
    system,
    holeLabels: RECORDER_LABELS,
    leftHoleCount: 4,
    doubleFrom: 6,
    // Alt: Stücke eine Quinte tiefer spielen → dieselben Griffe wie auf der Sopranflöte
    songShift: kind === 'alt' ? -7 : 0,
    // Sopran wird eine Oktave tiefer notiert, als sie klingt; die Altflöte klingt wie notiert
    writtenShift: kind === 'alt' ? 0 : -12,
    midis: [...table.keys()].sort((a, b) => a - b),
    fingeringFor: (p) => table.get(midiOf(p)) ?? null,
  };
}

const whistleTable = buildTable(WHISTLE_D, 0);
const whistle: Instrument = {
  id: 'whistle-d',
  kind: 'whistle',
  family: 'whistle',
  name: 'Tin Whistle in D',
  system: null,
  holeLabels: WHISTLE_LABELS,
  leftHoleCount: 3,
  doubleFrom: Infinity,
  songShift: 2, // C-Dur → D-Dur
  writtenShift: -12,
  midis: [...whistleTable.keys()].sort((a, b) => a - b),
  fingeringFor: (p) => whistleTable.get(midiOf(p)) ?? null,
};

export const INSTRUMENTS: readonly Instrument[] = [
  recorder('sopran', 'barock'),
  recorder('sopran', 'deutsch'),
  recorder('alt', 'barock'),
  recorder('alt', 'deutsch'),
  whistle,
];

export const DEFAULT_INSTRUMENT_ID = 'sopran-barock';

export function instrumentById(id: string | null | undefined): Instrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

/** Klingender Ton dieser Flöte für einen Ton der Notenvorlage (Sopran-C-Lage). */
export function soundingPitch(instrument: Instrument, canonical: Pitch): Pitch {
  return transposePitch(canonical, instrument.songShift);
}

export function writtenPitch(instrument: Instrument, canonical: Pitch): Pitch {
  return transposePitch(canonical, instrument.songShift + instrument.writtenShift);
}
