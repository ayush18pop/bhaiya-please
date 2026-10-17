import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { Address } from '@bhaiya-please/core';
import { createCore, CORE_MODE, TRUSTED_VERIFIERS, type AnyCore } from '@/lib/core';
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

/** One live subscription for the whole app: any chain/mock event refreshes active queries (debounced). */
function LiveBridge() {
  const { core } = useSession();
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!core) return;
    const off = core.subscribe({}, (e) => {
      markEvent();
      // Pings arrive every ~20 s per run: refresh only the map queries, not every screen.
      if (e.type === 'ping') {
        void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('pings') });
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => qc.invalidateQueries(), 250);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [core, qc]);
  return null;
}

export function CoreProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2000, refetchInterval: 5000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
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
