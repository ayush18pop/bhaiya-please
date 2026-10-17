/**
 * D9 Back up and move phones. Hold 1 s to show the recovery key (text + QR); it hides itself after
 * 30 s. A checklist marks the account as backed up (clears the Profile warning dot). Moving phones
 * means restoring with the key; a leaked key can move every receipt to a fresh account.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, EyeOff, Lock } from 'lucide-react-native';
import type { Address } from '@bhaiya-please/core';
import {
  Animated, Button, CheckRow, ConfirmSheet, Field, Icon, ListGroup, Meter, SaveButton, Screen, Sheet, Text, TextButton, toast,
  useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useCore, useSession } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { copyText } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { fill, useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { parseAddressInput } from '@/screens/shared/parts';

const SHOW_FOR = 30;

/** Press and hold for 1 s; a yellow fill sweeps across while holding. */
function HoldToReveal({ label, onReveal }: { label: string; onReveal: () => void }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const [w, setW] = useState(0);
  const fillStyle = useAnimatedStyle(() => ({ width: p.value * w }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Press and hold for one second"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPressIn={() => {
        haptic.tap();
        p.value = withTiming(1, { duration: reduce ? 0 : 1000 });
      }}
      onPressOut={() => {
        p.value = withTiming(0, { duration: 150 });
      }}
      onLongPress={() => {
        haptic.success();
        onReveal();
      }}
      delayLongPress={1000}
      className="h-16 flex-row items-center justify-center gap-2.5 overflow-hidden rounded-block border-3 border-ink bg-yellow">
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0 }, fillStyle]} className="bg-go" />
      <Icon as={Lock} size={22} className="text-ink" />
      <Text className="font-display text-[17px] text-ink">{label}</Text>
    </Pressable>
  );
}

function MoveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useCopy(sharedCopy).backup;
  const core = useCore();
  const qc = useQueryClient();
  const { address } = useSession();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [to, setTo] = useState<Address | null>(null);
  const next = () => {
    const a = parseAddressInput(text);
    if (!a) return setErr(c.moveInvalid);
    if (a === address) return setErr(c.moveSelf);
    setTo(a);
  };
  const close = () => {
    setTo(null);
    setText('');
    setErr(null);
    onClose();
  };
  return (
    <>
      <Sheet open={open && !to} onClose={close} title={c.moveSheet}>
        <Text className="text-[15px] leading-[21px] text-muted">{c.moveSheetBody}</Text>
        <Field label={c.moveField} value={text} onChangeText={(v) => (setText(v), setErr(null))} placeholder="https://…/p/0x…" autoCapitalize="none" autoCorrect={false} error={err} />
        <Button label={c.moveNext} onPress={next} disabled={!text.trim()} />
      </Sheet>
      <ConfirmSheet
        open={open && !!to}
        onClose={close}
        title={fill(c.moveConfirm, { name: to ? aliasFor(to) : '' })}
        body={c.moveConfirmBody}
        confirm={
          <View className="gap-2.5 pt-1">
            <SaveButton
              label={c.moveSave}
              variant="destructive"
              onSave={() => core.transferAllReceipts(to!)}
              onDone={() => {
                void qc.invalidateQueries();
                toast.success(c.moved);
                close();
              }}
            />
            <Button label="Go back" variant="secondary" onPress={() => setTo(null)} />
          </View>
        }
      />
    </>
  );
}

export default function Backup() {
  const router = useRouter();
  const c = useCopy(sharedCopy).backup;
  const { wallet, address, prefs, setPrefs, guest } = useSession();
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [left, setLeft] = useState(SHOW_FOR);
  const [checks, setChecks] = useState<[boolean, boolean]>([false, false]);
  const [moving, setMoving] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const already = !!(address && prefs.backedUp[address]);

  useEffect(() => {
    if (shownAt === null) return;
    setLeft(SHOW_FOR);
    timer.current = setInterval(() => {
      const l = SHOW_FOR - Math.floor((Date.now() - shownAt) / 1000);
      if (l <= 0) {
        setShownAt(null);
        if (timer.current) clearInterval(timer.current);
      } else setLeft(l);
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [shownAt]);

  if (guest || !wallet) {
    return (
      <Screen title={c.title}>
        <Text className="text-[16px] leading-[23px]">{c.guest}</Text>
        <Button label="Get started" onPress={() => router.push('/welcome/use')} />
      </Screen>
    );
  }

  const ok = checks[0] || checks[1] || already;
  const finish = () => {
    if (ok && address && !already) {
      setPrefs((p) => ({ backedUp: { ...p.backedUp, [address]: true } }));
      haptic.success();
    }
    router.canGoBack() ? router.back() : router.replace('/profile');
  };

  return (
    <Screen title={c.title} footer={<Button label={ok ? c.done : c.later} variant={ok ? 'go' : 'secondary'} onPress={finish} />}>
      <View>
        <Text className="text-[16px] leading-[23px]">{c.why}</Text>
      </View>
      <View>
        {shownAt === null ? (
          <View className="gap-2">
            <HoldToReveal label={c.hold} onReveal={() => setShownAt(Date.now())} />
            <Text className="text-center text-[14px] text-muted">{c.holdHint}</Text>
          </View>
        ) : (
          <View className="rounded-[14px] border-2 border-paper">
            <View className="gap-3 rounded-block border-2 border-ink bg-paper p-3.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[15px] font-extrabold text-ink">{c.key}</Text>
                <View accessibilityRole="timer" accessibilityLabel={fill(c.hides, { n: left })}>
                  <Meter value={String(left).padStart(2, '0')} unit="s" size="sm" tone={left <= 5 ? 'urgent' : 'yellow'} border="ink" />
                </View>
              </View>
              <Text selectable className="text-[16px] font-extrabold leading-[24px] tracking-[1px] text-ink" style={{ fontFamily: 'monospace' }}>
                {wallet.privateKey}
              </Text>
              <View className="items-center">
                <QrDisplay value={wallet.privateKey} size={170} label="Recovery key QR" />
              </View>
              <View className="flex-row overflow-hidden rounded-plate border-2 border-mirchi">
                <View className="w-1.5 bg-mirchi" />
                <Text className="flex-1 px-2.5 py-2 text-[13px] font-bold text-ink">{c.warn}</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button label={c.copy} variant="paper" size="sm" icon={Copy} onPress={() => copyText(wallet.privateKey, c.copied)} />
                <Button label={c.hide} variant="paper" size="sm" icon={EyeOff} onPress={() => setShownAt(null)} />
              </View>
            </View>
          </View>
        )}
      </View>
      <View>
        <ListGroup>
          <CheckRow label={c.check1} checked={checks[0] || (already && !checks[1])} onToggle={() => setChecks(([a, b]) => [!a, b])} />
          <CheckRow label={c.check2} checked={checks[1]} onToggle={() => setChecks(([a, b]) => [a, !b])} last />
        </ListGroup>
      </View>
      <View>
        <View className={cn('gap-2 rounded-block border-2 border-line bg-surface p-3.5')}>
          <Text className="text-[16px] font-extrabold">{c.moveTitle}</Text>
          <Text className="text-[14px] leading-[20px] text-muted">{c.moveBody}</Text>
          <TextButton label={c.moveCta} tone="yellow" onPress={() => setMoving(true)} />
        </View>
      </View>
      <MoveSheet open={moving} onClose={() => setMoving(false)} />
    </Screen>
  );
}
