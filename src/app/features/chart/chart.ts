import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AudioService } from '../../core/audio.service';
import { Fingering } from '../../core/fingerings';
import { soundingPitch } from '../../core/instruments';
import { frequencyOf, germanName, pitchFromMidi, transposePitch } from '../../core/notes';
import { SettingsService } from '../../core/settings.service';
import { Song } from '../../core/songs';
import { FluteComponent } from '../../ui/flute/flute';
import { StaffComponent } from '../../ui/staff/staff';

const HOLE_R = 5.2;
const HOLE_GAP = 13;
const HAND_GAP = 8;

interface MiniHole {
  cx: number;
  state: 0 | 0.5 | 1;
  left: boolean;
}

interface Row {
  midi: number;
  name: string;
  fingering: Fingering;
  holes: MiniHole[];
}

/**
 * Grifftabelle zum Nachschlagen: alle Töne der gewählten Flöte. Ein Tipp zeigt den Griff groß an der Flöte.
 * Die Namen sind die der geschriebenen Noten (so, wie sie im Notenbild stehen).
 */
@Component({
  selector: 'app-chart',
  imports: [FluteComponent, StaffComponent],
  templateUrl: './chart.html',
  styleUrl: './chart.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent {
  private readonly audio = inject(AudioService);
  protected readonly settings = inject(SettingsService);

  protected readonly selected = signal<number | null>(null);

  protected readonly rows = computed<Row[]>(() => {
    const inst = this.settings.instrument();
    const leftCount = inst.leftHoleCount;
    return inst.midis.map((midi) => {
      const sounding = pitchFromMidi(midi);
      const fingering = inst.fingeringFor(sounding)!;
      const holes = fingering.map((state, i) => ({
        cx: HOLE_R + i * HOLE_GAP + (i >= leftCount ? HAND_GAP : 0),
        state,
        left: i < leftCount,
      }));
      return { midi, name: germanName(transposePitch(sounding, inst.writtenShift)), fingering, holes };
    });
  });

  protected readonly miniWidth = computed(() => {
    const n = this.settings.instrument().holeLabels.length;
    return HOLE_R * 2 + (n - 1) * HOLE_GAP + HAND_GAP;
  });

  /** Die Töne in zwei Reihen: untere Oktave und obere Oktave (ab einer Oktave über dem tiefsten Ton) */
  protected readonly groups = computed(() => {
    const rows = this.rows();
    if (!rows.length) return [];
    const low = rows[0].midi;
    return [
      { title: 'Untere Oktave', hint: 'Normal anblasen', rows: rows.filter((r) => r.midi < low + 12) },
      { title: 'Obere Oktave', hint: 'Etwas stärker anblasen', rows: rows.filter((r) => r.midi >= low + 12) },
    ].filter((g) => g.rows.length);
  });

  protected readonly current = computed(() => this.rows().find((r) => r.midi === this.selected()) ?? this.rows()[0]);

  protected readonly written = computed(() => {
    const inst = this.settings.instrument();
    return transposePitch(pitchFromMidi(this.current().midi), inst.writtenShift);
  });

  /** Einzelne Note als Mini-„Lied“ für die Notenzeile */
  protected readonly noteSong = computed<Song>(() => ({
    id: 'tabelle',
    title: '',
    category: 'uebung',
    level: 1,
    beatsPerBar: 4,
    bpm: 60,
    totalBeats: 1,
    notes: [{ pitch: this.written(), beats: 1, start: 0 }],
  }));

  protected readonly holeR = HOLE_R;

  constructor() {
    // Neue Flöte → Auswahl zurücksetzen (Standard: das G der Vorlage)
    effect(() => {
      const inst = this.settings.instrument();
      untracked(() => this.selected.set(this.defaultMidi(inst)));
    });
  }

  private defaultMidi(inst: ReturnType<SettingsService['instrument']>): number {
    const g = soundingPitch(inst, 'G5');
    return inst.midis.find((m) => pitchFromMidi(m) === g) ?? inst.midis[0];
  }

  protected select(row: Row): void {
    this.selected.set(row.midi);
  }

  protected async hear(): Promise<void> {
    await this.audio.resume();
    this.audio.tone(frequencyOf(pitchFromMidi(this.current().midi)), this.audio.ctx.currentTime + 0.05, 1.1);
  }
}
