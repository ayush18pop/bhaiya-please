import { View } from 'react-native';
import { Shimmer } from '@/components/Motion';
import { Text } from '@/components/ui/text';

export function MapSkeleton() {
  return (
    <View className="absolute inset-0 items-center justify-center bg-muted">
      <Shimmer className="absolute inset-0 rounded-none" />
      <View className="rounded-full bg-card/90 px-3 py-1.5 shadow-card">
        <Text variant="caption" className="font-semibold">Loading map…</Text>
      </View>
    </View>
  );
}
