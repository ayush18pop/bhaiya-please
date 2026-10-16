import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { ExternalLink, FlaskConical, Home, Moon, ScanLine, Sun, User, ListChecks, Inbox, Truck, BadgeCheck, WifiOff } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { toast } from 'sonner-native';
import type { LucideIcon } from 'lucide-react-native';
import { useCore, useSession } from '@/components/providers';
import { PingBeacon } from '@/components/PingBeacon';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useProfile, useBalance } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { formatEth } from '@/lib/format';
import { openInNewTab, ROLES, type Role } from '@/lib/session';
import { S } from '@/lib/strings';
import { zoneById } from '@/lib/zones';
import { cn } from '@/lib/utils';
import { fmt } from '@/lib/format';

const HOME: Record<Role, string> = { resident: '/r', runner: '/u/run', verifier: '/v' };

interface Tab { label: string; href: string; icon: LucideIcon; match: (p: string) => boolean }
const TABS: Record<Role, Tab[]> = {
  resident: [
    { label: 'Runs', href: '/r', icon: Home, match: (p) => p === '/r' || p.startsWith('/r/run') || p === '/r/request/new' },
    { label: 'My requests', href: '/r/requests', icon: ListChecks, match: (p) => p === '/r/requests' || (p.startsWith('/r/request/') && p !== '/r/request/new') },
    { label: 'Me', href: '/me', icon: User, match: (p) => p === '/me' || p.startsWith('/p/') || p === '/wallet' },
  ],
  runner: [
    { label: 'Run', href: '/u/run', icon: Truck, match: (p) => p === '/u/run' },
    { label: 'Requests', href: '/u/requests', icon: Inbox, match: (p) => p === '/u/requests' },
    { label: 'Scan', href: '/u/scan', icon: ScanLine, match: (p) => p === '/u/scan' },
    { label: 'Me', href: '/me', icon: User, match: (p) => p === '/me' || p.startsWith('/p/') || p === '/wallet' },
  ],
  verifier: [
    { label: 'Scan', href: '/v', icon: ScanLine, match: (p) => p === '/v' },
    { label: 'Issued', href: '/v/issued', icon: BadgeCheck, match: (p) => p === '/v/issued' },
    { label: 'Me', href: '/me', icon: User, match: (p) => p === '/me' || p === '/wallet' },
  ],
};

function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const up = () => setOn(true);
    const down = () => setOn(false);
    setOn(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  return (
    <Pressable onPress={toggleColorScheme} className="h-10 w-10 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Toggle dark mode">
      <Icon as={colorScheme === 'dark' ? Sun : Moon} size={18} />
    </Pressable>
  );
}

function RoleSwitch({ compact }: { compact?: boolean }) {
  const { role, setRole, wallets, verifierVisible } = useSession();
  const router = useRouter();
  const roles = ROLES.filter((r) => r !== 'verifier' || verifierVisible);
  return (
    <View className="flex-row gap-1 rounded-lg bg-muted p-1" accessibilityRole="tablist">
      {roles.map((r) => {
        const active = r === role;
        return (
          <Pressable
            key={r}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              setRole(r);
              router.replace(HOME[r] as never);
            }}
            className={cn('flex-1 items-center rounded-md px-2 py-1.5', active && 'bg-card shadow-sm shadow-black/10')}>
            <Text className={cn('text-sm font-bold', active ? 'text-foreground' : 'text-muted-foreground')}>{S.roles[r]}</Text>
            {!compact && wallets[r] ? <Text variant="caption" numberOfLines={1}>{aliasFor(wallets[r]!.address)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function BalanceChip() {
  const bal = useBalance();
  if (bal.data === undefined) return null;
  return <Text variant="caption" className="font-mono">{formatEth(bal.data)} GLM</Text>;
}

function DemoBar() {
  const { zoneId, role, exitDemo, verifierVisible, core } = useSession();
  const router = useRouter();
  const others = ROLES.filter((r) => r !== role && (r !== 'verifier' || verifierVisible));
  return (
    <View className="gap-2 border-b border-warning-foreground/20 bg-warning px-3 py-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Icon as={FlaskConical} size={14} className="text-warning-foreground" />
          <Text className="text-xs font-extrabold text-warning-foreground">{S.demo.bar} · {zoneById(zoneId).society}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          {core ? <BalanceChip /> : null}
          <Pressable
            onPress={() => {
              exitDemo();
              router.replace('/');
            }}>
            <Text className="text-xs font-semibold text-warning-foreground underline">{S.demo.reset}</Text>
          </Pressable>
        </View>
      </View>
      <RoleSwitch />
      {Platform.OS === 'web' && (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {others.map((r) => (
            <Pressable key={r} onPress={() => openInNewTab(r, zoneId)} className="flex-row items-center gap-1" accessibilityRole="link">
              <Icon as={ExternalLink} size={12} className="text-warning-foreground" />
              <Text className="text-xs font-semibold text-warning-foreground">{fmt(S.demo.openAs, { role: S.roles[r] })}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function BottomTabs() {
  const { role } = useSession();
  const path = usePathname();
  const router = useRouter();
  if (!role) return null;
  return (
    <View className="flex-row border-t border-border bg-card" accessibilityRole="tablist">
      {TABS[role].map((t) => {
        const active = t.match(path);
        return (
          <Pressable key={t.href} onPress={() => router.replace(t.href as never)} accessibilityRole="tab" accessibilityState={{ selected: active }} className="min-h-14 flex-1 items-center justify-center gap-0.5 py-1.5">
            <Icon as={t.icon} size={22} className={active ? 'text-primary' : 'text-muted-foreground'} />
            <Text className={cn('text-xs', active ? 'font-bold text-primary' : 'text-muted-foreground')}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Toasts when the active wallet's tier changes (e.g. a verifier just vouched). */
function TierWatcher() {
  const { address } = useSession();
  const p = useProfile(address);
  const prev = useRef<{ addr: string | null; tier: number | null }>({ addr: null, tier: null });
  useEffect(() => {
    if (!p.data || !address) return;
    const t = p.data.tier.tier;
    const last = prev.current;
    if (last.addr === address && last.tier !== null && last.tier !== t) {
      const who = aliasFor(address);
      if (t > last.tier) toast.success(fmt(t === 2 ? S.profile.trustedToast : S.profile.verifiedToast, { who }));
      else toast(S.profile.removedToast);
    }
    prev.current = { addr: address, tier: t };
  }, [p.data?.tier.tier, address]);
  return null;
}

function TierWatcherGate() {
  const { core, role } = useSession();
  if (!core || role === 'verifier') return null;
  return (
    <>
      <TierWatcher />
      {role === 'runner' ? <PingBeacon /> : null}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { role, demo, wallet } = useSession();
  const online = useOnline();
  const isPublic = path === '/' || path === '/zone';

  return (
    <View className="flex-1 items-center bg-muted">
      <View className="w-full max-w-[430px] flex-1 bg-background md:border-x md:border-border">
        <View className="flex-row items-center justify-between border-b border-border bg-card px-4 py-2">
          <Text className="text-lg font-extrabold text-primary">{S.app.name}</Text>
          <View className="flex-row items-center">
            {!demo && role && !isPublic ? <View className="w-52"><RoleSwitch compact /></View> : null}
            <ThemeToggle />
          </View>
        </View>
        {demo && role && path !== '/' ? <DemoBar /> : null}
        {!online && (
          <View className="flex-row items-center justify-center gap-2 bg-destructive px-3 py-1.5">
            <Icon as={WifiOff} size={14} className="text-destructive-foreground" />
            <Text className="text-xs font-semibold text-destructive-foreground">{S.common.offline}</Text>
          </View>
        )}
        <View className="flex-1">
          {children}
        </View>
        {!isPublic && role ? <BottomTabs /> : null}
        <TierWatcherGate />
      </View>
    </View>
  );
}

export { HOME };
