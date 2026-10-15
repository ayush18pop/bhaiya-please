import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { View } from 'react-native';

/** Initials avatar tinted from a stable hue (no images, pseudonymous). */
function Avatar({ label, hue, size = 40, className }: { label: string; hue: number; size?: number; className?: string }) {
  return (
    <View
      className={cn('items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, backgroundColor: `hsl(${hue} 55% 38%)` }}>
      <Text className="font-bold text-white" style={{ fontSize: size * 0.38 }}>
        {label}
      </Text>
    </View>
  );
}
export { Avatar };
