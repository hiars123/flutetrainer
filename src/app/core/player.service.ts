import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AudioService } from './audio.service';
import { Fingering } from './fingerings';
import { countInStart, transposeSong } from './songs';
import { frequencyOf } from './notes';
import { SettingsService } from './settings.service';
import { Song, SONGS, SongNote } from './songs';

const LOOKAHEAD_S = 0.14; // wie weit im Voraus Töne an die Audio-Engine übergeben werden
const TICK_MS = 25;

export const MIN_BPM = 30;
export const MAX_BPM = 160;

/**
 * Transport für ein Lied: Takt, Einzähler, Metronom und Ton.
 * Die Position (`beat`) wird aus der Uhr der Audio-Engine abgeleitet, damit Bild und Klang synchron bleiben.
 * Tempowechsel während des Spielens funktionieren über einen „Anker“ (Schlag ↔ Zeit).
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly audio = inject(AudioService);
  private readonly settings = inject(SettingsService);

  /** Das Stück in der Vorlage (Sopran-Lage in C) */
  readonly song = signal<Song>(SONGS[0]);
  /** Dasselbe Stück, wie es auf der gewählten Flöte klingt (Altflöte: tiefer, Whistle: in D) */
  readonly sounding = computed(() => transposeSong(this.song(), this.settings.instrument().songShift));
  /** … und wie es in den Noten steht (Sopran und Whistle werden eine Oktave tiefer notiert) */
  readonly written = computed(() => {
    const i = this.settings.instrument();
    return transposeSong(this.song(), i.songShift + i.writtenShift);
  });
  readonly bpm = signal(SONGS[0].bpm);
  readonly playing = signal(false);
  /** Position in Schlägen; vor dem Start negativ (Einzähler). */
  readonly beat = signal(0);

  readonly metronome = signal(true);
  readonly sound = signal(true);
  readonly countIn = signal(true);
  readonly loop = signal(false);

  /** Index der gerade erklingenden Note (auch Pausen), -1 vor dem Start. */
  readonly currentIndex = computed(() => indexAt(this.song().notes, this.beat()));
  /** Aktuelle Note mit klingender Tonhöhe */
  readonly currentNote = computed<SongNote | null>(() => this.sounding().notes[this.currentIndex()] ?? null);

  /** Nächste echte Note nach der aktuellen (für die Vorschau an der Flöte). */
  readonly nextNote = computed<SongNote | null>(() => {
    const notes = this.sounding().notes;
    for (let i = this.currentIndex() + 1; i < notes.length; i++) if (notes[i].pitch) return notes[i];
    return null;
  });

  readonly currentFingering = computed<Fingering | null>(() => {
    const p = this.currentNote()?.pitch;
    return p ? this.settings.instrument().fingeringFor(p) : null;
  });
  readonly nextFingering = computed<Fingering | null>(() => {
    const p = this.nextNote()?.pitch;
    return p ? this.settings.instrument().fingeringFor(p) : null;
  });

  /** Während des Einzählens: welcher Schlag (1…n), sonst 0. */
  readonly countInBeat = computed(() => {
    const b = this.beat();
    return this.playing() && b < 0 ? Math.floor(b) - countInStart(this.song()) + 1 : 0;
  });

  // --- interner Zustand des Schedulers ---
  private anchorBeat = 0;
  private anchorTime = 0;
  private scheduledUntil = 0; // Schlag, bis zu dem bereits Töne geplant sind
  private nextNoteIdx = 0;
  private timer?: ReturnType<typeof setInterval>;
  private raf?: number;

  constructor() {
    // Flötenwechsel: Wiedergabe anhalten, damit nichts mit dem alten Griff weiterläuft
    effect(() => {
      this.settings.instrumentId();
      untracked(() => this.stop());
    });
  }

  selectSong(song: Song): void {
    this.stop();
    this.song.set(song);
    this.bpm.set(song.bpm);
  }

  setBpm(value: number): void {
    const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
    if (this.playing()) {
      const now = this.audio.ctx.currentTime;
      this.anchorBeat = this.beatAt(now);
      this.anchorTime = now;
    }
    this.bpm.set(bpm);
  }

  async toggle(): Promise<void> {
    if (this.playing()) this.pause();
    else await this.play();
  }

  async play(): Promise<void> {
    if (this.playing()) return;
    await this.audio.resume();
    const song = this.song();
    // Fortsetzen nach Pause, sonst von vorn (mit Einzähler)
    let start = this.beat();
    if (start <= 0 || start >= song.totalBeats) start = this.countIn() ? countInStart(song) : 0;
    this.startFrom(start);
  }

  pause(): void {
    if (!this.playing()) return;
    this.halt();
    this.beat.set(Math.max(0, this.beat()));
  }

  stop(): void {
    this.halt();
    this.beat.set(0);
  }

  // ---------------------------------------------------------------------------

  private startFrom(startBeat: number): void {
    const notes = this.song().notes;
    this.anchorBeat = startBeat;
    this.anchorTime = this.audio.ctx.currentTime + 0.12;
    this.scheduledUntil = startBeat;
    const first = notes.findIndex((n) => n.start >= startBeat);
    this.nextNoteIdx = first === -1 ? notes.length : first;
    this.beat.set(startBeat);
    this.playing.set(true);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
    const frame = () => {
      if (!this.playing()) return;
      const visible = this.beatAt(this.audio.ctx.currentTime - this.audio.outputLatency);
      if (visible >= this.song().totalBeats) {
        this.finish();
        return;
      }
      this.beat.set(visible);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private halt(): void {
    this.playing.set(false);
    if (this.timer) clearInterval(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = this.raf = undefined;
  }

  private finish(): void {
    this.halt();
    this.beat.set(0);
    if (this.loop()) this.startFrom(0); // Wiederholung ohne Einzähler
  }

  private beatAt(time: number): number {
    return this.anchorBeat + ((time - this.anchorTime) * this.bpm()) / 60;
  }

  private timeAt(beat: number): number {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.bpm();
  }

  /** Plant Metronom-Klicks und Töne für das nächste kurze Zeitfenster. */
  private schedule(): void {
    const ctx = this.audio.ctx;
    const song = this.song();
    const horizon = this.beatAt(ctx.currentTime + LOOKAHEAD_S);
    const spb = 60 / this.bpm();

    // Metronom: im Einzähler immer, danach nach Einstellung
    for (let k = Math.ceil(this.scheduledUntil); k < horizon && k < song.totalBeats; k++) {
      if (k < 0 || this.metronome()) {
        const n = song.beatsPerBar;
        const inBar = (((k - (song.pickup ?? 0)) % n) + n) % n; // Auftakt: erster Schwerpunkt nach dem Auftakt
        this.audio.click(this.timeAt(k), inBar === 0);
      }
    }

    // Töne (klingende Tonhöhe der gewählten Flöte)
    const notes = this.sounding().notes;
    while (this.nextNoteIdx < notes.length && notes[this.nextNoteIdx].start < horizon) {
      const n = notes[this.nextNoteIdx++];
      if (n.pitch && this.sound()) {
        // kleine Lücke am Ende, damit gleiche Töne hintereinander getrennt klingen
        this.audio.tone(frequencyOf(n.pitch), this.timeAt(n.start), n.beats * spb - 0.03);
      }
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, horizon);
  }
}

/** Index der Note, die bei Position `beat` klingt; -1 davor, letzte Note bleibt bis zum Ende aktiv. */
export function indexAt(notes: readonly SongNote[], beat: number): number {
  if (beat < 0 || notes.length === 0) return -1;
  let lo = 0;
  let hi = notes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (notes[mid].start <= beat) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
