import { View } from 'react-native';
import { Lock, ReceiptText } from 'lucide-react-native';
import type { Receipt } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { OnChainProof } from '@/components/OnChainProof';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { dateTime } from '@/lib/format';
import { S } from '@/lib/strings';

export function ReceiptCard({ receipt, proof = true }: { receipt: Receipt; proof?: boolean }) {
  return (
    <Card className="gap-3 border-secondary/40 py-4">
      <View className="flex-row items-center gap-2 px-4">
        <Icon as={ReceiptText} size={18} className="text-secondary" />
        <Text className="font-bold uppercase tracking-wide text-secondary">Receipt</Text>
        <Text variant="caption" className="ml-auto">{dateTime(receipt.createdAt)}</Text>
      </View>
      <View className="gap-2 px-4">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="muted">Issued by</Text>
          <AliasChip address={receipt.creator} showHandle={false} size={22} />
        </View>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="muted">Owned by</Text>
          <AliasChip address={receipt.owner} showHandle={false} size={22} />
        </View>
        <View className="flex-row items-center gap-1.5">
          <Icon as={Lock} size={13} className="text-muted-foreground" />
          <Text variant="caption">Can&apos;t be edited by anyone. Valid 1 year.</Text>
        </View>
        {receipt.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5">
            {receipt.tags.map((t) => (
              <Badge key={t} variant="accent"><Text>{S.rate.tags[t]}</Text></Badge>
            ))}
          </View>
        )}
      </View>
      {proof && (
        <View className="px-4">
          <OnChainProof entityKey={receipt.key} />
        </View>
      )}
    </Card>
  );
}
