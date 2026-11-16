import { Pitch } from './notes';

/** 0 = offen, 1 = zu, 0.5 = halb zu (Doppelloch: nur eine Hälfte abgedeckt) */
export type HoleState = 0 | 0.5 | 1;

/** Ein Zustand pro Griffloch, von oben nach unten (bei Blockflöten zuerst das Daumenloch). */
export type Fingering = readonly HoleState[];

/** Griffmuster lesbar als Text: 1 = zu, 0 = offen, h = halb; Leerzeichen sind frei wählbar. */
export function decode(pattern: string): Fingering {
  return [...pattern.replace(/\s+/g, '')].map((c) => (c === '1' ? 1 : c === 'h' ? 0.5 : 0)) as HoleState[];
}

export function sameFingering(a: Fingering, b: Fingering): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function allOpen(holes: number): Fingering {
  return Array(holes).fill(0) as HoleState[];
}

/**
 * Sopranblockflöte, barocke (englische) Griffweise. Schlüssel = klingender Ton der Sopranflöte.
 * Lesart: 'Daumen | Loch 1-3 | Loch 4-7'.
 * Quellen: dynamicmusicroom.com/notes-on-recorder, Dolmetsch-Tabelle.
 */
export const RECORDER_BAROQUE: Record<Pitch, string> = {
  C5: '1 111 1111',
  'C#5': '1 111 111h',
  D5: '1 111 1110',
  'D#5': '1 111 11h0',
  E5: '1 111 1100',
  F5: '1 111 1011', // Gabelgriff
  'F#5': '1 111 0110',
  G5: '1 111 0000',
  'G#5': '1 110 1100',
  A5: '1 110 0000',
  'A#5': '1 101 1000',
  B5: '1 100 0000',
  C6: '1 010 0000',
  'C#6': '0 110 0000',
  D6: '0 010 0000',
  'D#6': '0 011 1110',
};

/**
 * Deutsche Griffweise: In der Grundskala (c'' bis d''') unterscheidet sich nur das F – es kommt ohne Gabelgriff aus
 * (Daumen und Löcher 1–4 zu, 5–7 offen). Quelle: musikschule.info/grifftabelle-blockfloete, Moeck „Der kleine Moeck“.
 * Töne oberhalb von d''' sind nicht belegt und fehlen deshalb.
 */
export const RECORDER_GERMAN: Record<Pitch, string> = (() => {
  const t: Record<Pitch, string> = { ...RECORDER_BAROQUE, F5: '1 111 1000' };
  delete t['D#6'];
  return t;
})();

/**
 * Tin Whistle in D (6 Löcher). Schlüssel = klingender Ton. Die zweite Oktave wird mit denselben Griffen
 * stärker angeblasen; nur das hohe D wird mit offenem ersten Loch gegriffen.
 * Quellen: wfg.woodwind.org (D4–C#5, dort eine Oktave tiefer notiert), Tin-Whistle-Praxis.
 * Halbtöne (Halblochen, Gabelgriffe) fehlen bewusst.
 */
export const WHISTLE_D: Record<Pitch, string> = {
  D5: '111 111',
  E5: '111 110',
  'F#5': '111 100',
  G5: '111 000',
  A5: '110 000',
  B5: '100 000',
  'C#6': '000 000',
  D6: '011 111',
  E6: '111 110',
  'F#6': '111 100',
  G6: '111 000',
  A6: '110 000',
  B6: '100 000',
};
