/**
 * Live strip: a compact bar above the tabs on every screen while something is in progress.
 * Resident: "Ravi · 4 min away · Show code". Runner: "Run to Lotus Heights · 12 min · 2 waiting".
 * Attention (needs a glance — runner at the gate, request accepted): turns solid yellow with a
 * mela-light edge, a shine sweeps across once (1.2s) and the button pulses; short vibration.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { LiveDot, MelaLights, Text } from '@/components/bp';
import { useSession } from '@/components/providers';
import { useMyRequests, useRun, useRunnerBoard } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { placeName } from '@/lib/societies';
import { cn } from '@/lib/utils';

interface StripModel {
  key: string;
  text: string;
  cta: string;
  href: string;
  ctaHref: string;
  attention: boolean;
}

function useResidentStrip(now: number): StripModel | null {
  const q = useMyRequests();
  const row = useMemo(() => (q.data ?? []).find((r) => !r.delivery), [q.data]);
  const run = useRun(row?.request.run);
  if (!row) return null;
  const r = run.data;
  if (!r && !row.accept) return null; // lapsed
  const who = r ? aliasFor(r.creator) : aliasFor(row.accept?.rider);
  const mins = r ? Math.max(0, Math.ceil((r.eta - now) / 60)) : 0;
  const href = `/request/${row.request.key}`;
  if (row.accept && r?.atGateAt) return { key: `${row.request.key}:gate`, text: t('track.atGate', { name: who }), cta: 'Show code', href, ctaHref: `${href}/code`, attention: true };
  if (row.accept) return { key: `${row.request.key}:acc`, text: mins > 0 ? `${who} · ${mins} min away` : `${who} · arriving`, cta: 'Show code', href, ctaHref: `${href}/code`, attention: false };
  return { key: `${row.request.key}:wait`, text: `Waiting for ${who} to accept`, cta: 'Track', href, ctaHref: href, attention: false };
}

function useRunnerStrip(now: number): StripModel | null {
  const q = useRunnerBoard();
  const run = q.data?.run;
  if (!run || run.expiresAt <= now) return null;
  const rows = q.data?.rows ?? [];
  const waiting = rows.filter((r) => !r.accept && !r.decline).length;
  const accepted = rows.filter((r) => r.accept && !r.delivery).length;
  const mins = Math.max(0, Math.ceil((run.eta - now) / 60));
  const taken = rows.filter((r) => r.accept).length;
  const total = taken + run.capacityLeft;
  const base = `Run to ${placeName(run.destZone)} · ${mins > 0 ? `${mins} min` : 'arriving'} · ${taken} of ${total}`;
  if (waiting > 0) return { key: `${run.key}:w${waiting}`, text: base, cta: `${waiting} waiting`, href: '/home', ctaHref: '/home', attention: true };
  if (accepted > 0 && run.eta - now <= 120) return { key: `${run.key}:gate`, text: base, cta: run.atGateAt ? 'Scan code' : "I'm at the gate", href: '/home', ctaHref: '/runner/gate', attention: false };
  return { key: run.key, text: base, cta: 'Open', href: '/home', ctaHref: '/home', attention: false };
}

function Strip({ m }: { m: StripModel }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const sweep = useSharedValue(-1);
  const pulse = useSharedValue(1);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!m.attention || last.current === m.key) return;
    last.current = m.key;
    haptic.warn();
    if (reduce) return;
    sweep.value = -1;
    sweep.value = withTiming(1, { duration: 1200, easing: Easing.linear });
    pulse.value = withDelay(600, withSequence(withTiming(1.06, { duration: 150 }), withTiming(1, { duration: 150 }), withTiming(1.06, { duration: 150 }), withTiming(1, { duration: 150 })));
  }, [m.attention, m.key, reduce, sweep, pulse]);
  const shine = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * w }], opacity: sweep.value > -1 && sweep.value < 1 ? 1 : 0 }));
  const btn = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      className={cn('h-14 flex-row items-center gap-3 overflow-hidden border-t-2 pr-2', m.attention ? 'border-ink bg-yellow' : 'border-line bg-raised')}>
      {m.attention ? <MelaLights width={44} height={56} /> : <View className="w-1.5 self-stretch bg-yellow" />}
      {!m.attention ? <LiveDot size={10} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={m.text} onPress={() => router.push(m.href as never)} className="flex-1 self-stretch justify-center">
        <Text numberOfLines={1} className={cn('text-[15px]', m.attention ? 'font-bold text-ink' : 'font-semibold')}>
          {m.text}
        </Text>
      </Pressable>
      <Animated.View style={btn}>
        <Pressable onPress={() => router.push(m.ctaHref as never)} accessibilityRole="button" className={cn('rounded-plate border-2 border-ink px-3 py-2', m.attention ? 'bg-ink' : 'bg-yellow')}>
          <Text className={cn('font-display text-[13px]', m.attention ? 'text-yellow' : 'text-ink')}>{m.cta}</Text>
        </Pressable>
      </Animated.View>
      {w > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w }, shine]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']} locations={[0.2, 0.45, 0.7]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function ResidentStrip({ hide }: { hide: string[] }) {
  const now = useNow();
  const m = useResidentStrip(now);
  const path = usePathname();
  if (!m || hide.some((h) => path.startsWith(h)) || path === m.href || path === m.ctaHref) return null;
  return <Strip m={m} />;
}
function RunnerStrip({ hide }: { hide: string[] }) {
  const now = useNow();
  const m = useRunnerStrip(now);
  const path = usePathname();
  if (!m || hide.some((h) => path.startsWith(h)) || path === '/home') return null;
  return <Strip m={m} />;
}

/** Hidden on screens that already show the same thing full-size. */
export function LiveStrip() {
  const { mode, core, guest } = useSession();
  if (!core || guest) return null;
  if (mode === 'get') return <ResidentStrip hide={['/runner', '/desk']} />;
  if (mode === 'run') return <RunnerStrip hide={['/runner/scan', '/runner/gate', '/runner/done']} />;
  return null;
}
