import { memo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { Inbox, Sparkles } from 'lucide-react-native';
import { Shimmer } from '@/components/Motion';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/**
 * Illustrated empty state: a soft saffron disc, the main lucide icon, and two small floating satellites.
 * Pure vector, theme-aware, no image assets.
 */
export function EmptyState({ title, body, icon = Inbox, satellites, children }: { title: string; body?: string; icon?: LucideIcon; satellites?: [LucideIcon, LucideIcon]; children?: React.ReactNode }) {
  const [A, B] = satellites ?? [Sparkles, Sparkles];
  return (
    <Animated.View entering={FadeIn.duration(300)} className="items-center gap-3 rounded-card border border-dashed border-border bg-card/60 px-6 py-9">
      <View className="h-28 w-36 items-center justify-center">
        <View className="absolute h-24 w-24 rounded-full bg-accent" />
        <View className="absolute left-2 top-3 h-3 w-3 rounded-full bg-secondary/30" />
        <View className="absolute bottom-3 right-4 h-2 w-2 rounded-full bg-primary/40" />
        <View className="absolute left-1 top-7 h-8 w-8 items-center justify-center rounded-full bg-card shadow-card">
          <Icon as={A} size={15} className="text-secondary" />
        </View>
        <View className="absolute bottom-4 right-1 h-8 w-8 items-center justify-center rounded-full bg-card shadow-card">
          <Icon as={B} size={15} className="text-primary-ink" />
        </View>
        <View className="h-16 w-16 items-center justify-center rounded-full bg-card shadow-lift">
          <Icon as={icon} size={30} className="text-primary-ink" />
        </View>
      </View>
      <Text variant="h3" className="text-center">{title}</Text>
      {body ? <Text variant="muted" className="text-center leading-5">{body}</Text> : null}
      {children}
    </Animated.View>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <Shimmer className={cn('rounded-xl', className)} />;
}

/** Mirrors RunCard's layout so nothing jumps when data lands. */
function RunCardSkeleton() {
  return (
    <View className="gap-3 rounded-card border border-border/70 bg-card py-4 shadow-card">
      <View className="flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </View>
        <Skeleton className="h-6 w-24 rounded-full" />
      </View>
      <View className="flex-row items-end justify-between px-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-32" />
      </View>
      <View className="px-4"><Skeleton className="h-2 w-full rounded-full" /></View>
      <View className="flex-row gap-4 px-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </View>
      <View className="px-4"><Skeleton className="h-12 w-full" /></View>
    </View>
  );
}

function RowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-border/70 bg-card p-4 shadow-card">
      <Skeleton className="h-10 w-10 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </View>
      <Skeleton className="h-6 w-14 rounded-full" />
    </View>
  );
}

function ProfileSkeleton() {
  return (
    <View className="gap-4">
      <View className="items-center gap-3 rounded-card border border-border/70 bg-card p-5 shadow-card">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <View className="mt-1 w-full flex-row gap-3">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </View>
      </View>
      <RowSkeleton />
      <RowSkeleton />
    </View>
  );
}

export const SkeletonCards = memo(function SkeletonCards({ n = 2, kind = 'run' }: { n?: number; kind?: 'run' | 'row' | 'profile' }) {
  if (kind === 'profile') return <ProfileSkeleton />;
  const Item = kind === 'row' ? RowSkeleton : RunCardSkeleton;
  return (
    <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: n }).map((_, i) => <Item key={i} />)}
    </View>
  );
});

export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('gap-4 p-4', className)}>{children}</View>;
}

/** Horizontally scrolling filter / category chips. Selected = saffron fill; always icon+text friendly. */
export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName={cn('gap-2 px-4 py-1', className)} className="grow-0 -mx-4">
      {children}
    </ScrollView>
  );
}

export function Chip({ label, icon, selected, onPress }: { label: string; icon?: LucideIcon; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={cn('min-h-9 flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-80', selected ? 'border-primary bg-primary' : 'border-border bg-card')}>
      {icon ? <Icon as={icon} size={14} className={selected ? 'text-primary-foreground' : 'text-muted-foreground'} /> : null}
      <Text className={cn('text-sm font-semibold', selected ? 'text-primary-foreground' : 'text-foreground')}>{label}</Text>
    </Pressable>
  );
}

/** Scrollable page with an optional sticky bottom CTA bar (primary CTA, min 48 px). */
export function Page({ children, footer, className }: { children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName={cn('gap-4 p-4 pb-8', className)} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View className="gap-2 rounded-t-card border-t border-border bg-card px-4 pb-3 pt-3 shadow-sheet">{footer}</View> : null}
    </Animated.View>
  );
}
