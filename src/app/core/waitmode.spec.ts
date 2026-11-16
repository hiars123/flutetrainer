import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicService } from './mic.service';
import { midiOf } from './notes';
import { PlayAlongService } from './playalong.service';
import { PlayerService } from './player.service';
import { ProgressService, starsForRatio, starsForStreak } from './progress.service';
import { songById } from './songs';
import { WaitModeService } from './waitmode.service';

/** Mikrofon-Ersatz: der Test setzt den „gehörten“ Ton selbst. */
class FakeMic {
  readonly state = signal<'listening'>('listening');
  readonly midi = signal<number | null>(null);
  readonly cents = signal(0);
  stop(): void {}
}

describe('Warte-Modus', () => {
  let mic: FakeMic;
  let wait: WaitModeService;
  let player: PlayerService;
  let along: PlayAlongService;

  const hear = (pitch: string | null) => mic.midi.set(pitch === null ? null : midiOf(pitch));
  const pass = (seconds: number) => vi.advanceTimersByTime(seconds * 1000);

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mic = new FakeMic();
    TestBed.configureTestingModule({ providers: [{ provide: MicService, useValue: mic }] });
    player = TestBed.inject(PlayerService);
    along = TestBed.inject(PlayAlongService);
    wait = TestBed.inject(WaitModeService);
    // 'G5 E5 E5:2 F5 D5 D5:2 …' (Hänschen klein)
    player.selectSong(songById('haenschen-klein')!);
    TestBed.tick();
    wait.setEnabled(true);
    wait.start();
  });

  afterEach(() => {
    wait.stop();
    vi.useRealTimers();
  });

  it('wartet auf den ersten Ton und zeigt ihn an', () => {
    expect(wait.running()).toBe(true);
    expect(wait.targetIndex()).toBe(0);
    expect(player.beat()).toBe(0);
    pass(2); // Stille: nichts passiert
    expect(wait.targetIndex()).toBe(0);
  });

  it('geht weiter, wenn der richtige Ton lange genug klingt – und zählt ihn als Treffer', () => {
    hear('G5');
    pass(0.1);
    expect(wait.targetIndex()).toBe(0); // noch zu kurz
    pass(0.2);
    expect(wait.targetIndex()).toBe(1);
    expect(along.results()[0]).toBe('hit');
    expect(player.beat()).toBe(1); // der zweite Ton beginnt bei Schlag 1
  });

  it('akzeptiert den Ton auch eine Oktave höher oder tiefer', () => {
    hear('G6');
    pass(0.4);
    expect(wait.targetIndex()).toBe(1);
  });

  it('ignoriert falsche Töne, merkt sich aber den Fehlversuch', () => {
    hear('F5');
    pass(0.6);
    expect(wait.targetIndex()).toBe(0);
    expect(along.results()[0]).toBe('miss');
    hear('G5');
    pass(0.4);
    expect(wait.targetIndex()).toBe(1);
    expect(along.results()[0]).toBe('miss'); // bleibt ein Fehlversuch
  });

  it('verlangt bei zwei gleichen Tönen hintereinander ein neues Anspielen', () => {
    hear('G5');
    pass(0.4); // → E5 (Index 1)
    hear('E5');
    pass(0.4); // → E5:2 (Index 2), gleicher Ton
    expect(wait.targetIndex()).toBe(2);
    pass(1); // der Ton klingt weiter, geht aber nicht weiter
    expect(wait.targetIndex()).toBe(2);
    hear(null);
    pass(0.1); // kurze Pause = Zungenstoß
    hear('E5');
    pass(0.4);
    expect(wait.targetIndex()).toBe(3);
  });

  it('überspringt Pausen und ist am Ende fertig', () => {
    const notes = player.sounding().notes.filter((n) => n.pitch);
    for (const n of notes) {
      hear(n.pitch);
      pass(0.4);
      hear(null);
      pass(0.1);
    }
    expect(wait.finished()).toBe(true);
    expect(wait.running()).toBe(false);
    expect(along.summary()).toMatchObject({ hits: notes.length, all: notes.length, complete: true });
  });

  it('gibt für ein sauber gespieltes Stück drei Sterne', () => {
    const progress = TestBed.inject(ProgressService);
    for (const n of player.sounding().notes.filter((x) => x.pitch)) {
      hear(n.pitch);
      pass(0.4);
      hear(null);
      pass(0.1);
    }
    TestBed.tick();
    expect(progress.starsFor('song:haenschen-klein')).toBe(3);
  });

  it('hält an, wenn das Mikrofon ausgeht', () => {
    mic.state.set('listening');
    wait.pause();
    expect(wait.running()).toBe(false);
    wait.start();
    expect(wait.running()).toBe(true);
  });
});

describe('Sterne', () => {
  it('nach Trefferquote', () => {
    expect(starsForRatio(1)).toBe(3);
    expect(starsForRatio(0.9)).toBe(3);
    expect(starsForRatio(0.8)).toBe(2);
    expect(starsForRatio(0.5)).toBe(1);
    expect(starsForRatio(0.49)).toBe(0);
  });
  it('nach Serie richtiger Antworten', () => {
    expect(starsForStreak(4)).toBe(0);
    expect(starsForStreak(5)).toBe(1);
    expect(starsForStreak(8)).toBe(2);
    expect(starsForStreak(12)).toBe(3);
  });
});
