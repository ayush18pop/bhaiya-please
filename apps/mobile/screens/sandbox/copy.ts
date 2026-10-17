/** Sandbox copy (F1–F5). Desktop demo for judges and first-time visitors: English only. */
import { defineCopy } from '@/lib/i18n';

export const sandboxCopy = defineCopy({
  en: {
    banner: 'SANDBOX · NOTHING HERE IS REAL',
    start: {
      title: "Someone's already coming your way.",
      pitch:
        'Residents ask runners already heading to their society for 1–3 things. They pay at the gate, and the runner keeps a receipt that nobody can edit. See the whole loop in 3 minutes.',
      tour: 'Start guided tour',
      explore: 'Explore freely',
      real: 'Open the real app',
      signup: 'See the sign-up flow',
      loopTitle: 'The loop',
      loop: [
        'A runner announces a run to Lotus Heights',
        'A resident asks them for milk',
        'They meet at the gate, scan, pay',
        'The runner gets a receipt they own',
      ],
      note: 'Everything here runs in this browser. Nothing is sent anywhere.',
    },
    split: {
      exit: 'Exit tour',
      resident: 'Resident',
      runner: 'Runner',
      desk: 'Society desk',
      next: 'Next',
      back: 'Back',
      skip: 'Skip',
      restart: 'Restart',
      done: 'Tour done. Keep exploring both phones.',
      stepOf: 'Step {n} of {total}',
      waiting: 'Do it in the highlighted phone. The tour moves on by itself.',
      howItWorks: 'How it works',
      showHow: 'Show how it works',
      hideHow: 'Hide how it works',
      dismiss: 'Dismiss',
      controls: 'Controls',
      ff5: 'Fast-forward 5 min',
      ff30: 'Fast-forward 30 min',
      move: 'Simulate movement',
      reset: 'Reset sandbox',
      resetting: 'Resetting…',
      openAs: 'Open in a new tab as',
      showDesk: 'Show desk phone',
      hideDesk: 'Hide desk phone',
      clock: 'Sandbox clock',
      ahead: '+{min} min ahead',
      onTime: 'real time',
      narrow: 'The split view needs a wider window. Make the window wider, or explore one phone at a time.',
      openPhone: 'Explore on one phone',
    },
    coach: {
      title: 'Guided tour',
      switchTo: 'Switch to {role}',
      skip: 'End tour',
      next: 'Next',
    },
  },
});

export type TourFrame = 'get' | 'run' | 'both' | 'none';
export interface TourStep {
  frame: TourFrame;
  /** Event (lib/events) that completes the step. */
  done?: 'run.started' | 'request.sent' | 'request.accepted' | 'runner.atGate' | 'handoff.saved' | 'receipt.given';
  label: string;
  hint: string;
  /** "How it works" callout for this step (plain words, no jargon). */
  how: string;
}

/** The guided tour (F2): truthful to the sandbox personas (the runner is a fresh account, not a seeded one). */
export function tourSteps(runner: string, resident: string): TourStep[] {
  return [
    {
      frame: 'run',
      done: 'run.started',
      label: 'Start a run to Lotus Heights',
      hint: `In the runner phone (${runner}), set up once, then start a run to Lotus Heights.`,
      how: 'A run lasts only as long as the trip. When it ends, it deletes itself. No one keeps a history of where runners went.',
    },
    {
      frame: 'get',
      done: 'request.sent',
      label: 'Ask the runner for something',
      hint: `In the resident phone (${resident}), tap ${runner}'s run, pick a shop and ask for 1–3 things.`,
      how: 'The request carries no name, phone or flat number. It also expires on its own if nobody picks it up.',
    },
    {
      frame: 'run',
      done: 'request.accepted',
      label: 'Accept the request',
      hint: `${runner} sees the request appear. Open it and accept.`,
      how: 'Accepting is saved where both phones can see it. Nobody pays a fee for saving.',
    },
    {
      frame: 'run',
      done: 'runner.atGate',
      label: "Tap I'm at the gate",
      hint: `Open the run and tell ${resident} you are at the gate.`,
      how: 'Runner location is a rough ~150 m area, and each position deletes itself after 2 minutes.',
    },
    {
      frame: 'both',
      done: 'handoff.saved',
      label: 'Show code, then scan',
      hint: `${resident} taps Show code. ${runner} scans it. In a browser, copy the handoff link and paste it in the runner phone.`,
      how: "The code proves the handoff happened, with the right person. It stays on the resident's phone until it is scanned.",
    },
    {
      frame: 'get',
      done: 'receipt.given',
      label: 'Give a receipt',
      hint: `${resident} rates the handoff and gives ${runner} a receipt.`,
      how: 'The receipt is written by the resident and owned by the runner. Nobody can edit it, including us.',
    },
    {
      frame: 'run',
      label: "See it on the runner's profile",
      hint: `Open Profile in the runner phone. The new receipt counts toward ${runner}'s level.`,
      how: "Public: the run, the receipt and the level. On the phone only: the recovery key, the handoff code and the runner's payment QR.",
    },
  ];
}
