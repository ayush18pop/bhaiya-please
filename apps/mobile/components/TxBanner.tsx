import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { describeError } from '@/hooks/useTx';
import { S } from '@/lib/strings';

/** Inline failed state. Chain jargon only behind "Details". */
export function TxBanner({ error, onRetry, message }: { error: unknown; onRetry?: () => void; message?: string }) {
  const [open, setOpen] = useState(false);
  const d = describeError(error);
  return (
    <View role="alert" className="gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
      <View className="flex-row items-start gap-2">
        <Icon as={AlertTriangle} size={18} className="mt-0.5 text-destructive" />
        <View className="flex-1 gap-0.5">
          <Text className="font-semibold text-destructive">{message ?? d.message}</Text>
          {message ? <Text variant="muted">{d.message}</Text> : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        {onRetry ? (
          <Button size="sm" variant="outline" onPress={onRetry}>
            <Text>{S.common.tryAgain}</Text>
          </Button>
        ) : <View />}
        <Pressable onPress={() => setOpen((o) => !o)}>
          <Text variant="caption" className="underline">Details</Text>
        </Pressable>
      </View>
      {open && <Text variant="caption" className="font-mono">{d.code}: {d.detail}</Text>}
    </View>
  );
}
