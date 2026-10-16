import { View } from 'react-native';
import { Text } from '@/components/ui/text';

export function MapSkeleton() {
  return (
    <View className="absolute inset-0 items-center justify-center bg-muted">
      <View className="h-3 w-3 animate-pulse rounded-full bg-primary" />
      <Text variant="caption" className="mt-2">Loading map…</Text>
    </View>
  );
}
