import { View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { rupees } from '@/lib/format';

/** Clamps at [min, cap]. */
export function PriceStepper({ value, cap, min = 10, step = 10, onChange, disabled, format = rupees }: { value: number; cap: number; min?: number; step?: number; onChange: (n: number) => void; disabled?: boolean; format?: (n: number) => string }) {
  return (
    <View className="flex-row items-center gap-3">
      <Button variant="outline" size="icon" disabled={disabled || value <= min} onPress={() => onChange(Math.max(min, value - step))} accessibilityLabel="Decrease">
        <Icon as={Minus} size={18} />
      </Button>
      <Text className="min-w-20 text-center text-2xl font-extrabold" style={{ fontVariant: ['tabular-nums'] }}>{format(value)}</Text>
      <Button variant="outline" size="icon" disabled={disabled || value >= cap} onPress={() => onChange(Math.min(cap, value + step))} accessibilityLabel="Increase">
        <Icon as={Plus} size={18} />
      </Button>
    </View>
  );
}
