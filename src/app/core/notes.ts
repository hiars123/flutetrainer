/**
 * Töne werden als Text geschrieben: 'C5', 'F#5', 'Bb5' (wissenschaftliche Oktavzählung, C4 = eingestrichenes c).
 * Die Sopranblockflöte klingt wie notiert: tiefster Ton C5 (c'' im Notenschlüssel = 3. Zwischenraum).
 */
export type Pitch = string;

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export interface ParsedPitch {
  letter: string;
  /** -1 = b, 0 = natürlich, 1 = # */
  accidental: -1 | 0 | 1;
  octave: number;
  midi: number;
  /** Diatonische Stufe: C0 = 0, D0 = 1, ... (für die Position im Notensystem) */
  step: number;
}

const cache = new Map<string, ParsedPitch>();

export function parsePitch(pitch: Pitch): ParsedPitch {
  const hit = cache.get(pitch);
  if (hit) return hit;
  const m = /^([A-G])(#|b)?(\d)$/.exec(pitch);
  if (!m) throw new Error(`Ungültiger Ton: "${pitch}"`);
  const [, letter, acc, oct] = m;
  const accidental = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  const octave = Number(oct);
  const parsed: ParsedPitch = {
    letter,
    accidental,
    octave,
    midi: 12 * (octave + 1) + SEMITONES[letter] + accidental,
    step: octave * 7 + LETTER_INDEX[letter],
  };
  cache.set(pitch, parsed);
  return parsed;
}

export function midiOf(pitch: Pitch): number {
  return parsePitch(pitch).midi;
}

export function frequencyOf(pitch: Pitch): number {
  return 440 * Math.pow(2, (midiOf(pitch) - 69) / 12);
}

/** Deutsche Tonnamen: H statt B, Cis/Dis…, Es/As/B bei b-Vorzeichen. */
export function germanName(pitch: Pitch): string {
  const { letter, accidental } = parsePitch(pitch);
  if (accidental === 0) return letter === 'B' ? 'H' : letter;
  if (accidental === 1) return (letter === 'B' ? 'H' : letter) + 'is';
  // b-Vorzeichen
  if (letter === 'B') return 'B';
  if (letter === 'E') return 'Es';
  if (letter === 'A') return 'As';
  return letter + 'es';
}

/** Schreibweise mit Vorzeichen-Symbol, z. B. "F♯", "B♭" (für Anzeige in Zeitfenstern ohne Notenbild). */
export function symbolName(pitch: Pitch): string {
  const { letter, accidental } = parsePitch(pitch);
  return letter + (accidental === 1 ? '♯' : accidental === -1 ? '♭' : '');
}

/** Schreibweise der schwarzen Tasten: gemischt (Standard), nur Kreuze oder nur B-Vorzeichen. */
export type Spelling = 'default' | 'sharps' | 'flats';

const PITCH_CLASS_NAMES: Record<Spelling, readonly string[]> = {
  default: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  sharps: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  flats: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
};

/** MIDI-Nummer → Tonname (Standard: Kreuze bei C#, F#, G#, B-Vorzeichen bei Eb, Bb). */
export function pitchFromMidi(midi: number, spelling: Spelling = 'default'): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[spelling][((midi % 12) + 12) % 12]}${octave}`;
}

/** Verschiebt einen Ton um Halbtöne (negativ = tiefer). */
export function transposePitch(pitch: Pitch, semitones: number, spelling: Spelling = 'default'): Pitch {
  return semitones === 0 ? pitch : pitchFromMidi(midiOf(pitch) + semitones, spelling);
}

// --- Tonart (Vorzeichen am Zeilenanfang) ---

/** Anzahl der Vorzeichen: +n = n Kreuze, −n = n B-Vorzeichen, 0 = C-Dur. */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const;

/** Wie jeder Stammton in der Tonart verändert wird (+1 Kreuz, −1 B). */
export function keyAlterations(key: number): Record<string, -1 | 0 | 1> {
  const alt: Record<string, -1 | 0 | 1> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (key > 0) for (const l of SHARP_ORDER.slice(0, key)) alt[l] = 1;
  if (key < 0) for (const l of FLAT_ORDER.slice(0, -key)) alt[l] = -1;
  return alt;
}

/** Tonart nach dem Verschieben um Halbtöne (Quintenzirkel: jeder Halbton aufwärts = 7 Quinten). */
export function transposeKey(key: number, semitones: number): number {
  let k = (((key + 7 * semitones) % 12) + 12) % 12;
  if (k > 6) k -= 12;
  return k;
}

const MAJOR_KEYS: Record<number, string> = {
  [-6]: 'Ges', [-5]: 'Des', [-4]: 'As', [-3]: 'Es', [-2]: 'B', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'H', 6: 'Fis',
};

/** „F-Dur“, „D-Dur“ … für die Anzeige. */
export function keyName(key: number): string {
  return `${MAJOR_KEYS[key] ?? 'C'}-Dur`;
}

/** Notiert ein Vorzeichen vor der Note? Vorzeichen gelten bis zum Taktende. */
export type AccidentalMark = 'sharp' | 'flat' | 'natural' | null;

/**
 * Bestimmt für jede Note, ob ein Vorzeichen davor steht – nach den Regeln der Notenschrift:
 * Die Tonart gilt für den ganzen Takt; ein Vorzeichen davor gilt für diese Tonhöhe bis zum Taktstrich.
 * `pickup` ist der Auftakt in Schlägen: Der erste Taktstrich steht nach dem Auftakt.
 */
export function accidentalMarks(
  notes: readonly { pitch: Pitch | null; start: number }[],
  key: number,
  beatsPerBar: number,
  pickup = 0,
): AccidentalMark[] {
  const inKey = keyAlterations(key);
  let bar = -1;
  let current = new Map<string, number>();
  return notes.map((n) => {
    if (!n.pitch) return null;
    const b = n.start < pickup - 1e-9 ? -1 : Math.floor((n.start - pickup + 1e-9) / beatsPerBar);
    if (b !== bar) {
      bar = b;
      current = new Map();
    }
    const p = parsePitch(n.pitch);
    const slot = p.letter + p.octave;
    const valid = current.get(slot) ?? inKey[p.letter];
    if (p.accidental === valid) return null;
    current.set(slot, p.accidental);
    return p.accidental === 1 ? 'sharp' : p.accidental === -1 ? 'flat' : 'natural';
  });
}
