import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sun } from 'lucide-react-native';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page } from '@/components/Bits';
import { QrDisplay } from '@/components/QrDisplay';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRequestStatus } from '@/hooks/queries';
import { copyText } from '@/lib/clipboard';
import { rupees, fmt } from '@/lib/format';
import { encodeHandoffQR, loadSecret } from '@/lib/handoff';
import { aliasFor } from '@/lib/alias';
import { S } from '@/lib/strings';

export default function Handoff() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const q = useRequestStatus(key);
  const s = q.data;
  const secret = loadSecret(key);

  // Best-effort screen wake lock while the QR is up.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  // The runner revealed the code: go back to the timeline.
  useEffect(() => {
    if (s?.delivery) router.replace(`/r/request/${key}`);
  }, [s?.delivery, key, router]);

  if (!secret)
    return (
      <Page>
        <EmptyState title={S.handoff.missing} body={S.handoff.missingBody}>
          <Button variant="outline" onPress={() => router.replace(`/r/request/${key}`)}>
            <Text>{S.common.back}</Text>
          </Button>
        </EmptyState>
      </Page>
    );

  const text = encodeHandoffQR(secret);
  const who = s?.accept ? aliasFor(s.accept.rider) : 'the runner';

  return (
    <Page className="items-center gap-5">
      <Text variant="h2" className="text-center">{fmt(S.handoff.title, { who })}</Text>
      <QrDisplay value={text} size={230} />
      <View className="items-center gap-1">
        <Text variant="muted">{S.handoff.sayThis}</Text>
        <Text className="text-7xl font-extrabold tracking-[10px]" style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`Code ${secret.code.split('').join(' ')}`}>
          {secret.code}
        </Text>
      </View>
      <Button variant="outline" onPress={() => copyText(text, 'Handoff text copied')}>
        <Text>{S.handoff.copy}</Text>
      </Button>
      {s?.request ? <Text className="text-center font-semibold">{fmt(S.handoff.pay, { amount: `${rupees(s.request.maxPrice)} + ${rupees(s.request.tip)}` })}</Text> : null}
      <View className="flex-row items-center gap-1.5">
        <Icon as={Sun} size={14} className="text-muted-foreground" />
        <Text variant="caption">{S.handoff.brightness}</Text>
      </View>
      <ArkivNote text={S.handoff.note} explainer="Your request holds only a hash of this code plus a secret salt. When you show the QR, the runner publishes the code and salt, and anyone can check they match." />
    </Page>
  );
}
