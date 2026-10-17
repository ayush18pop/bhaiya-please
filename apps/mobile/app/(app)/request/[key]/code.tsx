/** B9 Handoff code: QR + 4 digits on a white panel. Keeps the screen awake; returns to B8 once scanned. */
import { useEffect } from 'react';
import { Platform, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share2, Sun } from 'lucide-react-native';
import { Alert, Button, Icon, Meter, Screen, Text, toast } from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useRequestStatus } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { copyText } from '@/lib/clipboard';
import { rupees } from '@/lib/format';
import { encodeHandoffQR, handoffLink, loadSecret } from '@/lib/handoff';
import { fill, useCopy } from '@/lib/i18n';
import { residentCopy } from '@/screens/resident/copy';
import { Rise } from '@/screens/resident/parts';

/** Best-effort screen wake lock while the code is up (web Wake Lock API; native has no module installed). */
function useKeepAwake() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    let lock: { release: () => Promise<void> } | null = null;
    let dead = false;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((l) => {
        if (dead) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      dead = true;
      lock?.release().catch(() => {});
    };
  }, []);
}

export default function HandoffCode() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const c = useCopy(residentCopy);
  const q = useRequestStatus(key);
  const s = q.data;
  const secret = loadSecret(key);
  const name = aliasFor(s?.accept?.rider ?? s?.run?.creator);
  useKeepAwake();

  useEffect(() => {
    if (!s?.delivery) return;
    toast.success(c.code.saved);
    router.replace(`/request/${key}`);
  }, [s?.delivery, key, router, c.code.saved]);

  if (!secret)
    return (
      <Screen title={c.code.title} close>
        <Alert tone="info" title={c.code.missing} body={c.code.missingBody} actions={<Button label={c.common.back} variant="secondary" size="md" onPress={() => router.replace(`/request/${key}`)} />} />
      </Screen>
    );

  const share = async () => {
    const link = handoffLink(secret);
    try {
      if (Platform.OS === 'web' && !(navigator as unknown as { share?: unknown }).share) throw new Error('no share');
      await Share.share({ message: fill(c.code.shareMsg, { name, link }) });
    } catch {
      await copyText(link, c.code.copied);
    }
  };

  return (
    <Screen title={c.code.title} close onBack={() => router.replace(`/request/${key}`)}>
      <Rise index={0}>
        <View className="items-center gap-3 rounded-block border-2 border-paper bg-white p-[3px]">
          <View className="w-full items-center gap-3 rounded-[9px] border-2 border-ink px-4 py-5">
            <Text className="text-[17px] font-extrabold text-ink">{fill(c.code.showTo, { name })}</Text>
            <QrDisplay value={encodeHandoffQR(secret)} size={230} label={fill(c.code.showTo, { name })} />
            <Text className="text-[16px] font-bold text-ink">{c.code.readOut}</Text>
            <Meter value={secret.code} size="xl" spacing={14} border="ink" label={`Code ${secret.code.split('').join(' ')}`} />
          </View>
        </View>
      </Rise>
      {s?.request ? (
        <Text className="text-center text-[17px] font-extrabold">{fill(c.code.pay, { name, max: rupees(s.request.maxPrice), tip: rupees(s.request.tip) })}</Text>
      ) : null}
      {!s?.accept && s ? <Alert tone="info" title={fill(c.code.notYet, { name })} /> : null}
      <View className="flex-row items-center gap-2">
        <Icon as={Sun} size={18} className="text-muted" />
        <Text className="flex-1 text-[14px] text-muted">{Platform.OS === 'web' ? c.code.brightness : c.code.brightnessNative}</Text>
      </View>
      <Button label={c.code.share} icon={Share2} variant="secondary" onPress={share} />
    </Screen>
  );
}
