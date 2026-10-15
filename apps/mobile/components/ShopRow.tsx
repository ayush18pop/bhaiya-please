import { Pressable, View } from 'react-native';
import { AlertTriangle, Check, Store } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Shop } from '@bhaiya-please/core';
import { useCore } from '@/components/providers';
import { TxButton } from '@/components/TxButton';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { daysFrom, fmt } from '@/lib/format';
import { S } from '@/lib/strings';
import { cn } from '@/lib/utils';

export function ExpiryLabel({ expiresAt }: { expiresAt: number }) {
  const left = daysFrom(expiresAt);
  const ago = Math.max(0, 30 - left);
  const warn = left < 3;
  return (
    <View className="flex-row items-center gap-1">
      {warn ? <Icon as={AlertTriangle} size={12} className="text-warning-foreground" /> : null}
      <Text variant="caption" className={cn(warn && 'font-semibold text-warning-foreground')}>
        {warn ? fmt(S.shops.expiresIn, { d: Math.max(0, left) }) : fmt(S.shops.lastConfirmed, { d: ago === 0 ? '<1 d' : `${ago} d` })}
      </Text>
    </View>
  );
}

/** Owns its own "Still open ✓" tx: extends the shop's life for everyone (permissionless extension). */
export function ShopRow({ shop, selected, onSelect }: { shop: Shop; selected: boolean; onSelect: () => void }) {
  const core = useCore();
  const qc = useQueryClient();
  return (
    <View className={cn('gap-2 rounded-xl border-2 bg-card p-3', selected ? 'border-primary' : 'border-border')}>
      <Pressable onPress={onSelect} accessibilityRole="radio" accessibilityState={{ checked: selected }} className="flex-row items-center gap-3">
        <View className={cn('h-6 w-6 items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary' : 'border-input')}>
          {selected && <Icon as={Check} size={14} className="text-primary-foreground" />}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Icon as={Store} size={14} className="text-muted-foreground" />
            <Text className="font-bold">{shop.nameTag}</Text>
            <Text variant="caption">{shop.category.replace('_', ' ')}</Text>
          </View>
          <ExpiryLabel expiresAt={shop.expiresAt} />
        </View>
      </Pressable>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" className="flex-1">{S.shops.confirmedBy}</Text>
        <View className="min-w-36">
          <TxButton
            size="sm"
            variant="soft"
            onTx={() => core.confirmShopOpen(shop.key)}
            onDone={() => qc.invalidateQueries()}
            toastDone={S.shops.confirmed}
            labels={{ idle: S.shops.stillOpen, pending: 'Confirming…', done: 'Confirmed ✓' }}
          />
        </View>
      </View>
    </View>
  );
}
