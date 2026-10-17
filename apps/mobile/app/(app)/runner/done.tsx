/** C9 Handoff done: the HANDED OVER stamp, what to collect, optional UPI QR, then next handoff / finish. */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ReceiptText } from 'lucide-react-native';
import {
  Alert, Animated, Button, Icon, Meter, Screen, Sheet, SkeletonCards, Stamp, Text, toast, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay,
  withTiming,
} from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useSession } from '@/components/providers';
import { useProfile, useRequestStatus } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { fill, t, useCopy } from '@/lib/i18n';
import { C, cn } from '@/lib/utils';
import { runnerCopy } from '@/screens/runner/copy';
import { Money, SunButton, useActiveRun, Rise } from '@/screens/runner/parts';
import { UpiSetup } from '@/screens/runner/UpiSetup';
import { upiId } from '@/screens/runner/upi';

/** Frame corners (the scanner's) that the stamp lands on, then fade. 450 ms in total. */
function StampMoment() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = reduce ? 0 : withDelay(300, withTiming(0, { duration: 150 }));
  }, [o, reduce]);
  const fade = useAnimatedStyle(() => ({ opacity: o.value }));
  const k = 'absolute h-9 w-9 border-yellow';
  return (
    <View aria-hidden className="h-[170px] w-[170px] items-center justify-center self-center">
      <Animated.View style={[{ position: 'absolute', inset: 0 }, fade]} pointerEvents="none">
        <View className={cn(k, 'left-0 top-0 border-l-4 border-t-4')} />
        <View className={cn(k, 'right-0 top-0 border-r-4 border-t-4')} />
        <View className={cn(k, 'bottom-0 left-0 border-b-4 border-l-4')} />
        <View className={cn(k, 'bottom-0 right-0 border-b-4 border-r-4')} />
      </Animated.View>
      <Stamp ring="" center={['HANDED', 'OVER']} color={C.yellow} size={150} animate="handed" delay={150} />
    </View>
  );
}

export default function HandoffDone() {
  const { request: key } = useLocalSearchParams<{ request?: string }>();
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const { address, prefs } = useSession();
  const st = useRequestStatus(key);
  const profile = useProfile(address);
  const a = useActiveRun();
  const [qr, setQr] = useState(false);
  const [upiSheet, setUpiSheet] = useState(false);
  const s = st.data;
  const r = s?.request;
  const name = r ? aliasFor(r.creator) : '';
  const receipt = s?.receipt ?? null;

  // "+1 handoff": the receipt for THIS delivery lands while the runner is looking.
  const hadReceipt = useRef<boolean | null>(null);
  useEffect(() => {
    if (!s) return;
    if (hadReceipt.current === false && receipt) toast.success(`${c.done.plusOne} · ${fill(c.done.receiptIn, { name })}`);
    hadReceipt.current = !!receipt;
  }, [s, receipt, c, name]);

  const next = a.waiting.find((w) => w.request.key !== key);

  return (
    <Screen
      runner
      bare
      footer={
        <>
          {next ? <Button label={fill(c.done.next, { name: aliasFor(next.request.creator) })} size="xl" onPress={() => router.replace('/runner/gate')} /> : null}
          <Button label={c.done.finish} size={next ? 'lg' : 'xl'} variant={next ? 'secondary' : 'primary'} onPress={() => router.replace('/home')} />
        </>
      }>
      <View className="flex-row justify-end">
        <SunButton />
      </View>
      {st.isLoading ? (
        <SkeletonCards n={1} kind="row" />
      ) : !r || !s?.delivery ? (
        <Alert tone="expired" title="This handoff isn't saved yet." body="Scan the resident's code to save it." actions={<Button label={t('run.scan')} size="sm" full={false} onPress={() => router.replace(key ? `/runner/scan?request=${key}` : '/runner/scan')} />} />
      ) : (
        <>
          <StampMoment />
          <Rise index={2} className="items-center">
            <Text variant="display" className="text-center" accessibilityLiveRegion="polite">
              {c.done.saved}
            </Text>
          </Rise>

          <Rise index={3} className="items-center gap-3 rounded-block border-2 border-edge bg-surface px-4 py-4">
            <Text className="text-[17px] font-bold">{fill(c.done.collectFrom, { name })}</Text>
            <View className="flex-row items-center gap-3">
              <Money value={r.maxPrice} size="xl" />
              <Text className="font-display text-[20px]">+</Text>
              <Money value={r.tip} size="md" unit={c.done.tip} />
            </View>
            <Text className="text-center text-[14px] leading-[19px] text-muted">{c.done.maxNote}</Text>
          </Rise>

          <Rise index={4} className="gap-3">
            {prefs.upi ? (
              <>
                {qr ? (
                  <View className="items-center gap-1">
                    <QrDisplay value={prefs.upi} size={180} label={`UPI QR for ${upiId(prefs.upi) ?? 'you'}`} />
                    <Text className="text-[14px] font-bold text-muted">
                      {upiId(prefs.upi)} · {c.done.qrStored}
                    </Text>
                  </View>
                ) : null}
                <Button label={qr ? c.done.hideQr : c.done.showQr} variant="secondary" size="lg" onPress={() => setQr(!qr)} />
              </>
            ) : (
              <Button label={c.done.addQr} variant="secondary" size="lg" onPress={() => setUpiSheet(true)} />
            )}
          </Rise>

          <Rise index={5} className="flex-row items-start gap-2.5">
            <Icon as={receipt ? Check : ReceiptText} size={18} className="mt-0.5 text-go" />
            <Text className="flex-1 text-[15px] leading-[21px] text-muted">{receipt ? fill(c.done.receiptIn, { name }) : fill(c.done.receiptLine, { name })}</Text>
            <Meter value={profile.data?.receiptsTotal ?? 0} unit={c.done.handoffsLabel} size="sm" tone={receipt ? 'money' : 'yellow'} />
          </Rise>
        </>
      )}
      <Sheet open={upiSheet} onClose={() => setUpiSheet(false)}>
        <UpiSetup />
      </Sheet>
    </Screen>
  );
}
