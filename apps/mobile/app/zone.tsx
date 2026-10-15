import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Page } from '@/components/Bits';
import { HOME } from '@/components/AppShell';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { S } from '@/lib/strings';
import { ZONES } from '@/lib/zones';
import { cn } from '@/lib/utils';

export default function ZonePicker() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const router = useRouter();
  const { zoneId, setZone, role } = useSession();
  const [sel, setSel] = useState(zoneId);

  return (
    <Page
      footer={
        <Button
          size="lg"
          onPress={() => {
            setZone(sel);
            router.replace((next ?? (role ? HOME[role] : '/')) as never);
          }}>
          <Text>{S.common.continue}</Text>
        </Button>
      }>
      <Text variant="h2">{S.zone.title}</Text>
      <Text variant="muted">{S.zone.hint}</Text>
      <View className="gap-3" accessibilityRole="radiogroup">
        {ZONES.map((z) => {
          const on = sel === z.id;
          return (
            <Pressable
              key={z.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setSel(z.id)}
              className={cn('flex-row items-center gap-3 rounded-xl border-2 bg-card p-4', on ? 'border-primary' : 'border-border')}>
              <View className={cn('h-6 w-6 items-center justify-center rounded-full border-2', on ? 'border-primary bg-primary' : 'border-input')}>
                {on && <Icon as={Check} size={14} className="text-primary-foreground" />}
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-base font-bold">{z.label}</Text>
                <Text variant="caption" className="font-mono">{z.zone6} · {S.zone.chainSees}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Page>
  );
}
