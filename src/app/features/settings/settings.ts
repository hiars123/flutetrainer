import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FingeringSystem, INSTRUMENTS, InstrumentKind, soundingPitch } from '../../core/instruments';
import { germanName } from '../../core/notes';
import { SettingsService } from '../../core/settings.service';
import { FluteComponent } from '../../ui/flute/flute';

interface KindOption {
  kind: InstrumentKind;
  title: string;
  text: string;
}

const KINDS: KindOption[] = [
  {
    kind: 'sopran',
    title: 'Sopranblockflöte',
    text: 'In C, die Flöte aus der Schule. Die Noten stehen eine Oktave tiefer, als sie klingt.',
  },
  {
    kind: 'alt',
    title: 'Altblockflöte',
    text: 'In F, klingt eine Quinte tiefer. Die Stücke werden so verschoben, dass du dieselben Griffe wie auf der Sopranflöte nutzt.',
  },
  {
    kind: 'whistle',
    title: 'Tin Whistle in D',
    text: 'Sechs Löcher, kein Daumenloch. Die Stücke werden nach D-Dur verschoben; Stücke mit Halbtönen fehlen noch.',
  },
];

@Component({
  selector: 'app-settings',
  imports: [FluteComponent],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly kinds = KINDS;

  protected readonly instrument = this.settings.instrument;
  protected readonly isRecorder = computed(() => this.instrument().family === 'recorder');

  /** Beispiel-Griff zum Ausprobieren: der Ton, der in der Vorlage „G“ ist, wie er auf dieser Flöte klingt */
  protected readonly sample = computed(() => {
    const inst = this.instrument();
    const pitch = soundingPitch(inst, 'G5');
    return { fingering: inst.fingeringFor(pitch), name: germanName(pitch) };
  });

  protected chooseKind(kind: InstrumentKind): void {
    if (kind === 'whistle') return this.settings.instrumentId.set('whistle-d');
    const system: FingeringSystem = this.instrument().system ?? 'barock';
    this.settings.instrumentId.set(`${kind}-${system}`);
  }

  protected chooseSystem(system: FingeringSystem): void {
    const inst = this.instrument();
    if (inst.family !== 'recorder') return;
    const id = `${inst.kind}-${system}`;
    if (INSTRUMENTS.some((i) => i.id === id)) this.settings.instrumentId.set(id);
  }

  protected toggleMic(): void {
    this.settings.microphoneFeature.update((v) => !v);
  }
}
