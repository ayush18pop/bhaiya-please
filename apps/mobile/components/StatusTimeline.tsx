import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export function StatusTimeline({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <View className="flex-row items-start">
      {steps.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              <View className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= current ? 'bg-secondary' : 'bg-border')} />
              <View className={cn('h-7 w-7 items-center justify-center rounded-full border-2', done ? 'border-secondary bg-secondary' : now ? 'border-primary bg-primary' : 'border-border bg-card')}>
                {done ? <Icon as={Check} size={14} className="text-secondary-foreground" /> : now ? <View className="h-2.5 w-2.5 rounded-full bg-primary-foreground" /> : null}
              </View>
              <View className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'bg-transparent' : i < current ? 'bg-secondary' : 'bg-border')} />
            </View>
            <Text className={cn('mt-1.5 text-xs', now ? 'font-bold' : done ? 'font-medium' : 'text-muted-foreground')}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}
