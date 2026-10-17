/**
 * System states (design system "07 System states"): one treatment everywhere. Errors say what
 * happened and what to do next, no apology. Posters only for dead ends.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Lock } from 'lucide-react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Crowd } from './Peep';
import { LiveDot, MelaLights } from './Signatures';
import { Icon, Text } from './Text';

/** Inline alert: coral rail for errors, mela-light rail for "expired / needs a glance". */
export function Alert({
  tone = 'error', title, body, actions, className,
}: { tone?: 'error' | 'expired' | 'info' | 'success'; title: string; body?: string; actions?: React.ReactNode; className?: string }) {
  const border = tone === 'error' ? 'border-mirchi' : tone === 'success' ? 'border-go' : tone === 'info' ? 'border-line' : 'border-edge';
  return (
    <View accessibilityRole="alert" className={cn('flex-row overflow-hidden rounded-block border-2 bg-surface', border, className)}>
      {tone === 'expired' ? <MelaLights width={14} /> : <View className={cn('w-1.5', tone === 'error' ? 'bg-mirchi' : tone === 'success' ? 'bg-go' : 'bg-yellow')} />}
      <View className="flex-1 gap-2.5 px-4 py-3.5">
        <Text className="text-[16px] font-bold leading-[22px]">{title}</Text>
        {body ? <Text className="text-[14px] leading-[20px] text-muted">{body}</Text> : null}
        {actions ? <View className="flex-row flex-wrap gap-2.5">{actions}</View> : null}
      </View>
    </View>
  );
}

/** Global offline banner: hazard edge + "showing data from N min ago". */
export function OfflineBanner({ text }: { text: string }) {
  return (
    <View accessibilityRole="alert" className="flex-row border-b-2 border-paper bg-raised">
      <MelaLights width={14} />
      <Text className="flex-1 px-3.5 py-3 text-[15px] font-bold">{text}</Text>
    </View>
  );
}

/** One consistent privacy reassurance line (lock + muted text). */
export function PrivacyLine({ text, className, onPaper }: { text: string; className?: string; onPaper?: boolean }) {
  return (
    <View className={cn('flex-row items-start gap-2.5', className)}>
      <Icon as={Lock} size={18} className={cn('mt-0.5', onPaper ? 'text-ink' : 'text-muted')} />
      <Text className={cn('flex-1 text-[15px] leading-[21px]', onPaper ? 'text-ink' : 'text-muted')}>{text}</Text>
    </View>
  );
}

/** Live indicator: live (pulsing green) · stale (dashed) · reconnecting (yellow blink). */
export function LiveIndicator({ state, text, className }: { state: 'live' | 'stale' | 'reconnecting'; text: string; className?: string }) {
  return (
    <View className={cn('flex-row items-center gap-2.5', className)}>
      {state === 'live' ? <LiveDot size={10} /> : state === 'stale' ? <View className="h-2.5 w-2.5 rounded-pill border-2 border-dashed border-muted" /> : <LiveDot size={10} color="#FFB400" />}
      <Text className={cn('text-[15px] font-semibold', state === 'stale' ? 'text-muted' : state === 'reconnecting' ? 'text-yellow' : 'text-fg')}>{text}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ skeletons

/** Skeleton block: 1.2s opacity shimmer, static under reduced motion. */
export function Skeleton({ className, style }: { className?: string; style?: object }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withTiming(0.45, { duration: 600, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 600 })), -1, false);
  }, [reduce, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View aria-hidden style={[a, style]} className={cn('rounded-plate bg-line', className)} />;
}

/** Card-shaped skeletons that mirror the real content. */
export function SkeletonCards({ n = 2, kind = 'run' }: { n?: number; kind?: 'run' | 'row' | 'map' }) {
  return (
    <View aria-busy accessibilityLabel="Loading" className="gap-3">
      {kind === 'map' ? <Skeleton className="h-[150px] rounded-block bg-surface" /> : null}
      {Array.from({ length: n }, (_, i) =>
        kind === 'row' ? (
          <View key={i} className="flex-row items-center gap-2.5 rounded-block border-2 border-raised bg-surface p-3.5">
            <Skeleton className="h-11 w-11 rounded-pill" />
            <Skeleton className="h-3.5 flex-1" />
          </View>
        ) : (
          <View key={i} className="gap-3 rounded-block border-2 border-raised bg-surface p-3.5">
            <View className="flex-row items-center gap-2.5">
              <Skeleton className="h-11 w-11 rounded-pill" />
              <View className="flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3 bg-raised" />
              </View>
              <Skeleton className="h-9 w-16 bg-raised" />
            </View>
            <Skeleton className="h-3 w-4/5 bg-raised" />
            <Skeleton className="h-12 rounded-block bg-raised" />
          </View>
        ),
      )}
    </View>
  );
}

// ------------------------------------------------------------------ posters

const CROWD_A = ['uncle-1', 'auntie-2', 'kid-3', 'student-9', 'dada-4', 'p12', 'p5'];
const CROWD_B = ['rider-7', 'guard-2', 'didi-5', 'bhai-8', 'p30', 'p14'];

/**
 * Wall poster for dead ends and empty states: paper (or night) panel, big headline, one action,
 * and a crowd bleeding off the bottom edge.
 */
export function Poster({
  kicker, title, body, action, night, lights, children, crowd = true, className, minHeight = 520,
}: {
  kicker?: string; title: string; body?: string; action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' }; night?: boolean; lights?: boolean;
  children?: React.ReactNode; crowd?: boolean; className?: string; minHeight?: number;
}) {
  return (
    <View className={cn('overflow-hidden rounded-block border-2', night ? 'border-paper bg-ink' : 'border-ink bg-paper', className)} style={{ minHeight }}>
      {lights ? <MelaLights height={28} className="border-b-2 border-paper" /> : null}
      <View className="gap-4 px-6 pt-7">
        {kicker ? <Text className={cn('font-hindi text-[30px] leading-[34px]', night ? 'text-paper' : 'text-ink')}>{kicker}</Text> : null}
        <Text className={cn('font-display text-[36px] leading-[38px]', night ? 'text-paper' : 'text-ink')}>{title}</Text>
        {body ? <Text className={cn('text-[16px] font-semibold leading-[23px]', night ? 'text-muted' : 'text-ink')}>{body}</Text> : null}
        {children}
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant={action.variant === 'secondary' ? (night ? 'secondary' : 'paper') : 'primary'}
            size="md"
            full={false}
          />
        ) : null}
      </View>
      {crowd ? (
        <View aria-hidden pointerEvents="none" className="absolute -bottom-3 -left-5 -right-5" style={{ height: 200 }}>
          <Crowd seeds={CROWD_A} size={110} className="absolute bottom-[34px] left-0" tone={night ? 'night' : 'paper'} />
          <Crowd seeds={CROWD_B} size={124} accentIndex={0} className="absolute bottom-0 left-6" tone={night ? 'night' : 'paper'} />
        </View>
      ) : null}
    </View>
  );
}

/** Small calm empty state for lists (one sentence, optional action). */
export function Empty({ title, body, action }: { title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="items-start gap-2 rounded-block border-2 border-dashed border-line px-4 py-5">
      <Text className="text-[17px] font-bold">{title}</Text>
      {body ? <Text className="text-[15px] leading-[21px] text-muted">{body}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" size="sm" full={false} /> : null}
    </View>
  );
}
