export interface PitchResult {
  frequency: number;
  /** 0…1: wie eindeutig der Ton ist (1 = reiner Ton) */
  clarity: number;
}

const MIN_FREQ = 200;
const MAX_FREQ = 2800;
const YIN_THRESHOLD = 0.15;
const MIN_RMS = 0.008;

/**
 * Tonhöhenerkennung nach dem YIN-Verfahren (de Cheveigné & Kawahara, 2002).
 * Liefert null bei Stille oder wenn kein klarer Ton erkennbar ist.
 */
export function detectPitch(samples: Float32Array, sampleRate: number): PitchResult | null {
  const size = samples.length;
  const half = size >> 1;

  let sumSq = 0;
  for (let i = 0; i < size; i++) sumSq += samples[i] * samples[i];
  if (Math.sqrt(sumSq / size) < MIN_RMS) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const tauMax = Math.min(half - 1, Math.ceil(sampleRate / MIN_FREQ));

  // Differenzfunktion und kumulativ normierte Differenz
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let i = 0; i < half; i++) {
      const delta = samples[i] - samples[i + tau];
      d += delta * delta;
    }
    running += d;
    cmnd[tau] = running === 0 ? 1 : (d * tau) / running;
  }

  // Erstes Minimum unter der Schwelle suchen
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Parabolische Interpolation für Zwischenwerte
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { frequency: sampleRate / better, clarity: 1 - cmnd[tau] };
}

/** Frequenz → (gerundete MIDI-Note, Abweichung in Cent) */
export function nearestNote(frequency: number): { midi: number; cents: number } {
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}
