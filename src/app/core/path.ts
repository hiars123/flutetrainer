import { poolsFor } from './exercises';
import type { Instrument } from './instruments';
import { poolStepId, songStepId } from './progress.service';
import { isPlayableOn, songById } from './songs';

/** Ein Schritt im Lernpfad: entweder ein Stück (Lied oder Übung) oder eine Runde im Griff-Trainer. */
export interface PathStep {
  id: string;
  kind: 'song' | 'pool';
  /** Kennung des Stücks bzw. des Tonvorrats */
  ref: string;
  title: string;
  text: string;
}

export interface PathGroup {
  title: string;
  intro: string;
  steps: PathStep[];
}

const song = (ref: string, text: string): PathStep => ({
  id: songStepId(ref),
  kind: 'song',
  ref,
  title: songById(ref)?.title ?? ref,
  text,
});
const pool = (ref: string, title: string, text: string): PathStep => ({
  id: poolStepId(ref),
  kind: 'pool',
  ref,
  title,
  text,
});

/** Von leicht nach schwer: erst die Griffe kennenlernen, dann spielen. Pro Schritt reicht ein Stern zum Weitermachen. */
export const PATH: readonly PathGroup[] = [
  {
    title: 'Die ersten Töne',
    intro: 'Nur die linke Hand, dann kommt die rechte dazu.',
    steps: [
      pool('hag', 'Griff-Quiz: Drei Töne', 'H, A und G erkennen'),
      song('uebung-h-a-g', 'Die ersten Töne am Stück spielen'),
      pool('cde', 'Griff-Quiz: Tiefe Töne', 'C, D und E dazulernen'),
      song('uebung-c-d-e', 'Mit der rechten Hand spielen'),
    ],
  },
  {
    title: 'Erste Lieder',
    intro: 'Fünf Töne reichen schon für richtige Lieder.',
    steps: [
      pool('c-g', 'Griff-Quiz: Fünf Töne', 'C bis G sicher greifen'),
      song('haenschen-klein', 'Dein erstes Lied'),
      song('alle-meine-entchen', 'Mit sechs Tönen'),
      song('morgen-kommt-der-weihnachtsmann', 'Mit Tonsprüngen'),
    ],
  },
  {
    title: 'Die ganze Tonleiter',
    intro: 'Von C bis D in der zweiten Oktave.',
    steps: [
      pool('tonleiter', 'Griff-Quiz: Tonleiter', 'Alle acht Töne von C bis C'),
      song('uebung-tonleiter', 'Aufwärts und abwärts'),
      song('kuckuck', 'Im Dreivierteltakt, mit hohem D'),
      song('bruder-jakob', 'Mit Achtelnoten'),
      song('ode-an-die-freude', 'Mit punktierten Noten'),
    ],
  },
  {
    title: 'Halbtöne und Vorzeichen',
    intro: 'Kreuz und B kommen dazu, dazu eine Tonart mit B.',
    steps: [
      pool('halbtoene', 'Griff-Quiz: Halbtöne', 'F♯ und B dazulernen'),
      song('uebung-halbtoene', 'Mit Kreuz und B spielen'),
      song('happy-birthday', 'In F-Dur, mit Auftakt'),
    ],
  },
  {
    title: 'Weihnachtszeit',
    intro: 'Für den Advent: zwei Lieder zum Vorspielen.',
    steps: [
      song('jingle-bells', 'Der Refrain mit Achteln'),
      song('alle-jahre-wieder', 'In D-Dur, mit Bindebögen'),
    ],
  },
];

/** Alle Schritte, die auf dieser Flöte spielbar sind, nach Gruppen. Gruppen ohne Schritte entfallen. */
export function pathFor(instrument: Instrument): PathGroup[] {
  const poolIds = new Set(poolsFor(instrument).map((p) => p.id));
  return PATH.map((group) => ({
    ...group,
    steps: group.steps.filter((step) => {
      if (step.kind === 'pool') return poolIds.has(step.ref);
      const s = songById(step.ref);
      return !!s && isPlayableOn(s, instrument);
    }),
  })).filter((group) => group.steps.length > 0);
}
