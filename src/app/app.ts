import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ProgressService } from './core/progress.service';
import { PlayerService } from './core/player.service';
import { Song } from './core/songs';
import { ChartComponent } from './features/chart/chart';
import { PathComponent } from './features/path/path';
import { PracticeComponent } from './features/practice/practice';
import { SettingsComponent } from './features/settings/settings';
import { TrainerComponent } from './features/trainer/trainer';

type Tab = 'pfad' | 'lieder' | 'uebungen' | 'quiz' | 'tabelle' | 'einstellungen';

@Component({
  selector: 'app-root',
  imports: [PracticeComponent, TrainerComponent, SettingsComponent, PathComponent, ChartComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly player = inject(PlayerService);
  private readonly progress = inject(ProgressService); // früh anlegen, damit Sterne auch von anderen Seiten aus gesammelt werden

  /** Wer noch keinen Stern hat, startet im Lernpfad; sonst bei den Liedern. */
  protected readonly tab = signal<Tab>(this.progress.hasAny() ? 'lieder' : 'pfad');
  protected readonly poolRequest = signal<string | null>(null);
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'pfad', label: 'Lernpfad' },
    { id: 'lieder', label: 'Lieder' },
    { id: 'uebungen', label: 'Töne' },
    { id: 'quiz', label: 'Quiz' },
    { id: 'tabelle', label: 'Griffe' },
  ];

  protected openSong(song: Song): void {
    this.player.selectSong(song);
    this.tab.set(song.category === 'lied' ? 'lieder' : 'uebungen');
  }

  protected openPool(id: string): void {
    this.poolRequest.set(id);
    this.tab.set('quiz');
  }
}
