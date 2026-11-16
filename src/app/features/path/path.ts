import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { pathFor, PathStep } from '../../core/path';
import { ProgressService } from '../../core/progress.service';
import { SettingsService } from '../../core/settings.service';
import { Song, songById } from '../../core/songs';
import { StarsComponent } from '../../ui/stars/stars';

type Status = 'done' | 'open' | 'locked';

interface StepView extends PathStep {
  stars: number;
  status: Status;
  number: number;
  /** Titel des Schritts davor (für den Hinweis bei gesperrten Schritten) */
  after: string | null;
}

/** Lernpfad: Schritte von leicht nach schwer, mit Sternen und Freischaltung. */
@Component({
  selector: 'app-path',
  imports: [StarsComponent],
  templateUrl: './path.html',
  styleUrl: './path.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathComponent {
  protected readonly progress = inject(ProgressService);
  private readonly settings = inject(SettingsService);

  readonly openSong = output<Song>();
  readonly openPool = output<string>();

  protected readonly groups = computed(() => {
    const stars = this.progress.stars();
    const all = this.progress.unlockAll();
    let number = 0;
    let previous: StepView | null = null;
    return pathFor(this.settings.instrument()).map((group) => ({
      title: group.title,
      intro: group.intro,
      steps: group.steps.map((step): StepView => {
        const s = stars[step.id] ?? 0;
        const unlocked = all || previous === null || previous.stars > 0;
        const view: StepView = {
          ...step,
          stars: s,
          status: s > 0 ? 'done' : unlocked ? 'open' : 'locked',
          number: ++number,
          after: previous?.title ?? null,
        };
        previous = view;
        return view;
      }),
    }));
  });

  protected readonly summary = computed(() => {
    const steps = this.groups().flatMap((g) => g.steps);
    const done = steps.filter((s) => s.status === 'done').length;
    const starTotal = steps.reduce((sum, s) => sum + s.stars, 0);
    return { done, total: steps.length, stars: starTotal, maxStars: steps.length * 3, ratio: steps.length ? done / steps.length : 0 };
  });

  protected start(step: StepView): void {
    if (step.status === 'locked') return;
    if (step.kind === 'pool') this.openPool.emit(step.ref);
    else {
      const song = songById(step.ref);
      if (song) this.openSong.emit(song);
    }
  }

  protected toggleUnlockAll(): void {
    this.progress.unlockAll.update((v) => !v);
  }

  protected reset(): void {
    if (confirm('Alle Sterne löschen und neu anfangen?')) this.progress.reset();
  }
}
