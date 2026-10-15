import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { Address } from '@bhaiya-please/core';
import { createCore, type AnyCore } from '@/lib/core';
import {
  ROLES, createWallet, deleteWallet, getRole, getZoneId, importWallet, isDemo, loadWallet, readQuery, resetDemo,
  saveRole, saveZoneId, setDemo, type Role, type RoleWallet,
} from '@/lib/session';
import { zoneById } from '@/lib/zones';

type Wallets = Record<Role, RoleWallet | null>;

interface Ctx {
  role: Role | null;
  setRole: (r: Role) => void;
  wallets: Wallets;
  wallet: RoleWallet | null;
  address: Address | null;
  core: AnyCore | null;
  coreError: string | null;
  demo: boolean;
  zoneId: string;
  setZone: (id: string) => void;
  verifierVisible: boolean;
  createMyWallet: () => void;
  replaceWallet: (privateKey: string) => void;
  signOut: () => void;
  startDemo: () => void;
  exitDemo: () => void;
}

const SessionCtx = createContext<Ctx | null>(null);

const readWallets = (): Wallets => ({
  resident: loadWallet('resident'),
  runner: loadWallet('runner'),
  verifier: loadWallet('verifier'),
});

function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [boot] = useState(() => {
    // URL hints first (new-tab helper): ?demo=1&zone=A&role=runner
    const q = readQuery();
    if (q.demo) {
      setDemo(true);
      if (q.zone) saveZoneId(zoneById(q.zone).id);
      ROLES.forEach(createWallet);
    }
    if (q.role) saveRole(q.role);
    else if (q.demo && !getRole()) saveRole('resident');
    return { verifierFlag: !!q.verifier };
  });
  const [wallets, setWallets] = useState<Wallets>(readWallets);
  const [role, setRoleState] = useState<Role | null>(() => getRole());
  const [demo, setDemoState] = useState(() => isDemo());
  const [zoneId, setZoneId] = useState(() => getZoneId() ?? 'A');
  const [core, setCore] = useState<AnyCore | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);

  const wallet = role ? wallets[role] : null;
  const verifierAddr = wallets.verifier?.address ?? null;

  useEffect(() => {
    let dead = false;
    let made: AnyCore | null = null;
    setCore(null);
    setCoreError(null);
    if (!wallet) return;
    createCore(wallet, demo ? verifierAddr : null)
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
  }, [wallet?.address, demo, verifierAddr]);

  const setRole = useCallback((r: Role) => {
    saveRole(r);
    setRoleState(r);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      role,
      setRole,
      wallets,
      wallet,
      address: wallet?.address ?? null,
      core,
      coreError,
      demo,
      zoneId,
      setZone: (id) => {
        saveZoneId(id);
        setZoneId(id);
      },
      verifierVisible: demo || boot.verifierFlag,
      createMyWallet: () => {
        if (!role) return;
        createWallet(role);
        setWallets(readWallets());
      },
      replaceWallet: (pk) => {
        if (!role) return;
        importWallet(role, pk);
        setWallets(readWallets());
        qc.clear();
      },
      signOut: () => {
        if (!role) return;
        deleteWallet(role);
        setWallets(readWallets());
        qc.clear();
      },
      startDemo: () => {
        setDemo(true);
        ROLES.forEach(createWallet);
        saveRole('resident');
        setWallets(readWallets());
        setDemoState(true);
        setRoleState('resident');
      },
      exitDemo: () => {
        resetDemo();
        qc.clear();
        setWallets(readWallets());
        setDemoState(false);
        setRoleState(null);
        setZoneId('A');
      },
    }),
    [role, wallets, wallet, core, coreError, demo, zoneId, boot.verifierFlag, setRole, qc],
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
    const off = core.subscribe({}, () => {
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

/** For screens rendered under WalletGate, where core is guaranteed. */
export function useCore() {
  const { core } = useSession();
  if (!core) throw new Error('Core not ready (render under WalletGate)');
  return core;
}
