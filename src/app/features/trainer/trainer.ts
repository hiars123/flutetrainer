import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { AudioService } from '../../core/audio.service';
import { NotePool, POOLS, poolsFor } from '../../core/exercises';
import { allOpen, Fingering, HoleState, sameFingering } from '../../core/fingerings';
import { frequencyOf, germanName, Pitch, transposePitch } from '../../core/notes';
import { poolStepId, ProgressService, STREAK_GOALS, starsForStreak } from '../../core/progress.service';
import { SettingsService } from '../../core/settings.service';
import { Song } from '../../core/songs';
import { FluteComponent } from '../../ui/flute/flute';
import { StarsComponent } from '../../ui/stars/stars';
import { StaffComponent } from '../../ui/staff/staff';

type Mode = 'griff' | 'note';
type Phase = 'asking' | 'correct';

/**
 * Griff-Trainer, zwei Richtungen:
 *  - „Note → Griff“: Eine Note ist gezeigt, die Löcher werden an der Flöte angetippt.
 *  - „Griff → Note“: Der Griff ist gezeigt, der Tonname wird gewählt.
 */
@Component({
  selector: 'app-trainer',
  imports: [FluteComponent, StaffComponent, StarsComponent],
  templateUrl: './trainer.html',
  styleUrl: './trainer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainerComponent implements OnDestroy {
  private readonly audio = inject(AudioService);
  protected readonly settings = inject(SettingsService);
  protected readonly progress = inject(ProgressService);

  /** Vom Lernpfad gewünschte Übung (Kennung eines Tonvorrats) */
  readonly startPool = input<string | null>(null);
  protected readonly goals = STREAK_GOALS;

  /** Übungsvorräte, deren Töne die gewählte Flöte alle greifen kann – mit Tönen, wie sie auf dieser Flöte klingen */
  protected readonly pools = computed(() => poolsFor(this.settings.instrument()));
  protected readonly poolId = signal(POOLS[0].id);
  protected readonly mode = signal<Mode>('griff');

  protected readonly target = signal<Pitch>('C5');
  protected readonly phase = signal<Phase>('asking');
  protected readonly userFingering = signal<Fingering>(allOpen(8));
  protected readonly hint = signal(false);
  protected readonly wrongChoices = signal<readonly string[]>([]);

  protected readonly streak = signal(0);
  protected readonly best = signal(0);
  protected readonly solved = signal(0);

  private usedHelp = false;
  private madeMistake = false;
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly pool = computed<NotePool>(() => {
    const pools = this.pools();
    return pools.find((p) => p.id === this.poolId()) ?? pools[0];
  });
  protected readonly poolStars = computed(() => this.progress.stars()[poolStepId(this.pool().id)] ?? 0);
  protected readonly poolNames = computed(() => [...new Set(this.pool().pitches.map(germanName))].join(', '));
  protected readonly targetFingering = computed(() => this.settings.instrument().fingeringFor(this.target())!);
  /** Notenzeile zeigt die geschriebene Tonhöhe (Sopran und Whistle: eine Oktave tiefer) */
  protected readonly writtenTarget = computed(() => transposePitch(this.target(), this.settings.instrument().writtenShift));
  protected readonly targetName = computed(() => germanName(this.target()));

  /** Einzelne Note als Mini-„Lied“, damit die Notenzeile sie anzeigen kann. */
  protected readonly questionSong = computed<Song>(() => ({
    id: 'frage',
    title: '',
    category: 'uebung',
    level: 1,
    beatsPerBar: 4,
    bpm: 60,
    totalBeats: 1,
    notes: [{ pitch: this.writtenTarget(), beats: 1, start: 0 }],
  }));

  protected readonly choices = computed(() => {
    const names = [...new Set(this.pool().pitches.map(germanName))];
    const right = this.targetName();
    const others = shuffle(names.filter((n) => n !== right)).slice(0, 3);
    return shuffle([right, ...others]);
  });

  protected readonly showStaff = computed(() => this.mode() === 'griff' || this.phase() === 'correct');

  /** Gestrichelte Ringe: im Hinweis-Modus zeigt die Flöte, was noch fehlt. */
  protected readonly flutePreview = computed(() => (this.mode() === 'griff' && this.hint() ? this.targetFingering() : null));
  protected readonly fluteFingering = computed(() => (this.mode() === 'griff' ? this.userFingering() : this.targetFingering()));

  constructor() {
    // Vom Lernpfad geöffnet → diese Übung wählen
    effect(() => {
      const wanted = this.startPool();
      untracked(() => {
        if (wanted && this.pools().some((p) => p.id === wanted)) this.setPool(wanted);
      });
    });
    // Neue Flöte → Aufgabe neu stellen (andere Löcher, andere Töne)
    effect(() => {
      this.settings.instrumentId();
      untracked(() => {
        if (!this.pools().some((p) => p.id === this.poolId())) this.poolId.set(this.pools()[0].id);
        this.next();
      });
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.next();
  }

  protected setPool(id: string): void {
    this.poolId.set(id);
    this.next();
  }

  protected next(): void {
    clearTimeout(this.timer);
    const pitches = this.pool().pitches;
    const candidates = pitches.length > 1 ? pitches.filter((p) => p !== this.target()) : pitches;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    this.target.set(pick);
    this.phase.set('asking');
    this.userFingering.set(allOpen(this.settings.instrument().holeLabels.length));
    this.hint.set(false);
    this.wrongChoices.set([]);
    this.usedHelp = false;
    this.madeMistake = false;
  }

  protected toggleHole(index: number): void {
    if (this.mode() !== 'griff' || this.phase() !== 'asking') return;
    const next = [...this.userFingering()] as HoleState[];
    next[index] = next[index] ? 0 : 1;
    this.userFingering.set(next);
    if (sameFingering(next, this.targetFingering())) this.succeed();
  }

  protected choose(name: string): void {
    if (this.phase() !== 'asking') return;
    if (name === this.targetName()) {
      this.succeed();
    } else {
      this.madeMistake = true;
      this.wrongChoices.update((w) => [...w, name]);
    }
  }

  protected toggleHint(): void {
    this.hint.update((h) => !h);
    if (this.hint()) this.usedHelp = true;
  }

  protected clear(): void {
    this.userFingering.set(allOpen(this.settings.instrument().holeLabels.length));
  }

  protected async listen(): Promise<void> {
    await this.audio.resume();
    this.audio.tone(frequencyOf(this.target()), this.audio.ctx.currentTime + 0.05, 1.1);
  }

  private succeed(): void {
    this.phase.set('correct');
    if (this.usedHelp || this.madeMistake) {
      this.streak.set(0);
    } else {
      this.streak.update((s) => s + 1);
      this.solved.update((s) => s + 1);
      this.best.update((b) => Math.max(b, this.streak()));
      this.progress.record(poolStepId(this.pool().id), starsForStreak(this.streak()));
    }
    void this.listen();
    this.timer = setTimeout(() => this.next(), 1800);
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
