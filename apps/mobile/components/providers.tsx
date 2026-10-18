import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { Address } from '@bhaiya-please/core';
import { createCore, CORE_MODE, TRUSTED_VERIFIERS, type AnyCore } from '@/lib/core';
import { toast } from '@/components/bp/Sheet';
import { setLanguage } from '@/lib/i18n';
import { markEvent } from '@/lib/live';
import {
  deleteAccount, ensurePersonas, getTabMode, isSandbox, loadAccount, loadPersona, loadPrefs, MODES, readQuery, saveAccount,
  newWallet, savePrefs, saveTabMode, setSandboxFlag, wipeDevice, wipeSandbox, type Mode, type Prefs, type Wallet,
} from '@/lib/session';
import { societyById, type Society } from '@/lib/societies';

interface Ctx {
  /** Mock core = sandbox-capable build. */
  mockBuild: boolean;
  sandbox: boolean;
  /** Sandbox iframe with a fixed mode (split view). */
  framed: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  modes: Mode[];
  deskVisible: boolean;
  /** Active account for the current mode (the one account in the real app). */
  wallet: Wallet | null;
  address: Address | null;
  /** Sandbox persona addresses by mode (null outside the sandbox). */
  personas: Record<Mode, Address> | null;
  core: AnyCore | null;
  coreError: string | null;
  retryCore: () => void;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => void;
  society: Society;
  onboarded: boolean;
  /** A5: commit the account created during onboarding. */
  finishOnboarding: (w: Wallet, patch: Partial<Prefs>) => void;
  /** A6 / Settings: switch this device to an existing account. */
  restoreAccount: (w: Wallet) => void;
  signOut: () => void;
  /** A2 "Look around first": read-only browse with a throwaway in-memory account (never saved). */
  guest: boolean;
  browseAsGuest: () => void;
  startSandbox: (startMode?: Mode) => void;
  exitSandbox: () => void;
}

const SessionCtx = createContext<Ctx | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const mockBuild = CORE_MODE === 'mock';
  const [boot] = useState(() => {
    const q = readQuery();
    if (q.sandbox && mockBuild) {
      setSandboxFlag(true);
      ensurePersonas();
    }
    if (q.desk) savePrefs({ ...loadPrefs(), deskInvite: true });
    return q;
  });
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [sandbox, setSandbox] = useState(() => mockBuild && isSandbox());
  const [account, setAccount] = useState<Wallet | null>(loadAccount);
  const [guestWallet, setGuestWallet] = useState<Wallet | null>(null);
  const [personaTick, setPersonaTick] = useState(0);
  const [mode, setModeState] = useState<Mode>(() => boot.frame ?? getTabMode() ?? (loadPrefs().use === 'run' ? 'run' : 'get'));
  const [core, setCore] = useState<AnyCore | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [coreNonce, setCoreNonce] = useState(0);

  useEffect(() => setLanguage(prefs.language), [prefs.language]);

  const personas = useMemo(() => {
    if (!sandbox) return null;
    const w = ensurePersonas();
    return { get: w.get.address, run: w.run.address, desk: w.desk.address } as Record<Mode, Address>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox, personaTick]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wallet: Wallet | null = useMemo(() => (sandbox ? loadPersona(mode) : (account ?? guestWallet)), [sandbox, mode, account, guestWallet, personaTick]);
  const deskAddr = sandbox ? (personas?.desk ?? null) : null;
  const deskVisible = sandbox || prefs.deskInvite || (!!account && TRUSTED_VERIFIERS.some((v) => v.toLowerCase() === account.address));
  const modes = MODES.filter((m) => m !== 'desk' || deskVisible);

  useEffect(() => {
    let dead = false;
    let made: AnyCore | null = null;
    setCore(null);
    setCoreError(null);
    if (!wallet) return;
    createCore(wallet, deskAddr)
      .then((c) => {
        made = c;
        if (dead) c.close();
        else setCore(c);
      })
      .catch((e) => !dead && setCoreError(e?.message ?? 'Could not start'));
    return () => {
      dead = true;
      made?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address, deskAddr, coreNonce]);

  const setPrefs = useCallback((patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) => {
    setPrefsState((p) => {
      const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch) };
      savePrefs(next);
      return next;
    });
  }, []);

  const setMode = useCallback(
    (m: Mode) => {
      if (boot.frame) return; // split-view frames keep their persona
      saveTabMode(m);
      setModeState(m);
    },
    [boot.frame],
  );

  const value = useMemo<Ctx>(
    () => ({
      mockBuild,
      sandbox,
      framed: !!boot.frame,
      mode,
      setMode,
      modes,
      deskVisible,
      wallet,
      address: wallet?.address ?? null,
      personas,
      core,
      coreError,
      retryCore: () => setCoreNonce((n) => n + 1),
      prefs,
      setPrefs,
      society: societyById(prefs.societyId),
      onboarded: sandbox || (prefs.onboarded && !!account),
      guest: !sandbox && !account && !!guestWallet,
      browseAsGuest: () => setGuestWallet(newWallet()),
      finishOnboarding: (w, patch) => {
        saveAccount(w);
        setAccount(w);
        setGuestWallet(null);
        setPrefs({ ...patch, onboarded: true });
        const m: Mode = patch.use === 'run' ? 'run' : 'get';
        saveTabMode(m);
        setModeState(m);
      },
      restoreAccount: (w) => {
        saveAccount(w);
        setAccount(w);
        qc.clear();
        setPrefs({ onboarded: true });
      },
      signOut: () => {
        deleteAccount();
        setAccount(null);
        qc.clear();
        setPrefs({ onboarded: false });
      },
      startSandbox: (startMode = 'get') => {
        if (!mockBuild) return;
        setSandboxFlag(true);
        ensurePersonas();
        setPersonaTick((t) => t + 1);
        saveTabMode(startMode);
        setModeState(startMode);
        setSandbox(true);
      },
      exitSandbox: () => {
        wipeSandbox();
        qc.clear();
        setSandbox(false);
      },
    }),
    [mockBuild, sandbox, boot.frame, mode, setMode, modes, deskVisible, wallet, personas, core, coreError, prefs, setPrefs, account, guestWallet, qc],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

/**
 * Which query families each entity type can change. A chain event refreshes only those families
 * (not every query on screen), so one event costs a handful of reads instead of dozens.
 */
const AFFECTS: Record<string, string[]> = {
  run: ['runs', 'run', 'myRuns', 'runnerBoard', 'reqStatus', 'myRequests', 'runRows'],
  request: ['reqStatus', 'myRequests', 'runnerBoard', 'runRows'],
  accept: ['reqStatus', 'myRequests', 'runnerBoard', 'runRows', 'runs', 'run'],
  decline: ['reqStatus', 'myRequests', 'runnerBoard', 'runRows'],
  delivery: ['reqStatus', 'myRequests', 'runnerBoard', 'runRows'],
  receipt: ['receipts', 'profile', 'reqStatus'],
  complaint: ['profile', 'reqStatus', 'noshow'],
  attestation: ['attestations', 'profile', 'issued'],
  shop: ['shops', 'shop'],
  ping: ['pings'],
  noshow: ['noshow', 'profile'],
};
const ALL_FAMILIES = [...new Set(Object.values(AFFECTS).flat())];

const ADDRESS_RE = /0x[0-9a-fA-F]{40}/g;

/** Wallet addresses that appear in what the viewer is looking at (their own, riders, residents). */
function relevantAddresses(qc: QueryClient, me: string | null): Set<string> {
  const set = new Set<string>();
  if (me) set.add(me.toLowerCase());
  for (const q of qc.getQueryCache().getAll()) {
    const d = q.state.data;
    if (!d) continue;
    let text: string;
    try {
      text = JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    } catch {
      continue;
    }
    if (text.length > 400_000) continue;
    for (const m of text.match(ADDRESS_RE) ?? []) set.add(m.toLowerCase());
  }
  return set;
}

/**
 * One live subscription for the whole app. Real chain: a single WebSocket pushes every Arkiv entity event;
 * we read nothing for them (the event already names the owner) and refresh the screens only when the owner
 * is someone the viewer is looking at: themselves, or the rider/resident on their request. Polling
 * (FRESHNESS) stays as the backstop. Mock: events refresh only the affected query families.
 */
function LiveBridge() {
  const { core, address } = useSession();
  const qc = useQueryClient();
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!core) return;
    if (CORE_MODE === 'real') {
      let known = new Set<string>();
      let knownAt = 0;
      let last = 0;
      let t: ReturnType<typeof setTimeout> | null = null;
      const off = core.watchOwners(
        (owner) => {
          const now = Date.now();
          if (now - knownAt > 3000) {
            known = relevantAddresses(qc, address ?? null);
            knownAt = now;
          }
          return known.has(owner.toLowerCase());
        },
        () => {
          if (t) return;
          // Debounce a burst, and never refresh more than once every 15 s: caps refetches at 4/min however many riders on screen are pinging (keeps the read quota safe).
          const wait = Math.max(800, 15_000 - (Date.now() - last));
          t = setTimeout(() => {
            t = null;
            last = Date.now();
            markEvent();
            void qc.invalidateQueries({ predicate: (q) => ALL_FAMILIES.includes(String(q.queryKey[1])) });
          }, wait);
        },
      );
      return () => {
        off();
        if (t) clearTimeout(t);
      };
    }
    const off = core.subscribe({}, (e) => {
      markEvent();
      for (const f of e.type ? (AFFECTS[e.type] ?? []) : ALL_FAMILIES) pending.current.add(f);
      if (timer.current) return;
      timer.current = setTimeout(() => {
        const fams = pending.current;
        pending.current = new Set();
        timer.current = null;
        // keys are [address, family, ...]
        void qc.invalidateQueries({ predicate: (q) => fams.has(String(q.queryKey[1])) });
      }, 400);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [core, qc, address]);
  return null;
}

let lastQuotaToast = 0;

export function CoreProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (err) => {
            // One calm notice when the RPC read quota runs out (core pauses reads for a minute).
            if ((err as { code?: string })?.code !== 'QUOTA_EXHAUSTED' || Date.now() - lastQuotaToast < 120_000) return;
            lastQuotaToast = Date.now();
            toast.info("The network's free limit is used up for now. Showing what we have; retrying in a minute.");
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchInterval: 60_000,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: true,
            // Core already retries transient errors; never retry a used-up quota or a missing record.
            retry: (n, err) => n < 1 && !['QUOTA_EXHAUSTED', 'RATE_LIMITED', 'NOT_FOUND', 'INVALID_INPUT'].includes((err as { code?: string })?.code ?? ''),
          },
        },
      }),
  );
  // Diagnostics (web): window.__bpFetches counts query fetches by family when ?debugFetch=1.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location?.search.includes('debugFetch=1')) return;
    const w = window as unknown as { __bpFetches: Record<string, number> };
    w.__bpFetches = {};
    return client.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated' || e.action.type !== 'fetch') return;
      const k = String(e.query.queryKey[1]);
      w.__bpFetches[k] = (w.__bpFetches[k] ?? 0) + 1;
    });
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <LiveBridge />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside CoreProvider');
  return c;
}

/** For screens rendered under AccountGate, where core is guaranteed. */
export function useCore() {
  const { core } = useSession();
  if (!core) throw new Error('Core not ready (render under AccountGate)');
  return core;
}

export { wipeDevice };
