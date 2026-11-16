import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AudioService } from './audio.service';
import { MicService } from './mic.service';
import { frequencyOf, midiOf } from './notes';
import { PlayAlongService } from './playalong.service';
import { PlayerService } from './player.service';
import { SettingsService } from './settings.service';

/** So lange muss der richtige Ton gehalten werden, bis das Stück weitergeht. */
export const HOLD_S = 0.18;
/** Ein falscher Ton, der so lange klingt, zählt als Fehlversuch. */
const WRONG_S = 0.3;
/** Stille (Zungenstoß) dieser Länge gilt als „Ton losgelassen“ – nötig, wenn zwei gleiche Töne folgen. */
const RELEASE_S = 0.06;
const TICK_MS = 40;

/**
 * Warte-Modus (Pro-Vorschau): Das Stück bleibt bei der aktuellen Note stehen und geht erst weiter,
 * wenn das Mikrofon den richtigen Ton hört. Es zählt der Tonname (die Oktave ist egal).
 * Wer beim ersten Versuch daneben liegt, bekommt die Note rot – weiter geht es trotzdem erst mit dem richtigen Ton.
 */
@Injectable({ providedIn: 'root' })
export class WaitModeService {
  private readonly player = inject(PlayerService);
  private readonly playAlong = inject(PlayAlongService);
  private readonly mic = inject(MicService);
  private readonly audio = inject(AudioService);
  private readonly settings = inject(SettingsService);

  /** Vom Nutzer eingeschaltet (nur sinnvoll mit laufendem Mikrofon) */
  readonly enabled = signal(false);
  /** Das Stück wartet gerade auf Töne */
  readonly running = signal(false);
  /** Index der Note, die als Nächstes gespielt werden soll, -1 = noch nicht begonnen */
  readonly targetIndex = signal(-1);
  /** Alle Noten sind gespielt */
  readonly finished = signal(false);

  readonly targetNote = computed(() => this.player.sounding().notes[this.targetIndex()] ?? null);

  private hold = 0;
  private wrong = 0;
  private silent = 0;
  private released = true;
  private needRelease = false;
  private wrongMarked = false;
  private ignoreUntil = 0;
  private last = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    // Mikrofon aus, Stück oder Flöte gewechselt → anhalten
    effect(() => {
      const listening = this.mic.state() === 'listening';
      this.player.song();
      this.settings.instrumentId();
      untracked(() => {
        if (!listening) this.enabled.set(false);
        this.stop();
      });
    });
  }

  setEnabled(on: boolean): void {
    this.enabled.set(on);
    if (on) {
      this.player.stop();
      this.player.sound.set(false);
    } else {
      this.stop();
    }
  }

  /** Start von vorn oder Fortsetzen nach einer Pause. */
  start(): void {
    if (this.running()) return;
    this.player.stop();
    if (this.targetIndex() < 0 || this.finished()) {
      this.playAlong.reset();
      this.finished.set(false);
      this.moveTo(this.nextPitched(-1), -1);
    }
    this.resetHold(false);
    const target = this.targetNote();
    if (target) this.player.beat.set(target.start);
    this.running.set(true);
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  pause(): void {
    this.running.set(false);
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  toggle(): void {
    if (this.running()) this.pause();
    else this.start();
  }

  /** Zurück an den Anfang, Ergebnisse bleiben stehen, bis neu gestartet wird. */
  stop(): void {
    this.pause();
    this.targetIndex.set(-1);
    this.finished.set(false);
    this.player.beat.set(0);
  }

  /** Spielt den gesuchten Ton vor. Währenddessen hört das Mikrofon nicht zu, sonst würde der Ton sich selbst bestätigen. */
  async hear(): Promise<void> {
    const note = this.targetNote() ?? this.player.sounding().notes.find((n) => n.pitch) ?? null;
    if (!note?.pitch) return;
    await this.audio.resume();
    this.audio.tone(frequencyOf(note.pitch), this.audio.ctx.currentTime + 0.05, 1.0);
    this.ignoreUntil = performance.now() + 1500;
    this.resetHold(false);
  }

  // ---------------------------------------------------------------------------

  private nextPitched(after: number): number {
    const notes = this.player.sounding().notes;
    for (let i = after + 1; i < notes.length; i++) if (notes[i].pitch) return i;
    return -1;
  }

  private moveTo(index: number, previous: number): void {
    const notes = this.player.sounding().notes;
    this.targetIndex.set(index);
    this.wrongMarked = false;
    this.resetHold(this.samePitchClass(previous, index));
    if (index >= 0) this.player.beat.set(notes[index].start);
  }

  private samePitchClass(a: number, b: number): boolean {
    const notes = this.player.sounding().notes;
    const pa = notes[a]?.pitch;
    const pb = notes[b]?.pitch;
    return !!pa && !!pb && mod12(midiOf(pa)) === mod12(midiOf(pb));
  }

  private resetHold(needRelease: boolean): void {
    this.hold = 0;
    this.wrong = 0;
    this.silent = 0;
    this.released = !needRelease;
    this.needRelease = needRelease;
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const index = this.targetIndex();
    const note = this.targetNote();
    if (!this.running() || index < 0 || !note?.pitch) return;
    if (now < this.ignoreUntil) return;

    const midi = this.mic.midi();
    if (midi === null) {
      this.hold = 0;
      this.wrong = 0;
      this.silent += dt;
      if (this.silent >= RELEASE_S) this.released = true;
      return;
    }
    this.silent = 0;

    if (mod12(midi) === mod12(midiOf(note.pitch))) {
      this.wrong = 0;
      // Derselbe Ton wie eben noch: erst hinhören, ob er neu angespielt wird
      if (this.needRelease && !this.released) return;
      this.hold += dt;
      if (this.hold >= HOLD_S) this.advance(index);
    } else {
      this.released = true;
      this.hold = 0;
      this.wrong += dt;
      if (this.wrong >= WRONG_S && !this.wrongMarked) {
        this.wrongMarked = true;
        this.playAlong.setResult(index, 'miss');
      }
    }
  }

  private advance(index: number): void {
    if (!this.wrongMarked) this.playAlong.setResult(index, 'hit');
    const next = this.nextPitched(index);
    if (next < 0) {
      this.pause();
      this.finished.set(true);
      this.targetIndex.set(-1);
      this.player.beat.set(0);
      return;
    }
    this.moveTo(next, index);
  }
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}
