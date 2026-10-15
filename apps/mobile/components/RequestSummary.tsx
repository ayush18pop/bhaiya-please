import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { Request } from '@bhaiya-please/core';
import { useCore } from '@/components/providers';
import { Text } from '@/components/ui/text';
import { rupees } from '@/lib/format';

export function useShopName(shopKey?: `0x${string}`) {
  const core = useCore();
  const q = useQuery({ queryKey: ['shop', shopKey], queryFn: () => core.getShop(shopKey!), enabled: !!shopKey, staleTime: 60_000, refetchInterval: false });
  return q.data?.nameTag ?? '…';
}

export function RequestSummary({ request }: { request: Request }) {
  const shop = useShopName(request.shop);
  return (
    <View className="gap-0.5">
      <Text className="text-base font-bold">{request.items.join(', ')}</Text>
      <Text variant="muted">
        {shop} · ≤{rupees(request.maxPrice)} + {rupees(request.tip)} tip
      </Text>
    </View>
  );
}
