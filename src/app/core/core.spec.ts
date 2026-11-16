import { describe, expect, it } from 'vitest';
import { sameFingering } from './fingerings';
import { INSTRUMENTS, instrumentById, soundingPitch, writtenPitch } from './instruments';
import {
  accidentalMarks,
  frequencyOf,
  germanName,
  keyAlterations,
  keyName,
  parsePitch,
  pitchFromMidi,
  transposeKey,
  transposePitch,
} from './notes';
import { detectPitch, nearestNote } from './pitch';
import { indexAt } from './player.service';
import { countInStart, isPlayableOn, score, SONGS, transposeSong } from './songs';

const soprano = instrumentById('sopran-barock');
const fingeringFor = (p: string) => soprano.fingeringFor(p);

describe('notes', () => {
  it('berechnet Frequenzen (A4 = 440 Hz, C5 ≈ 523 Hz)', () => {
    expect(frequencyOf('A4')).toBeCloseTo(440, 5);
    expect(frequencyOf('C5')).toBeCloseTo(523.25, 1);
  });
  it('liefert diatonische Stufen für das Notensystem (E4 = Grundlinie)', () => {
    expect(parsePitch('E4').step).toBe(30);
    expect(parsePitch('F5').step).toBe(38); // oberste Linie
    expect(parsePitch('C5').step).toBe(35);
  });
  it('nennt deutsche Tonnamen', () => {
    expect(germanName('B5')).toBe('H');
    expect(germanName('Bb5')).toBe('B');
    expect(germanName('F#5')).toBe('Fis');
    expect(germanName('Eb5')).toBe('Es');
    expect(germanName('G5')).toBe('G');
  });
  it('lehnt ungültige Töne ab', () => {
    expect(() => parsePitch('H5')).toThrow();
  });
});

describe('fingerings', () => {
  it('kennt die Grundgriffe (Daumen, 1–7)', () => {
    expect(fingeringFor('C5')).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(fingeringFor('G5')).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(fingeringFor('B5')).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
  });
  it('behandelt Kreuz- und B-Schreibweise gleich', () => {
    expect(sameFingering(fingeringFor('A#5')!, fingeringFor('Bb5')!)).toBe(true);
  });
  it('gibt für Töne außerhalb des Umfangs null zurück', () => {
    expect(fingeringFor('G4')).toBeNull();
  });
});

describe('songs', () => {
  it('score() liest Dauern und Pausen', () => {
    const n = score('C5 D5:2 R:1');
    expect(n.map((x) => x.start)).toEqual([0, 1, 3]);
    expect(n[2].pitch).toBeNull();
  });

  for (const s of SONGS) {
    describe(s.title, () => {
      it('füllt jeden Takt genau (mit Auftakt: Auftakt + letzter Takt = ein Takt)', () => {
        const pickup = s.pickup ?? 0;
        const bars = new Map<number, number>();
        for (const n of s.notes) {
          // Takt 0 = Auftakt; danach beginnen die Takte beim Auftakt-Versatz
          const bar = n.start < pickup ? -1 : Math.floor((n.start - pickup) / s.beatsPerBar);
          const end = n.start + n.beats - 1e-9;
          // Note darf nicht über Taktgrenze reichen
          expect(end < pickup ? -1 : Math.floor((end - pickup) / s.beatsPerBar)).toBe(bar);
          bars.set(bar, (bars.get(bar) ?? 0) + n.beats);
        }
        for (const [bar, total] of bars) {
          if (bar === -1) expect(total).toBe(pickup);
          else expect(total).toBe(s.beatsPerBar);
        }
      });
      it('Lieder mit Tonart brauchen keine zusätzlichen Vorzeichen (die Töne passen zur Tonart)', () => {
        if (!s.key) return;
        const marks = accidentalMarks(s.notes, s.key, s.beatsPerBar, s.pickup ?? 0);
        expect(marks.filter((m) => m !== null)).toEqual([]);
      });
      it('verwendet nur Töne mit bekanntem Griff', () => {
        for (const n of s.notes) if (n.pitch) expect(fingeringFor(n.pitch), n.pitch).not.toBeNull();
      });
      it('verwendet nur darstellbare Notenwerte', () => {
        for (const n of s.notes) expect([0.5, 1, 1.5, 2, 3, 4]).toContain(n.beats);
      });
      it('hat genug Silben für den Text: mit Text steht an jedem Anfang einer Silbe eine Note', () => {
        const pitched = s.notes.filter((n) => n.pitch);
        const withText = pitched.filter((n) => n.syllable);
        if (!withText.length) return;
        // Ohne Bindebogen (Unterstrich im Text) hat jede Note eine Silbe; mit Bindebogen fehlen Silben nur dort.
        expect(withText.length).toBeLessThanOrEqual(pitched.length);
        expect(withText.length).toBeGreaterThan(pitched.length * 0.7);
        expect(pitched[0].syllable).toBeTruthy();
      });
    });
  }
});

describe('indexAt', () => {
  const notes = score('C5 D5:2 E5');
  it('findet die klingende Note', () => {
    expect(indexAt(notes, -1)).toBe(-1);
    expect(indexAt(notes, 0)).toBe(0);
    expect(indexAt(notes, 0.99)).toBe(0);
    expect(indexAt(notes, 1)).toBe(1);
    expect(indexAt(notes, 2.5)).toBe(1);
    expect(indexAt(notes, 3)).toBe(2);
  });
});


describe('transposition', () => {
  it('verschiebt Töne um Halbtöne', () => {
    expect(transposePitch('C5', -7)).toBe('F4');
    expect(transposePitch('F5', -7)).toBe('Bb4');
    expect(transposePitch('C5', 2)).toBe('D5');
    expect(transposePitch('E5', 2)).toBe('F#5');
    expect(pitchFromMidi(60)).toBe('C4');
  });
  it('berechnet Tonnamen-Text bei transponierten Übungen neu', () => {
    const ex = SONGS.find((s) => s.id === 'uebung-h-a-g')!;
    expect(ex.notes[0].syllable).toBe('H');
    const alto = transposeSong(ex, -7);
    expect(alto.notes[0].syllable).toBe('E'); // H → E
  });
});

describe('instruments', () => {
  it('Sopran: Noten stehen eine Oktave tiefer, als sie klingen', () => {
    expect(writtenPitch(soprano, 'C5')).toBe('C4'); // tiefster Ton = mittleres C
    expect(writtenPitch(soprano, 'G5')).toBe('G4');
  });
  it('deutsche Griffweise unterscheidet sich nur beim F', () => {
    const baroque = instrumentById('sopran-barock');
    const german = instrumentById('sopran-deutsch');
    expect(german.fingeringFor('F5')).toEqual([1, 1, 1, 1, 1, 0, 0, 0]);
    expect(baroque.fingeringFor('F5')).toEqual([1, 1, 1, 1, 1, 0, 1, 1]);
    for (const p of ['C5', 'D5', 'E5', 'F#5', 'G5', 'A5', 'Bb5', 'B5', 'C6', 'D6']) {
      expect(sameFingering(german.fingeringFor(p)!, baroque.fingeringFor(p)!), p).toBe(true);
    }
  });
  it('Alt: gleiche Griffe wie Sopran, aber eine Quinte tiefer', () => {
    const alto = instrumentById('alt-barock');
    expect(alto.fingeringFor('F4')).toEqual(soprano.fingeringFor('C5')); // tiefster Ton
    expect(alto.fingeringFor('C5')).toEqual(soprano.fingeringFor('G5'));
    expect(soundingPitch(alto, 'C5')).toBe('F4');
  });
  it('Tin Whistle: sechs Löcher, D-Dur-Griffe', () => {
    const w = instrumentById('whistle-d');
    expect(w.fingeringFor('D5')).toEqual([1, 1, 1, 1, 1, 1]);
    expect(w.fingeringFor('G5')).toEqual([1, 1, 1, 0, 0, 0]);
    expect(w.fingeringFor('C6')).toBeNull(); // C natürlich braucht Halblochen – fehlt bewusst
  });
  it('alle Griffmuster passen zur Lochzahl der Flöte', () => {
    for (const inst of INSTRUMENTS) {
      for (let m = 40; m < 100; m++) {
        const f = inst.fingeringFor(pitchFromMidi(m));
        if (f) expect(f.length, `${inst.id} ${pitchFromMidi(m)}`).toBe(inst.holeLabels.length);
      }
    }
  });
  it('Sopran und Alt können alle Stücke spielen; Whistle alle ohne Halbtöne', () => {
    for (const s of SONGS) {
      expect(isPlayableOn(s, instrumentById('sopran-barock')), s.id).toBe(true);
      expect(isPlayableOn(s, instrumentById('sopran-deutsch')), s.id).toBe(true);
      expect(isPlayableOn(s, instrumentById('alt-barock')), s.id).toBe(true);
    }
    expect(isPlayableOn(SONGS.find((s) => s.id === 'uebung-halbtoene')!, instrumentById('whistle-d'))).toBe(false);
    expect(isPlayableOn(SONGS.find((s) => s.id === 'alle-meine-entchen')!, instrumentById('whistle-d'))).toBe(true);
  });
});

describe('Tonhöhenerkennung (YIN)', () => {
  const rate = 48000;
  const sine = (f: number, amp = 0.3, harmonics = [1, 0.2, 0.05]) =>
    Float32Array.from({ length: 2048 }, (_, i) =>
      harmonics.reduce((sum, a, h) => sum + a * amp * Math.sin((2 * Math.PI * f * (h + 1) * i) / rate), 0),
    );

  it('erkennt Blockflötentöne auf wenige Cent genau', () => {
    for (const p of ['C5', 'G5', 'A5', 'C6', 'F4', 'D6']) {
      const f = frequencyOf(p);
      const r = detectPitch(sine(f), rate)!;
      expect(r, p).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(r.frequency / f)), p).toBeLessThan(8);
    }
  });
  it('liefert bei Stille und bei Rauschen keinen Ton', () => {
    expect(detectPitch(new Float32Array(2048), rate)).toBeNull();
    const noise = Float32Array.from({ length: 2048 }, () => (Math.random() - 0.5) * 0.4);
    const r = detectPitch(noise, rate);
    expect(r === null || r.clarity < 0.85).toBe(true);
  });
  it('rundet auf Töne und gibt Cent-Abweichung', () => {
    expect(nearestNote(440)).toEqual({ midi: 69, cents: 0 });
    const sharp = nearestNote(440 * Math.pow(2, 20 / 1200));
    expect(sharp.midi).toBe(69);
    expect(sharp.cents).toBe(20);
  });
});


describe('Tonart und Vorzeichen', () => {
  it('kennt die Vorzeichen der Tonarten', () => {
    expect(keyAlterations(0)['F']).toBe(0);
    expect(keyAlterations(1)).toMatchObject({ F: 1, C: 0 });
    expect(keyAlterations(2)).toMatchObject({ F: 1, C: 1, G: 0 });
    expect(keyAlterations(-1)).toMatchObject({ B: -1, E: 0 });
    expect(keyAlterations(-2)).toMatchObject({ B: -1, E: -1, A: 0 });
  });
  it('nennt die Tonarten', () => {
    expect(keyName(0)).toBe('C-Dur');
    expect(keyName(-1)).toBe('F-Dur');
    expect(keyName(2)).toBe('D-Dur');
    expect(keyName(1)).toBe('G-Dur');
  });
  it('verschiebt die Tonart wie die Töne (Quintenzirkel)', () => {
    expect(transposeKey(0, 2)).toBe(2); // C → D
    expect(transposeKey(0, -7)).toBe(-1); // C → F
    expect(transposeKey(-1, -7)).toBe(-2); // F → B
    expect(transposeKey(1, -7)).toBe(0); // G → C
    expect(transposeKey(2, -7)).toBe(1); // D → G
    expect(transposeKey(1, -12)).toBe(1); // Oktaven ändern nichts
    expect(transposeKey(-1, 2)).toBe(1); // F → G
  });
  it('schreibt in Kreuz-Tonarten Kreuze und in B-Tonarten B-Vorzeichen', () => {
    expect(transposePitch('A5', 1, 'sharps')).toBe('A#5');
    expect(transposePitch('A5', 1, 'flats')).toBe('Bb5');
    expect(pitchFromMidi(66, 'flats')).toBe('Gb4');
    expect(pitchFromMidi(66)).toBe('F#4');
  });

  const notes = (src: string) => score(src);
  it('setzt kein Vorzeichen, wenn die Tonart es schon vorgibt', () => {
    expect(accidentalMarks(notes('F#5 G5 C#6'), 2, 4)).toEqual([null, null, null]);
    expect(accidentalMarks(notes('Bb5 A5'), -1, 4)).toEqual([null, null]);
  });
  it('setzt Vorzeichen bei Tönen, die nicht zur Tonart passen, und ein Auflösungszeichen für den Stammton', () => {
    expect(accidentalMarks(notes('F#5 G5'), 0, 4)).toEqual(['sharp', null]);
    expect(accidentalMarks(notes('F5 G5'), 2, 4)).toEqual(['natural', null]); // F in D-Dur wäre Fis
    expect(accidentalMarks(notes('B5 Bb5'), -1, 4)).toEqual(['natural', 'flat']);
  });
  it('lässt ein Vorzeichen bis zum Taktende gelten und setzt es im nächsten Takt neu', () => {
    // C-Dur, 2/4: Takt 1 = F# F#, Takt 2 = F#
    const marks = accidentalMarks(notes('F#5 F#5 F#5'), 0, 2);
    expect(marks).toEqual(['sharp', null, 'sharp']);
    // Ein F5 nach dem F#5 im selben Takt braucht ein Auflösungszeichen
    expect(accidentalMarks(notes('F#5 F5'), 0, 4)[1]).toBe('natural');
  });
  it('rechnet den Auftakt mit: der erste Taktstrich steht danach', () => {
    // 3/4 mit 1 Schlag Auftakt: Auftakt = F#5, danach beginnt der erste Takt mit F#5 → neues Vorzeichen
    const n = score('F#5 F#5:2 F#5');
    expect(accidentalMarks(n, 0, 3, 1)).toEqual(['sharp', 'sharp', null]);
  });
});

describe('Auftakt', () => {
  it('zählt so ein, dass der Einzähler direkt vor dem ersten Ton endet', () => {
    expect(countInStart({ beatsPerBar: 4 })).toBe(-4);
    expect(countInStart({ beatsPerBar: 3, pickup: 1 })).toBe(-2);
  });
  it('verschiebt die Tonart mit dem Stück: Happy Birthday in F-Dur klingt auf Alt in B-Dur', () => {
    const hb = SONGS.find((x) => x.id === 'happy-birthday')!;
    expect(hb.key).toBe(-1);
    expect(transposeSong(hb, -7).key).toBe(-2);
    expect(transposeSong(hb, 2).key).toBe(1);
    expect(transposeSong(hb, -7).pickup).toBe(1);
  });
  it('Alle Jahre wieder: D-Dur auf der Sopranflöte, G-Dur auf der Altflöte; Fis und Cis stehen in der Tonart', () => {
    const song = SONGS.find((x) => x.id === 'alle-jahre-wieder')!;
    expect(song.key).toBe(2);
    expect(transposeSong(song, -7).key).toBe(1);
    const marks = accidentalMarks(song.notes, song.key!, song.beatsPerBar, song.pickup ?? 0);
    expect(marks.every((m) => m === null)).toBe(true);
  });
});
