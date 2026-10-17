/** D8 Privacy and data: what's public, what stays on your phone, what's never collected. Plain words. */
import { View } from 'react-native';
import { Check, Lock, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Icon, PrivacyLine, Screen, Text } from '@/components/bp';
import { Rise } from '@/screens/shared/parts';
import { useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';

function Block({ title, items, icon, tone, index }: { title: string; items: readonly string[]; icon: LucideIcon; tone: string; index: number }) {
  return (
    <Rise index={index} className="gap-2">
      <Text className="px-1 text-[17px] font-bold">{title}</Text>
      <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
        {items.map((it, i) => (
          <View key={it} className={cn('min-h-[52px] flex-row items-center gap-3 px-3.5 py-2.5', i < items.length - 1 && 'border-b-2 border-line')}>
            <Icon as={icon} size={20} strokeWidth={2.8} className={tone} />
            <Text className="flex-1 text-[15px] leading-[21px]">{it}</Text>
          </View>
        ))}
      </View>
    </Rise>
  );
}

export default function Privacy() {
  const c = useCopy(sharedCopy).privacy;
  return (
    <Screen title={c.title} contentClassName="gap-5 pb-10">
      <Block index={0} title={c.publicTitle} items={c.publicItems} icon={Check} tone="text-yellow" />
      <Block index={1} title={c.phoneTitle} items={c.phoneItems} icon={Lock} tone="text-go" />
      <Block index={2} title={c.neverTitle} items={c.neverItems} icon={X} tone="text-mirchi" />
      <PrivacyLine text={c.footer} />
    </Screen>
  );
}
