/**
 * Worker persistence: ONE JSON file (`<TRIGGERS_DATA_DIR>/worker.json`, mode 0600) holding the
 * delivery channels (with their secret targets), the engine state (seen set, watch snapshots) and a
 * short firing log for GET /firings. Writes are atomic (temp file + fsync + rename) and debounced.
 */
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Address,
  ChannelDirectory,
  ChannelInfo,
  ChannelKind,
  EngineState,
  EngineStore,
  EntityKey,
  FiringEvent,
  Hex,
  ReceiptEvent,
  WorkerFiring,
} from '@arkiv-triggers/core';

export interface ChannelRecord {
  id: Hex;
  kind: ChannelKind;
  /** Lowercased. */
  owner: Address;
  /** SECRET: PushSubscription JSON, Expo token or webhook URL. Never logged, never returned. */
  target: string;
  targetHash: Hex;
  createdAt: number;
}

export interface FiringLogEntry extends WorkerFiring {
  /** Trigger owner and creator (lowercased), for GET /firings?owner=. */
  owner: Address;
  creator: Address;
}

interface FileShape {
  v: 1;
  channels: Record<string, ChannelRecord>;
  engine: EngineState | null;
  firings: FiringLogEntry[];
}

const FIRING_LOG_MAX = 5000;
const FIRING_LOG_SECONDS = 7 * 24 * 3600;
export const MAX_CHANNELS_PER_OWNER = 20;

export class WorkerStore {
  private data: FileShape = { v: 1, channels: {}, engine: null, firings: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  readonly file: string;

  private constructor(readonly dir: string) {
    this.file = join(dir, 'worker.json');
  }

  static async open(dir: string): Promise<WorkerStore> {
    const s = new WorkerStore(dir);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      const parsed = JSON.parse(await readFile(s.file, 'utf8')) as Partial<FileShape>;
      if (parsed && parsed.v === 1) {
        s.data = {
          v: 1,
          channels: parsed.channels ?? {},
          engine: parsed.engine ?? null,
          firings: Array.isArray(parsed.firings) ? parsed.firings : [],
        };
      }
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
    return s;
  }

  // ---------------------------------------------------------------- persistence

  /** Debounced save (coalesces bursts into one write within 500 ms). */
  scheduleSave(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, 500);
  }

  /** Atomic write now; serialized with any write in progress. */
  saveNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const text = JSON.stringify(this.data);
    this.writing = this.writing.catch(() => undefined).then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      const fh = await open(tmp, 'w', 0o600);
      try {
        await fh.writeFile(text, 'utf8');
        await fh.sync();
      } finally {
        await fh.close();
      }
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  // ---------------------------------------------------------------- channels

  getChannel(id: string): ChannelRecord | null {
    return this.data.channels[id.toLowerCase()] ?? null;
  }

  findChannel(owner: Address, targetHash: Hex): ChannelRecord | null {
    const o = owner.toLowerCase();
    return Object.values(this.data.channels).find((c) => c.owner === o && c.targetHash === targetHash) ?? null;
  }

  countChannels(owner: Address): number {
    const o = owner.toLowerCase();
    return Object.values(this.data.channels).filter((c) => c.owner === o).length;
  }

  putChannel(c: ChannelRecord): void {
    this.data.channels[c.id.toLowerCase()] = c;
    void this.saveNow();
  }

  removeChannel(id: string): boolean {
    const k = id.toLowerCase();
    if (!this.data.channels[k]) return false;
    delete this.data.channels[k];
    void this.saveNow();
    return true;
  }

  get channelCount(): number {
    return Object.keys(this.data.channels).length;
  }

  /** The engine-facing view: ids, kinds and owners only (never targets). */
  directory(): ChannelDirectory {
    return {
      get: (id): ChannelInfo | null => {
        const c = this.getChannel(id);
        return c ? { id: c.id, kind: c.kind, owner: c.owner } : null;
      },
    };
  }

  // ---------------------------------------------------------------- engine state

  engineStore(): EngineStore {
    return {
      load: () => this.data.engine,
      save: (state) => {
        this.data.engine = state;
        this.scheduleSave();
      },
    };
  }

  // ---------------------------------------------------------------- firing log

  logFiring(f: FiringEvent): void {
    const e: FiringLogEntry = {
      firing: f.id,
      trigger: f.trigger.key,
      entity: f.entity,
      event: f.event,
      outcome: f.outcome,
      at: f.at,
      block: f.block.toString(),
      owner: f.trigger.owner,
      creator: f.trigger.creator,
    };
    const title = f.message?.title ?? f.trigger.label;
    if (title) e.label = title;
    if (f.message?.body) e.body = f.message.body;
    if (f.trigger.href) e.href = f.trigger.href;
    this.data.firings.push(e);
    const cutoff = f.at - FIRING_LOG_SECONDS;
    this.data.firings = this.data.firings.filter((x) => x.at >= cutoff).slice(-FIRING_LOG_MAX);
    this.scheduleSave();
  }

  recordReceipt(r: ReceiptEvent): void {
    for (let i = this.data.firings.length - 1; i >= 0; i--) {
      const e = this.data.firings[i] as FiringLogEntry;
      if (e.firing === r.id) {
        e.receipt = r.receipt;
        if (r.attestation) e.attestation = r.attestation as EntityKey;
        break;
      }
    }
    this.scheduleSave();
  }

  /** Firings of triggers owned or created by `owner`, at or after `since`, newest first (max 200). */
  firingsFor(owner: Address, since: number): WorkerFiring[] {
    const o = owner.toLowerCase();
    return this.data.firings
      .filter((f) => (f.owner === o || f.creator === o) && f.at >= since)
      .slice(-200)
      .reverse()
      .map(({ owner: _o, creator: _c, ...rest }) => rest);
  }
}
