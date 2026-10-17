/**
 * Opened handoff link (outside the account gate): the resident shared "…/h#<code>" with the runner
 * (B9 camera fallback). Explains what to do with it and copies the full link. Never reads core.
 */
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Copy, Lock } from 'lucide-react-native';
import { Alert, Button, Icon, Paper, Screen, Text } from '@/components/bp';
import { copyText } from '@/lib/clipboard';
import { useCopy } from '@/lib/i18n';
import { runnerCopy } from '@/screens/runner/copy';

function useFullUrl() {
  const [url, setUrl] = useState<string | null>(() => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null));
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Linking.getInitialURL()
      .then((u) => u && setUrl(u))
      .catch(() => {});
  }, []);
  return url;
}

export default function HandoffLinkPage() {
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const url = useFullUrl();
  const complete = !!url && /\/h#.+/.test(url);
  return (
    <Screen title={c.handoffPage.title} onBack={() => router.replace('/')}>
      <Paper shadow="yellow" className="gap-3 p-5">
        <Text className="font-hindi text-[26px] leading-[32px] text-ink">{c.handoffPage.kicker}</Text>
        <Text className="font-display text-[26px] leading-[30px] text-ink">{c.handoffPage.title}</Text>
        <Text className="text-[16px] font-semibold leading-[23px] text-ink">{c.handoffPage.body}</Text>
      </Paper>

      {complete ? (
        <>
          <View className="gap-3">
            <Text variant="heading">{c.handoffPage.runner}</Text>
            {c.handoffPage.steps.map((s, i) => (
              <View key={i} className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-plate border-2 border-edge">
                  <Text className="font-display text-[15px]">{i + 1}</Text>
                </View>
                <Text className="flex-1 text-[16px] font-bold">{s}</Text>
              </View>
            ))}
          </View>
          <Button label={c.handoffPage.copy} icon={Copy} size="xl" onPress={() => void copyText(url!, c.handoffPage.copied)} />
        </>
      ) : (
        <Alert tone="expired" title={c.handoffPage.missing} />
      )}

      <View className="flex-row items-start gap-2.5">
        <Icon as={Lock} size={18} className="mt-0.5 text-muted" />
        <Text className="flex-1 text-[15px] leading-[21px] text-muted">{c.handoffPage.resident}</Text>
      </View>
      <Button label={c.handoffPage.open} variant="secondary" size="lg" onPress={() => router.replace('/')} />
    </Screen>
  );
}
