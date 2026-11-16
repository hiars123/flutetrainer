import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { allOpen, Fingering } from '../../core/fingerings';
import { Instrument } from '../../core/instruments';

interface HoleGeometry {
  index: number;
  label: string;
  cx: number;
  cy: number;
  double: boolean;
  left: boolean;
  isThumb: boolean;
}

const AXIS_X = 130;

/** Blockflöte (hochkant): Daumenloch liegt hinten, links neben Loch 1. */
const RECORDER_Y = [150, 172, 226, 280, 356, 410, 464, 520];
/** Tin Whistle: sechs gleichmäßig verteilte Löcher, kein Daumenloch. */
const WHISTLE_Y = [200, 260, 320, 405, 465, 525];

/**
 * Zeichnet die Flöte hochkant (Mundstück oben) und zeigt, welche Löcher zugedeckt sind.
 * Fingerpolster: blau = linke Hand, gelb = rechte Hand. Gestrichelte Ringe zeigen, was beim nächsten Ton wechselt.
 */
@Component({
  selector: 'app-flute',
  templateUrl: './flute.html',
  styleUrl: './flute.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FluteComponent {
  readonly instrument = input.required<Instrument>();
  readonly fingering = input<Fingering | null>(null);
  /** Griff des nächsten Tons (für die Vorschau) */
  readonly next = input<Fingering | null>(null);
  /** Löcher antippbar machen (Griff-Trainer) */
  readonly interactive = input(false);
  readonly caption = input('Griffbild');

  readonly holeToggled = output<number>();

  protected readonly axisX = AXIS_X;
  protected readonly isRecorder = computed(() => this.instrument().family === 'recorder');

  protected readonly geometry = computed<HoleGeometry[]>(() => {
    const inst = this.instrument();
    const ys = inst.family === 'recorder' ? RECORDER_Y : WHISTLE_Y;
    const recorder = inst.family === 'recorder';
    return ys.map((cy, index) => ({
      index,
      label: inst.holeLabels[index],
      cx: recorder && index === 0 ? 66 : AXIS_X,
      cy,
      double: index >= inst.doubleFrom,
      left: index < inst.leftHoleCount,
      isThumb: recorder && index === 0,
    }));
  });

  /** Senkrechte Klammern für „linke Hand“ und „rechte Hand“ */
  protected readonly hands = computed(() => {
    const g = this.geometry();
    const left = g.filter((h) => h.left && !h.isThumb);
    const right = g.filter((h) => !h.left);
    const span = (list: HoleGeometry[]) => ({
      y1: list[0].cy - 22,
      y2: list[list.length - 1].cy + 22,
      mid: (list[0].cy + list[list.length - 1].cy) / 2,
    });
    return { left: span(left), right: span(right) };
  });

  protected readonly holes = computed(() => {
    const cur = this.fingering() ?? allOpen(this.instrument().holeLabels.length);
    const next = this.next();
    return this.geometry().map((h) => ({
      ...h,
      state: cur[h.index],
      changes: !!next && next[h.index] !== cur[h.index],
      nextState: next ? next[h.index] : cur[h.index],
    }));
  });

  protected readonly description = computed(() => {
    const f = this.fingering();
    const name = this.instrument().name;
    if (!f) return `${this.caption()}, ${name}`;
    const labels = this.instrument().holeLabels;
    const closed = f
      .map((s, i) => (s ? labels[i] + (s === 0.5 ? ' halb' : '') : ''))
      .filter(Boolean)
      .join(', ');
    return `${this.caption()}, ${name}: zugedeckt ${closed || 'nichts'}`;
  });

  protected press(index: number): void {
    if (this.interactive()) this.holeToggled.emit(index);
  }
}
