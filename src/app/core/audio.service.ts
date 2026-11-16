import { Injectable } from '@angular/core';

/** Dünner Wrapper um die Web Audio API: ein flötenartiger Ton und ein Metronom-Klick. */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private context?: AudioContext;

  /** Der AudioContext wird erst nach einer Nutzeraktion angelegt (Autoplay-Regeln der Browser). */
  get ctx(): AudioContext {
    return (this.context ??= new AudioContext({ latencyHint: 'interactive' }));
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Verzögerung zwischen „geplant“ und „hörbar“ – damit die Anzeige zum Klang passt. */
  get outputLatency(): number {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return c.outputLatency || c.baseLatency || 0;
  }

  /** Weicher Blockflötenton: Grundton + leise Obertöne, kurze An- und Abschwellzeit. */
  tone(frequency: number, when: number, duration: number): void {
    const ctx = this.ctx;
    const attack = 0.04;
    const release = 0.07;
    const end = when + Math.max(duration, attack + 0.02);
    // Hohe Töne klingen lauter → etwas leiser machen
    const level = 0.22 * Math.pow(523 / frequency, 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + attack);
    gain.gain.setValueAtTime(level, Math.max(when + attack, end - release));
    gain.gain.linearRampToValueAtTime(0, end);
    gain.connect(ctx.destination);

    const partials: [number, number][] = [
      [1, 1],
      [2, 0.14],
      [3, 0.04],
    ];
    for (const [mult, amp] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency * mult;
      g.gain.value = amp;
      osc.connect(g).connect(gain);
      osc.start(when);
      osc.stop(end + 0.02);
    }
  }

  /** Kurzer Metronom-Klick; accent = erster Schlag im Takt. */
  click(when: number, accent: boolean): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = accent ? 1500 : 1000;
    const peak = accent ? 0.35 : 0.2;
    gain.gain.setValueAtTime(peak, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.08);
  }
}
