import { inject, Injectable, signal } from '@angular/core';
import { AudioService } from './audio.service';
import { detectPitch, nearestNote } from './pitch';

export type MicState = 'off' | 'starting' | 'listening' | 'error';

const FRAME = 2048;
const MIN_CLARITY = 0.85;
const POLL_MS = 25;

/** Hört über das Mikrofon mit und erkennt die gespielte Tonhöhe. Es wird nichts aufgezeichnet oder gesendet. */
@Injectable({ providedIn: 'root' })
export class MicService {
  private readonly audio = inject(AudioService);

  readonly state = signal<MicState>('off');
  readonly error = signal('');
  /** Zuletzt erkannter klingender Ton (MIDI) oder null bei Stille/unklarem Klang */
  readonly midi = signal<number | null>(null);
  readonly cents = signal(0);

  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private timer?: ReturnType<typeof setInterval>;
  private buffer = new Float32Array(FRAME);
  private history: (number | null)[] = [];

  async start(): Promise<void> {
    if (this.state() === 'listening' || this.state() === 'starting') return;
    this.state.set('starting');
    this.error.set('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      // Ohne Filter: Echo-Unterdrückung und Rauschfilter verfälschen reine Flötentöne
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      await this.audio.resume();
      const ctx = this.audio.ctx;
      this.source = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = FRAME;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser); // bewusst nicht mit den Lautsprechern verbunden
      this.timer = setInterval(() => this.poll(), POLL_MS);
      this.state.set('listening');
    } catch (e) {
      this.cleanup();
      this.state.set('error');
      this.error.set(messageFor(e));
    }
  }

  stop(): void {
    this.cleanup();
    this.state.set('off');
    this.midi.set(null);
  }

  private poll(): void {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const result = detectPitch(this.buffer, this.audio.ctx.sampleRate);
    const note = result && result.clarity >= MIN_CLARITY ? nearestNote(result.frequency) : null;

    // Kleiner Mehrheitsentscheid über die letzten Messungen gegen Ausreißer
    this.history.push(note ? note.midi : null);
    if (this.history.length > 4) this.history.shift();
    const counts = new Map<number | null, number>();
    for (const m of this.history) counts.set(m, (counts.get(m) ?? 0) + 1);
    let best: number | null = null;
    let bestCount = 0;
    for (const [m, c] of counts) if (c > bestCount) [best, bestCount] = [m, c];

    if (best !== this.midi()) this.midi.set(best);
    if (note && best === note.midi) this.cents.set(note.cents);
  }

  private cleanup(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = this.analyser = this.stream = undefined;
    this.history = [];
  }
}

function messageFor(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Der Zugriff aufs Mikrofon wurde nicht erlaubt. Erlaube ihn in den Browser-Einstellungen für diese Seite.';
  if (name === 'NotFoundError') return 'Es wurde kein Mikrofon gefunden.';
  return 'Das Mikrofon ist hier nicht verfügbar. Es funktioniert in einem normalen Browser-Tab über https oder localhost.';
}
