import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  untracked,
} from '@angular/core';
import { MicService } from '../../core/mic.service';
import { ProgressService, songStepId } from '../../core/progress.service';
import { WaitModeService } from '../../core/waitmode.service';
import { germanName, keyName, pitchFromMidi } from '../../core/notes';
import { PlayAlongService } from '../../core/playalong.service';
import { MAX_BPM, MIN_BPM, PlayerService } from '../../core/player.service';
import { SettingsService } from '../../core/settings.service';
import { isPlayableOn, Song, SONGS, SongCategory } from '../../core/songs';
import { FluteComponent } from '../../ui/flute/flute';
import { StarsComponent } from '../../ui/stars/stars';
import { StaffComponent } from '../../ui/staff/staff';

/** Lied oder Übung spielen: Notenzeile, Flötenbild, Metronom, Tempo und (optional) Mitspielen mit Mikrofon. */
@Component({
  selector: 'app-practice',
  imports: [FluteComponent, StaffComponent, StarsComponent],
  templateUrl: './practice.html',
  styleUrl: './practice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PracticeComponent implements OnDestroy {
  readonly category = input.required<SongCategory>();

  protected readonly player = inject(PlayerService);
  protected readonly settings = inject(SettingsService);
  protected readonly mic = inject(MicService);
  protected readonly playAlong = inject(PlayAlongService);
  protected readonly wait = inject(WaitModeService);
  protected readonly progress = inject(ProgressService);
  protected readonly minBpm = MIN_BPM;
  protected readonly maxBpm = MAX_BPM;

  /** Nur Stücke, die auf der gewählten Flöte spielbar sind */
  protected readonly songs = computed(() => {
    const instrument = this.settings.instrument();
    return SONGS.filter((s) => s.category === this.category() && isPlayableOn(s, instrument));
  });

  /** Welcher Schlag im Takt (0-basiert) – für die Metronom-Punkte */
  protected readonly beatInBar = computed(() => {
    const song = this.player.song();
    const b = Math.floor(this.player.beat()) - (song.pickup ?? 0);
    const n = song.beatsPerBar;
    return this.player.playing() ? ((b % n) + n) % n : -1;
  });
  protected readonly barBeats = computed(() => Array.from({ length: this.player.song().beatsPerBar }, (_, i) => i));

  /** „F-Dur · 3/4-Takt“ unter der Notenzeile (bei der Tin Whistle in D-Dur-Lage verschoben) */
  protected readonly songInfo = computed(() => {
    const s = this.player.written();
    return `${keyName(s.key ?? 0)} · ${s.beatsPerBar}/4-Takt`;
  });
  protected readonly songStars = computed(() => this.progress.stars()[songStepId(this.player.song().id)] ?? 0);

  protected readonly readout = computed(() => {
    const p = this.player;
    if (this.wait.enabled()) {
      const note = this.wait.targetNote();
      if (this.wait.finished()) return { big: 'Geschafft', small: 'Alle Töne gespielt', rest: false };
      if (note?.pitch) {
        const notes = p.sounding().notes;
        const nextPitch = notes.slice(this.wait.targetIndex() + 1).find((n) => n.pitch)?.pitch;
        return {
          big: germanName(note.pitch),
          small: nextPitch ? `danach ${germanName(nextPitch)}` : 'letzter Ton',
          rest: false,
        };
      }
      const first = p.sounding().notes.find((n) => n.pitch);
      return { big: first?.pitch ? germanName(first.pitch) : '–', small: 'Start drücken, dann spielen', rest: false };
    }
    const count = p.countInBeat();
    if (count > 0) return { big: String(count), small: 'Einzählen', rest: false };
    const note = p.currentNote();
    const next = p.nextNote();
    const nextText = next?.pitch ? `danach ${germanName(next.pitch)}` : p.playing() ? 'letzter Ton' : '';
    if (!p.playing() && p.beat() === 0) {
      const first = p.sounding().notes.find((n) => n.pitch);
      return { big: first?.pitch ? germanName(first.pitch) : '–', small: 'erster Ton', rest: false };
    }
    if (note && !note.pitch) return { big: 'Pause', small: nextText, rest: true };
    return { big: note?.pitch ? germanName(note.pitch) : '–', small: nextText, rest: false };
  });

  protected readonly heard = computed(() => {
    const midi = this.mic.midi();
    return midi === null ? '–' : germanName(pitchFromMidi(midi));
  });
  /** Position des Stimm-Punkts: 0 = ganz tief, 100 = ganz hoch, 50 = sauber */
  protected readonly tunePosition = computed(() => 50 + Math.max(-50, Math.min(50, this.mic.cents())));
  protected readonly inTune = computed(() => this.mic.midi() !== null && Math.abs(this.mic.cents()) <= 20);

  constructor() {
    // Beim Wechsel zwischen „Lieder“/„Übungen“ oder der Flöte ein passendes Stück wählen
    effect(() => {
      const list = this.songs();
      untracked(() => {
        if (!list.includes(this.player.song())) this.player.selectSong(list[0]);
      });
    });
    // Das Mikrofon darf den eigenen Flötenton der App nicht hören
    effect(() => {
      if (this.mic.state() === 'listening') untracked(() => this.player.sound.set(false));
    });
    // Pro-Funktion in den Einstellungen ausgeschaltet → Mikrofon aus
    effect(() => {
      if (!this.settings.microphoneFeature()) untracked(() => this.mic.stop());
    });
  }

  ngOnDestroy(): void {
    this.wait.setEnabled(false);
    this.player.stop();
    this.mic.stop();
  }

  protected choose(song: Song): void {
    this.player.selectSong(song);
  }

  protected onTempo(event: Event): void {
    this.player.setBpm(Number((event.target as HTMLInputElement).value));
  }

  protected nudge(delta: number): void {
    this.player.setBpm(this.player.bpm() + delta);
  }

  protected toggleMic(): void {
    if (this.mic.state() === 'listening') this.mic.stop();
    else void this.mic.start();
  }

  protected toggleWait(): void {
    this.wait.setEnabled(!this.wait.enabled());
  }

  protected onStart(): void {
    if (this.wait.enabled()) this.wait.toggle();
    else void this.player.toggle();
  }

  protected onStop(): void {
    this.wait.stop();
    this.player.stop();
  }

  /** Ohne Mikrofon: selbst als geübt markieren (ein Stern). */
  protected markPracticed(): void {
    this.progress.record(songStepId(this.player.song().id), 1);
  }
}
