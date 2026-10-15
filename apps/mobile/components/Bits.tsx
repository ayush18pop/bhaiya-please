import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Inbox } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function EmptyState({ title, body, icon = Inbox, children }: { title: string; body?: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10">
      <Icon as={icon} size={28} className="text-muted-foreground" />
      <Text className="text-center font-semibold">{title}</Text>
      {body ? <Text variant="muted" className="text-center">{body}</Text> : null}
      {children}
    </View>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <View className={cn('animate-pulse rounded-xl bg-muted', className)} />;
}

export function SkeletonCards({ n = 2 }: { n?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-36" />)}
    </View>
  );
}

export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('gap-4 p-4', className)}>{children}</View>;
}

import { ScrollView } from 'react-native';

/** Scrollable page with an optional sticky bottom bar (primary CTA, min 48 px). */
export function Page({ children, footer, className }: { children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName={cn('gap-4 p-4 pb-8', className)} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View className="gap-2 border-t border-border bg-background p-3">{footer}</View> : null}
    </View>
  );
}
