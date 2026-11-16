import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { MicService } from './mic.service';
import { midiOf } from './notes';
import { PlayerService } from './player.service';
import { SettingsService } from './settings.service';

export type NoteResult = 'hit' | 'miss' | null;

/** Tonhöhe, die ankommen muss, bevor eine Note als „getroffen“ zählt, und Einschwingzeit nach dem Notenanfang. */
const GRACE_S = 0.15;
const MAX_NEED_S = 0.2;

/**
 * Mitspielen mit Mikrofon (Pro-Vorschau): vergleicht pro Note, ob der erkannte Ton zum geforderten passt.
 * Es zählt der Tonname, nicht die Oktave – Blockflöten springen beim Anblasen gern in die Oktave.
 */
@Injectable({ providedIn: 'root' })
export class PlayAlongService {
  private readonly player = inject(PlayerService);
  private readonly mic = inject(MicService);
  private readonly settings = inject(SettingsService);

  readonly results = signal<readonly NoteResult[]>([]);
  /** Zu welchem Stück die Ergebnisse gehören (damit ein Stückwechsel keine fremden Ergebnisse zeigt) */
  private readonly resultsSong = signal<string | null>(null);

  /** Mikrofon-Feature freigeschaltet und das Mikrofon hört gerade zu */
  readonly active = computed(() => this.settings.microphoneFeature() && this.mic.state() === 'listening');

  readonly summary = computed(() => {
    const notes = this.player.song().notes;
    const results = this.results();
    let hits = 0;
    let total = 0;
    notes.forEach((n, i) => {
      if (!n.pitch || !results[i]) return;
      total++;
      if (results[i] === 'hit') hits++;
    });
    const all = notes.filter((n) => n.pitch).length;
    return {
      hits,
      total,
      all,
      complete: total === all && all > 0 && this.resultsSong() === this.player.song().id,
    };
  });

  private wasPlaying = false;
  private idx = -1;
  private matched = 0;
  private heard = false; // Mikrofon war während dieser Note aktiv
  private lastTime = performance.now();

  constructor() {
    effect(() => {
      const state = {
        playing: this.player.playing(),
        idx: this.player.currentIndex(),
        beat: this.player.beat(),
        midi: this.mic.midi(),
        active: this.active(),
      };
      this.player.song(); // Songwechsel ebenfalls beobachten
      untracked(() => this.tick(state));
    });
    // Neues Stück oder neue Flöte → alte Ergebnisse verwerfen
    effect(() => {
      this.player.song();
      this.settings.instrumentId();
      untracked(() => this.reset());
    });
  }

  /** Trägt das Ergebnis einer Note ein (auch vom Warte-Modus genutzt). */
  setResult(index: number, result: NoteResult): void {
    this.resultsSong.set(this.player.song().id);
    this.results.update((r) => {
      const next = [...r];
      next[index] = result;
      return next;
    });
  }

  reset(): void {
    this.resultsSong.set(null);
    this.results.set([]);
    this.idx = -1;
    this.matched = 0;
    this.heard = false;
  }

  private tick(s: { playing: boolean; idx: number; beat: number; midi: number | null; active: boolean }): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!s.playing) {
      if (this.wasPlaying) this.finalize();
      this.wasPlaying = false;
      return;
    }
    if (!this.wasPlaying) {
      this.wasPlaying = true;
      if (s.beat <= 0) this.reset(); // Start von vorn
    }
    if (s.idx !== this.idx) {
      this.finalize();
      this.idx = s.idx;
      this.matched = 0;
      this.heard = false;
    }
    if (!s.active || s.idx < 0) return;
    this.heard = true;

    const note = this.player.sounding().notes[s.idx];
    if (!note?.pitch) return;
    const elapsed = ((s.beat - note.start) * 60) / this.player.bpm();
    if (elapsed < GRACE_S || s.midi === null) return;
    if ((((s.midi - midiOf(note.pitch)) % 12) + 12) % 12 === 0) this.matched += dt;
  }

  private finalize(): void {
    const i = this.idx;
    const note = i >= 0 ? this.player.sounding().notes[i] : undefined;
    if (!note?.pitch || !this.heard) return;
    const duration = (note.beats * 60) / this.player.bpm();
    const need = Math.min(MAX_NEED_S, Math.max(0.03, 0.5 * (duration - GRACE_S)));
    const result: NoteResult = this.matched >= need ? 'hit' : 'miss';
    this.setResult(i, result);
    this.idx = -1;
  }
}
