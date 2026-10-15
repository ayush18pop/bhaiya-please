import { View } from 'react-native';
import { Flag } from 'lucide-react-native';
import type { Complaint } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { OnChainProof } from '@/components/OnChainProof';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { aliasFor } from '@/lib/alias';
import { dateTime } from '@/lib/format';
import { S } from '@/lib/strings';

export function ComplaintRow({ complaint, viewerIsRunner, viewerIsResident }: { complaint: Complaint; viewerIsRunner?: boolean; viewerIsResident?: boolean }) {
  return (
    <Card className="gap-2 border-destructive/30 py-3">
      <View className="flex-row items-center gap-2 px-4">
        <Icon as={Flag} size={16} className="text-destructive" />
        <Text className="font-semibold">{S.rate.reasons[complaint.reason]}</Text>
        <Text variant="caption" className="ml-auto">{dateTime(complaint.createdAt)}</Text>
      </View>
      <View className="gap-1.5 px-4">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="muted">Filed by</Text>
          <AliasChip address={complaint.creator} showHandle={false} size={20} />
        </View>
        <Text variant="caption">
          {viewerIsRunner
            ? S.profile.complaintBelongs
            : viewerIsResident
              ? `You own this record. ${aliasFor(complaint.rider)} can't delete it.`
              : `Belongs to the resident. ${aliasFor(complaint.rider)} can't delete it.`}
        </Text>
        <OnChainProof entityKey={complaint.key} />
      </View>
    </Card>
  );
}
