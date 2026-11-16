import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { PlayAlongService } from './playalong.service';
import { PlayerService } from './player.service';

const KEY = 'floetenlehrer.progress.v1';

interface Stored {
  stars?: Record<string, number>;
  unlockAll?: boolean;
}

function load(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}

/** Sterne für eine Quote getroffener Noten: ab 50 % einen, ab 75 % zwei, ab 90 % drei. */
export function starsForRatio(ratio: number): number {
  return ratio >= 0.9 ? 3 : ratio >= 0.75 ? 2 : ratio >= 0.5 ? 1 : 0;
}

/** Sterne für eine Serie richtiger Antworten im Griff-Trainer: 5, 8 und 12 in Folge. */
export const STREAK_GOALS = [5, 8, 12] as const;
export function starsForStreak(streak: number): number {
  return STREAK_GOALS.filter((goal) => streak >= goal).length;
}

export const songStepId = (songId: string) => `song:${songId}`;
export const poolStepId = (poolId: string) => `pool:${poolId}`;

/**
 * Lernfortschritt: bis zu drei Sterne pro Schritt im Lernpfad. Wird im Browser gespeichert.
 * Sterne gibt es nur nach oben – ein schlechterer Versuch nimmt nichts weg.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly player = inject(PlayerService);
  private readonly playAlong = inject(PlayAlongService);
  private readonly stored = load();

  readonly stars = signal<Record<string, number>>(this.stored.stars ?? {});
  /** Reihenfolge nicht erzwingen: alle Schritte offen */
  readonly unlockAll = signal(this.stored.unlockAll === true);

  constructor() {
    effect(() => {
      const value: Stored = { stars: this.stars(), unlockAll: this.unlockAll() };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        /* nicht speicherbar – egal */
      }
    });

    // Stück mit Mikrofon (normal oder Warte-Modus) komplett gespielt → Sterne nach Trefferquote
    effect(() => {
      const summary = this.playAlong.summary();
      const id = this.player.song().id;
      if (!summary.complete) return;
      untracked(() => this.record(songStepId(id), starsForRatio(summary.hits / summary.all)));
    });
  }

  starsFor(id: string): number {
    return this.stars()[id] ?? 0;
  }

  /** Merkt sich die Sterne, falls es mehr sind als bisher. */
  record(id: string, stars: number): void {
    if (stars <= this.starsFor(id)) return;
    this.stars.update((s) => ({ ...s, [id]: Math.min(3, stars) }));
  }

  hasAny(): boolean {
    return Object.values(this.stars()).some((n) => n > 0);
  }

  reset(): void {
    this.stars.set({});
  }
}
