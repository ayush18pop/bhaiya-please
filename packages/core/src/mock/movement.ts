/**
 * Mock live-location simulator: the seeded runners' live runs ride a synthetic route
 * (geo.simulatedRoute) and publish a coarse ping every PING_RULES.intervalSeconds of mock time,
 * through the same services a real runner app uses. Several tabs may run it on one shared store;
 * the "last ping is recent" check keeps them from doubling up.
 */
import { coarsenToGh7, simulatedPosition } from '../geo';
import type { BhaiyaPlease } from '../interface';
import { PING_RULES } from '../types';
import type { Address, UnixSeconds } from '../types';

export interface MovementSim {
  tick(): Promise<number>;
  start(everyMs?: number): void;
  stop(): void;
}

export function createMovementSim(runners: readonly Address[], as: (a: Address) => BhaiyaPlease, now: () => UnixSeconds): MovementSim {
  let busy = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Per-run sequence survives gaps longer than a ping's 2-minute life. */
  const seqs = new Map<string, number>();

  async function forRunner(a: Address): Promise<number> {
    const d = as(a);
    let n = 0;
    for (const run of await d.getMyRuns()) {
      const t = now();
      if (t >= run.expiresAt - 2) continue;
      const last = (await d.getRunTrail(run.key)).at(-1);
      if (last && t - last.createdAt < PING_RULES.intervalSeconds - 1) continue;
      const s = simulatedPosition(run, t);
      const seq = Math.max((seqs.get(run.key) ?? -1) + 1, (last?.seq ?? -1) + 1);
      seqs.set(run.key, seq);
      await d.publishPing(run.key, coarsenToGh7(s.pos.lat, s.pos.lng), {
        seq,
        heading: Math.round(s.heading) % 360,
        speedKmh: Math.round(s.speedKmh),
      });
      n++;
    }
    return n;
  }

  async function tick(): Promise<number> {
    if (busy) return 0;
    busy = true;
    try {
      const counts = await Promise.all(runners.map((a) => forRunner(a).catch(() => 0)));
      return counts.reduce((x, y) => x + y, 0);
    } finally {
      busy = false;
    }
  }

  return {
    tick,
    start(everyMs = 4000) {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), everyMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
