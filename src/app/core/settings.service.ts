import { computed, effect, Injectable, signal } from '@angular/core';
import { DEFAULT_INSTRUMENT_ID, instrumentById } from './instruments';

const KEY = 'floetenlehrer.settings.v1';

interface Stored {
  instrumentId?: string;
  microphone?: boolean;
}

function load(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored;
  } catch {
    return {}; // Speicher gesperrt oder kaputt → Standardwerte
  }
}

/** Nutzer-Einstellungen; werden im Browser gespeichert (falls erlaubt). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly stored = load();

  readonly instrumentId = signal(instrumentById(this.stored.instrumentId ?? DEFAULT_INSTRUMENT_ID).id);
  readonly instrument = computed(() => instrumentById(this.instrumentId()));

  /** Pro-Funktion (Vorschau): Mikrofon zum Mitspielen. Standardmäßig aus. */
  readonly microphoneFeature = signal(this.stored.microphone === true);

  constructor() {
    effect(() => {
      const value: Stored = { instrumentId: this.instrumentId(), microphone: this.microphoneFeature() };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        /* nicht speicherbar – egal */
      }
    });
  }
}
