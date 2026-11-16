import { germanName, Pitch, Spelling, transposeKey, transposePitch } from './notes';
import type { Instrument } from './instruments';

export interface SongNote {
  /** null = Pause */
  pitch: Pitch | null;
  /** Dauer in Viertelschlägen: 0.5 Achtel, 1 Viertel, 1.5 punktierte Viertel, 2 Halbe, 3 punktierte Halbe, 4 Ganze */
  beats: number;
  /** Liedtext-Silbe (optional) */
  syllable?: string;
  /** Startzeit in Schlägen ab Liedanfang (wird von score() berechnet) */
  start: number;
}

export type SongCategory = 'lied' | 'uebung';

export interface Song {
  id: string;
  title: string;
  subtitle?: string;
  category: SongCategory;
  /** 1 = Anfang, 2 = Fortgeschritten */
  level: 1 | 2;
  beatsPerBar: number;
  /** Empfohlenes Anfangstempo (Viertel pro Minute) */
  bpm: number;
  notes: SongNote[];
  totalBeats: number;
  /** Unter den Noten stehen die Tonnamen statt eines Liedtextes (Übungen) */
  lyricNames?: boolean;
  /** Vorzeichen der Tonart: +n = n Kreuze, −n = n B-Vorzeichen (Standard: 0 = C-Dur) */
  key?: number;
  /** Auftakt in Schlägen: Der erste Taktstrich steht nach dieser Zeit (Standard: 0) */
  pickup?: number;
}

/** Position (in Schlägen), ab der beim Einzählen gezählt wird: so, dass der Einzähler direkt vor dem ersten Ton endet. */
export function countInStart(song: Pick<Song, 'beatsPerBar' | 'pickup'>): number {
  return (song.pickup ?? 0) - song.beatsPerBar;
}

/**
 * Kleine Notenschrift zum bequemen Eintippen:
 *   'C5 D5:2 R:1 F#5:0.5 | …'   → Ton[:Schläge], R = Pause, '|' = Taktstrich (nur zur Lesbarkeit, wird ignoriert)
 * lyrics: Silben durch Leerzeichen getrennt, Bindestrich = Wort geht weiter ('Al-le' → 'Al-', 'le').
 * Ein Unterstrich '_' steht für eine Note ohne eigene Silbe (mehrere Noten auf einer Silbe).
 */
export function score(src: string, lyrics = ''): SongNote[] {
  const syllables = lyrics
    .replace(/-/g, '- ')
    .split(/\s+/)
    .filter(Boolean);
  let syl = 0;
  let start = 0;
  const notes: SongNote[] = [];
  for (const token of src.split(/\s+/).filter((t) => t && t !== '|')) {
    const [name, len] = token.split(':');
    const beats = len === undefined ? 1 : Number(len);
    if (!(beats > 0)) throw new Error(`Ungültige Dauer in "${token}"`);
    const rest = name === 'R';
    notes.push({
      pitch: rest ? null : name,
      beats,
      start,
      syllable: rest ? undefined : takeSyllable(syllables[syl++]),
    });
    start += beats;
  }
  return notes;
}

function takeSyllable(text: string | undefined): string | undefined {
  return text === '_' ? undefined : text;
}

/** lyrics: 'names' → unter jeder Note steht der deutsche Tonname (praktisch für Übungen). */
function song(def: Omit<Song, 'notes' | 'totalBeats'> & { notes: string; lyrics?: string }): Song {
  const { notes: src, lyrics, ...rest } = def;
  const names = lyrics === 'names';
  const notes = score(src, names ? '' : lyrics);
  if (names) for (const n of notes) if (n.pitch) n.syllable = germanName(n.pitch);
  const last = notes[notes.length - 1];
  return { ...rest, notes, totalBeats: last.start + last.beats, lyricNames: names || undefined };
}

export const SONGS: Song[] = [
  song({
    id: 'alle-meine-entchen',
    title: 'Alle meine Entchen',
    subtitle: 'Volkslied mit sechs Tönen',
    category: 'lied',
    level: 1,
    beatsPerBar: 4,
    bpm: 72,
    notes:
      'C5 D5 E5 F5 | G5:2 G5:2 | A5 A5 A5 A5 | G5:4 | A5 A5 A5 A5 | G5:4 | F5 F5 F5 F5 | E5:2 E5:2 | D5 D5 D5 D5 | C5:4',
    lyrics:
      'Al-le mei-ne Ent-chen schwim-men auf dem See schwim-men auf dem See Köpf-chen in das Was-ser Schwänz-chen in die Höh',
  }),
  song({
    id: 'haenschen-klein',
    title: 'Hänschen klein',
    subtitle: 'Volkslied mit fünf Tönen',
    category: 'lied',
    level: 1,
    beatsPerBar: 4,
    bpm: 72,
    notes:
      'G5 E5 E5:2 | F5 D5 D5:2 | C5 D5 E5 F5 | G5 G5 G5:2 | G5 E5 E5:2 | F5 D5 D5:2 | C5 E5 G5 G5 | C5:4',
    lyrics:
      'Häns-chen klein ging al-lein in die wei-te Welt hin-ein Stock und Hut steht ihm gut ist gar wohl-ge-mut',
  }),
  song({
    id: 'kuckuck',
    title: 'Kuckuck, Kuckuck',
    subtitle: 'Frühlingslied in G-Dur, im Dreivierteltakt',
    category: 'lied',
    level: 1,
    beatsPerBar: 3,
    bpm: 84,
    key: 1,
    notes:
      'D6:2 B5 | D6:2 B5 | A5 G5 A5 | G5:2 R | A5 A5 B5 | C6:2 A5 | B5 B5 C6 | C6:2 B5 | D6:2 B5 | D6:2 B5 | A5 G5 A5 | G5:2 R',
    lyrics:
      'Ku-ckuck Ku-ckuck ruft\'s aus dem Wald Las-set uns sin-gen tan-zen und sprin-gen Früh-ling Früh-ling wird es nun bald',
  }),
  song({
    id: 'morgen-kommt-der-weihnachtsmann',
    title: 'Morgen kommt der Weihnachtsmann',
    subtitle: 'Weihnachtslied mit Tonsprüngen',
    category: 'lied',
    level: 1,
    beatsPerBar: 4,
    bpm: 84,
    notes:
      'C5 C5 G5 G5 | A5 A5 G5:2 | F5 F5 E5 E5 | D5:2 C5:2 | G5 G5 F5 F5 | E5 E5 D5:2 | G5 G5 F5 F5 | E5 E5 D5:2 | C5 C5 G5 G5 | A5 A5 G5:2 | F5 F5 E5 E5 | D5:2 C5:2',
    lyrics:
      'Mor-gen kommt der Weih-nachts-mann kommt mit sei-nen Ga-ben Trom-mel Pfei-fe und Ge-wehr Fahn und Sä-bel und noch mehr ja ein gan-zes Krie-ges-heer möcht ich ger-ne ha-ben',
  }),
  song({
    id: 'bruder-jakob',
    title: 'Bruder Jakob',
    subtitle: 'Kanon mit Achtelnoten',
    category: 'lied',
    level: 2,
    beatsPerBar: 4,
    bpm: 80,
    notes:
      // Im Original springt „Ding dang dong“ zum G unter dem C. Das liegt unter dem Umfang der
      // Sopranflöte, deshalb hier eine Oktave höher gesetzt.
      'C5 D5 E5 C5 | C5 D5 E5 C5 | E5 F5 G5:2 | E5 F5 G5:2 | G5:0.5 A5:0.5 G5:0.5 F5:0.5 E5 C5 | G5:0.5 A5:0.5 G5:0.5 F5:0.5 E5 C5 | C5 G5 C5:2 | C5 G5 C5:2',
    lyrics:
      'Bru-der Ja-kob Bru-der Ja-kob schläfst du noch schläfst du noch Hörst du nicht die Glo-cken hörst du nicht die Glo-cken Ding dang dong ding dang dong',
  }),
  song({
    id: 'ode-an-die-freude',
    title: 'Ode an die Freude',
    subtitle: 'Beethoven, mit punktierten Noten',
    category: 'lied',
    level: 2,
    beatsPerBar: 4,
    bpm: 72,
    notes:
      'E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5:1.5 D5:0.5 D5:2 | E5 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5:1.5 C5:0.5 C5:2',
    lyrics:
      'Freu-de schö-ner Göt-ter-fun-ken Toch-ter aus E-ly-si-um Wir be-tre-ten feu-er-trun-ken Himm-li-sche dein Hei-lig-tum',
  }),

  song({
    id: 'happy-birthday',
    title: 'Happy Birthday',
    subtitle: 'Geburtstagslied in F-Dur, mit Auftakt',
    category: 'lied',
    level: 2,
    beatsPerBar: 3,
    pickup: 1,
    bpm: 92,
    key: -1,
    notes:
      'C5:0.5 C5:0.5 | D5 C5 F5 | E5:2 C5:0.5 C5:0.5 | D5 C5 G5 | F5:2 C5:0.5 C5:0.5 | C6 A5 F5 | E5 D5 Bb5:0.5 Bb5:0.5 | A5 F5 G5 | F5:3',
  }),
  song({
    id: 'jingle-bells',
    title: 'Jingle Bells',
    subtitle: 'Der Refrain, mit Achteln und punktierten Noten',
    category: 'lied',
    level: 2,
    beatsPerBar: 4,
    bpm: 100,
    notes:
      'E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5:1.5 D5:0.5 | E5:4 | F5 F5 F5:1.5 F5:0.5 | F5 E5 E5 E5:0.5 E5:0.5 | E5 D5 D5 E5 | D5:2 G5:2 | E5 E5 E5:2 | E5 E5 E5:2 | E5 G5 C5:1.5 D5:0.5 | E5:4 | F5 F5 F5:1.5 F5:0.5 | F5 E5 E5 E5:0.5 E5:0.5 | G5 G5 F5 D5 | C5:4',
    lyrics:
      'Jin-gle bells Jin-gle bells Jin-gle all the way Oh what fun it is to ride in a one horse o-pen sleigh hey Jin-gle bells Jin-gle bells Jin-gle all the way Oh what fun it is to ride in a one horse o-pen sleigh',
  }),
  song({
    id: 'alle-jahre-wieder',
    title: 'Alle Jahre wieder',
    subtitle: 'Weihnachtslied in D-Dur, mit Bindebögen',
    category: 'lied',
    level: 2,
    beatsPerBar: 4,
    bpm: 76,
    key: 2,
    notes:
      'A5:1.5 B5:0.5 A5 G5 | F#5:2 E5:2 | D5 E5:0.5 F#5:0.5 G5 F#5 | E5:3 R | F#5 A5 B5 A5 | D6:2 C#6 B5 | A5 G5:0.5 F#5:0.5 G5 A5 | F#5:3 R',
    lyrics:
      'Al- le Jah- re wie- der kommt das _ Chri- stus- kind auf die Er- de nie- der _ wo wir _ Men- schen sind',
  }),

  // ---- Übungen: Töne der Reihe nach kennenlernen ----
  song({
    id: 'uebung-h-a-g',
    title: 'Die ersten drei Töne',
    subtitle: 'Nur die linke Hand',
    category: 'uebung',
    level: 1,
    beatsPerBar: 4,
    bpm: 60,
    notes:
      'B5 A5 G5 A5 | B5 B5 B5:2 | A5 A5 A5:2 | B5 B5 B5:2 | B5 A5 G5 A5 | B5 B5 B5 B5 | A5 A5 B5 A5 | G5:4',
    lyrics: 'names',
  }),
  song({
    id: 'uebung-c-d-e',
    title: 'Rechte Hand dazunehmen',
    subtitle: 'Drei weitere Töne, die tiefer klingen',
    category: 'uebung',
    level: 1,
    beatsPerBar: 4,
    bpm: 60,
    notes:
      'E5 D5 C5 D5 | E5 E5 E5:2 | D5 D5 D5:2 | E5 G5 G5:2 | E5 D5 C5 D5 | E5 E5 E5 E5 | D5 D5 E5 D5 | C5:4',
    lyrics: 'names',
  }),
  song({
    id: 'uebung-tonleiter',
    title: 'C-Dur-Tonleiter',
    subtitle: 'Aufwärts und abwärts, mit F',
    category: 'uebung',
    level: 1,
    beatsPerBar: 4,
    bpm: 60,
    notes: 'C5 D5 E5 F5 | G5 A5 B5 C6 | C6 B5 A5 G5 | F5 E5 D5 C5 | C5:4',
    lyrics: 'names',
  }),
  song({
    id: 'uebung-halbtoene',
    title: 'Halbtöne',
    subtitle: 'Mit Kreuz und B-Vorzeichen',
    category: 'uebung',
    level: 2,
    beatsPerBar: 4,
    bpm: 56,
    notes: 'G5 F#5 G5 A5 | Bb5 A5 G5:2 | G5 F#5 G5 A5 | B5 A5 G5:2 | F#5 G5 F#5 E5 | D5:2 G5:2',
    lyrics: 'names',
  }),
];

export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

/** Kopie des Stücks, um Halbtöne verschoben. Bei Tonnamen-Text werden die Namen neu berechnet. */
export function transposeSong(song: Song, semitones: number): Song {
  if (semitones === 0) return song;
  const key = transposeKey(song.key ?? 0, semitones);
  // Mit Tonart wird passend geschrieben: in Kreuz-Tonarten mit Kreuzen, in B-Tonarten mit B-Vorzeichen
  const spelling: Spelling = key > 0 ? 'sharps' : key < 0 ? 'flats' : 'default';
  return {
    ...song,
    key,
    notes: song.notes.map((n) => {
      if (!n.pitch) return n;
      const pitch = transposePitch(n.pitch, semitones, spelling);
      return { ...n, pitch, syllable: song.lyricNames ? germanName(pitch) : n.syllable };
    }),
  };
}

/** Kann die Flöte jeden Ton des Stücks greifen (nach der Anpassung an die Flöte)? */
export function isPlayableOn(song: Song, instrument: Instrument): boolean {
  return song.notes.every(
    (n) => !n.pitch || instrument.fingeringFor(transposePitch(n.pitch, instrument.songShift)) !== null,
  );
}
