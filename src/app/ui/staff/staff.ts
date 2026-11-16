import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Glyph, GLYPHS, GlyphName, SPACE_UNITS } from '../../core/glyphs';
import { accidentalMarks, AccidentalMark, parsePitch } from '../../core/notes';
import { Song } from '../../core/songs';

// --- Geometrie des Notensystems (SVG-Einheiten) ---
const LINE_GAP = 16; // Abstand zweier Notenlinien
const S = LINE_GAP / SPACE_UNITS; // Skalierung der Font-Glyphen
const Y_BOTTOM = 150; // y der untersten Linie (E4)
const BASE_STEP = 30; // diatonische Stufe von E4
const HEIGHT = 216;
const LYRIC_Y = 202;
const PX_PER_BEAT = 72;
const STEM_LEN = LINE_GAP * 3.5;
const LINE_YS = [0, 1, 2, 3, 4].map((i) => Y_BOTTOM - i * LINE_GAP);

const yOfStep = (step: number) => Y_BOTTOM - ((step - BASE_STEP) * LINE_GAP) / 2;

// Vorzeichen der Tonart: Stufen im Violinschlüssel (C0 = 0), in der Reihenfolge der Quinten
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34]; // F C G D A E H
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31]; // H E A D G C F
const KEY_X0 = 60; // hinter dem Notenschlüssel
/** Höhe (Font-Einheiten), auf der die Mitte des Notenkopfs liegt; auf dieser Höhe sitzen die Vorzeichen-Glyphen */
const HEAD_CENTER = 134;

/** Glyph (Font-Koordinaten, y nach oben) so platzieren, dass sein Mittelpunkt auf (cx, cy) liegt. */
function centered(g: Glyph, cx: number, cy: number): string {
  const gx = (g.b[0] + g.b[2]) / 2;
  const gy = (g.b[1] + g.b[3]) / 2;
  return `translate(${(cx - gx * S).toFixed(2)} ${(cy + gy * S).toFixed(2)}) scale(${S.toFixed(5)} ${(-S).toFixed(5)})`;
}

/** Glyph so platzieren, dass seine Mitte horizontal bei cx liegt und die Höhe `fontY` (Font) auf cy. */
function anchored(g: Glyph, cx: number, cy: number, fontY: number): string {
  const gx = (g.b[0] + g.b[2]) / 2;
  return `translate(${(cx - gx * S).toFixed(2)} ${(cy + fontY * S).toFixed(2)}) scale(${S.toFixed(5)} ${(-S).toFixed(5)})`;
}

interface RestShape {
  glyph: GlyphName;
  dots: number;
}
const REST_FOR_BEATS: Record<number, RestShape> = {
  0.5: { glyph: 'restEighth', dots: 0 },
  1: { glyph: 'restQuarter', dots: 0 },
  1.5: { glyph: 'restQuarter', dots: 1 },
  2: { glyph: 'restHalf', dots: 0 },
  3: { glyph: 'restHalf', dots: 1 },
  4: { glyph: 'restWhole', dots: 0 },
};

interface LayoutItem {
  index: number;
  x: number;
  start: number;
  beats: number;
  syllable: string;
  rest: boolean;
  // Notenkopf bzw. Pause
  glyphD: string;
  glyphTransform: string;
  accidentalD: string | null;
  accidentalTransform: string;
  ledgers: { x1: number; x2: number; y: number }[];
  stem: { x: number; y1: number; y2: number } | null;
  flagTransform: string | null;
  dots: { x: number; y: number }[];
}

let nextId = 0;

/**
 * Scrollende Notenzeile: Die Noten laufen von rechts auf die Abspiellinie zu.
 * Notenabstand ist proportional zur Zeit – lange Noten sehen also auch lang aus.
 */
@Component({
  selector: 'app-staff',
  templateUrl: './staff.html',
  styleUrl: './staff.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffComponent {
  readonly song = input.required<Song>();
  /** Position in Schlägen (kann negativ sein = Einzähler) */
  readonly beat = input(0);
  readonly currentIndex = input(-1);
  readonly viewWidth = input(680);
  readonly playheadX = input(210);
  readonly showTime = input(true);
  readonly showBars = input(true);
  readonly showPlayhead = input(true);
  /** Beim Warte-Modus springt die Zeile nicht, sondern gleitet zur nächsten Note */
  readonly smooth = input(false);
  /** Ergebnis pro Note beim Mitspielen mit Mikrofon */
  readonly results = input<readonly (string | null | undefined)[]>([]);

  protected readonly height = HEIGHT;
  protected readonly lyricY = LYRIC_Y;
  protected readonly lineYs = LINE_YS;
  protected readonly clipId = `staff-clip-${nextId++}`;
  protected readonly clef = GLYPHS.gClef.d;
  protected readonly flagD = GLYPHS.flag8.d;
  protected readonly clefTransform = `translate(10 ${Y_BOTTOM - LINE_GAP}) scale(${S.toFixed(5)} ${(-S).toFixed(5)})`;
  protected readonly timeTop = Y_BOTTOM - 3 * LINE_GAP;
  protected readonly timeBottom = Y_BOTTOM - LINE_GAP;

  /** Vorzeichen der Tonart, fest links hinter dem Notenschlüssel */
  protected readonly keySignature = computed(() => {
    const key = this.song().key ?? 0;
    const n = Math.abs(key);
    const g = GLYPHS[key > 0 ? 'sharp' : 'flat'];
    const steps = key > 0 ? SHARP_STEPS : FLAT_STEPS;
    const advance = ((g.b[2] - g.b[0]) * S) + 3;
    const items = Array.from({ length: n }, (_, i) => ({
      d: g.d,
      transform: anchored(g, KEY_X0 + advance * i + advance / 2, yOfStep(steps[i]), HEAD_CENTER),
    }));
    return { items, width: n ? advance * n + 4 : 0 };
  });

  protected readonly timeX = computed(() => 68 + this.keySignature().width);
  protected readonly clipX = computed(() => (this.showTime() ? this.timeX() + 24 : 62 + this.keySignature().width));

  protected readonly scroll = computed(
    () => `translate(${(this.playheadX() - this.beat() * PX_PER_BEAT).toFixed(2)}px, 0px)`,
  );

  protected readonly layout = computed(() => {
    const song = this.song();
    const marks = accidentalMarks(song.notes, song.key ?? 0, song.beatsPerBar, song.pickup ?? 0);
    const items = song.notes.map((n, index) =>
      this.layoutNote(n.pitch, n.start, n.beats, n.syllable ?? '', index, marks[index]),
    );
    const bars: { x: number; final: boolean }[] = [];
    const pickup = song.pickup ?? 0;
    for (let b = pickup > 0 ? pickup : song.beatsPerBar; b <= song.totalBeats + 1e-6; b += song.beatsPerBar) {
      bars.push({ x: b * PX_PER_BEAT - PX_PER_BEAT * 0.5, final: b >= song.totalBeats - 1e-6 });
    }
    // Endet das Stück genau auf einem Auftakt-Versatz (Schlussstrich), sorgt der letzte Strich dafür
    if (!bars.length || !bars[bars.length - 1].final) {
      bars.push({ x: song.totalBeats * PX_PER_BEAT - PX_PER_BEAT * 0.5, final: true });
    }
    return { items, bars };
  });

  private layoutNote(
    pitch: string | null,
    start: number,
    beats: number,
    syllable: string,
    index: number,
    mark: AccidentalMark,
  ): LayoutItem {
    const x = start * PX_PER_BEAT;
    const base: LayoutItem = {
      index,
      x,
      start,
      beats,
      syllable,
      rest: pitch === null,
      glyphD: '',
      glyphTransform: '',
      accidentalD: null,
      accidentalTransform: '',
      ledgers: [],
      stem: null,
      flagTransform: null,
      dots: [],
    };

    if (pitch === null) return this.layoutRest(base);

    const p = parsePitch(pitch);
    const cy = yOfStep(p.step);
    const head: GlyphName = beats >= 4 ? 'headWhole' : beats >= 2 ? 'headHalf' : 'headBlack';
    const g = GLYPHS[head];
    const halfW = ((g.b[2] - g.b[0]) * S) / 2;
    base.glyphD = g.d;
    base.glyphTransform = centered(g, x, cy);

    // Vorzeichen (nur, wenn die Tonart oder ein früheres Vorzeichen im Takt es nicht schon festlegt)
    if (mark) {
      const acc = GLYPHS[mark];
      base.accidentalD = acc.d;
      base.accidentalTransform = anchored(acc, x - halfW - 11, cy, HEAD_CENTER);
    }

    // Hilfslinien über/unter dem System
    const ledgerHalf = halfW + 6;
    for (let st = BASE_STEP - 2; st >= p.step; st -= 2) {
      base.ledgers.push({ x1: x - ledgerHalf, x2: x + ledgerHalf, y: yOfStep(st) });
    }
    for (let st = BASE_STEP + 10; st <= p.step; st += 2) {
      base.ledgers.push({ x1: x - ledgerHalf, x2: x + ledgerHalf, y: yOfStep(st) });
    }

    // Hals: ab der mittleren Linie (H) nach unten, sonst nach oben
    if (beats < 4) {
      const down = p.step >= BASE_STEP + 4;
      const sx = down ? x - halfW + 0.8 : x + halfW - 0.8;
      const yEnd = down ? cy + STEM_LEN : cy - STEM_LEN;
      base.stem = { x: sx, y1: cy, y2: yEnd };
      if (beats <= 0.5) {
        const f = GLYPHS.flag8;
        const top = f.b[3];
        base.flagTransform = down
          ? `translate(${(sx - 0.8).toFixed(2)} ${(yEnd - top * S).toFixed(2)}) scale(${S.toFixed(5)} ${S.toFixed(5)})`
          : `translate(${(sx - 0.8).toFixed(2)} ${(yEnd + top * S).toFixed(2)}) scale(${S.toFixed(5)} ${(-S).toFixed(5)})`;
      }
    }

    // Punkte (Notenwert × 1,5)
    if (beats === 1.5 || beats === 3) {
      const onLine = (p.step - BASE_STEP) % 2 === 0;
      base.dots.push({ x: x + halfW + 7, y: onLine ? cy - LINE_GAP / 2 : cy });
    }
    return base;
  }

  private layoutRest(item: LayoutItem): LayoutItem {
    const shape = REST_FOR_BEATS[item.beats] ?? REST_FOR_BEATS[1];
    const g = GLYPHS[shape.glyph];
    const mid = Y_BOTTOM - 2 * LINE_GAP;
    let cy = mid;
    if (shape.glyph === 'restHalf') cy = mid - ((g.b[3] - g.b[1]) * S) / 2; // sitzt auf der mittleren Linie
    if (shape.glyph === 'restWhole') cy = mid - LINE_GAP + ((g.b[3] - g.b[1]) * S) / 2; // hängt an der vierten Linie
    item.glyphD = g.d;
    item.glyphTransform = centered(g, item.x, cy);
    if (shape.dots) item.dots.push({ x: item.x + 14, y: mid - LINE_GAP / 2 });
    return item;
  }

  protected resultOf(index: number): string {
    return this.results()[index] ?? '';
  }

  protected stateOf(index: number): 'past' | 'now' | 'future' {
    const cur = this.currentIndex();
    return index < cur ? 'past' : index === cur ? 'now' : 'future';
  }
}
