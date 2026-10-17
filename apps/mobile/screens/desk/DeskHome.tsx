/**
 * E1 Desk home (Home tab in Society desk mode). Verify a runner in under a minute: scan their account
 * QR (from D6) or paste a profile link → E2. Shows active vouches and this device's recent checks.
 * Two columns from 768px (desk tablets / laptops), single column on phones.
 */
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, ClipboardPaste, ShieldCheck } from 'lucide-react-native';
import { Avatar, Button, Field, Icon, Meter, Peep, Skeleton, Text, TextButton } from '@/components/bp';
import { QrScanner, type ScanFrame } from '@/components/QrScanner';
import { useSession } from '@/components/providers';
import { HomeHeader } from '@/components/shell/HomeHeader';
import { useMyIssued } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { pasteText } from '@/lib/clipboard';
import { ago } from '@/lib/format';
import { fill, useCopy } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { parseAddressInput, Rise } from '@/screens/shared/parts';
import { deskCopy } from './copy';
import { useRecentChecks } from './recent';

export default function DeskHome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { address, society } = useSession();
  const c = useCopy(deskCopy);
  const now = useNow();
  const issued = useMyIssued();
  const recent = useRecentChecks(address);
  const [link, setLink] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrame>('searching');
  const going = useRef(false);

  const open = (addr: string) => {
    if (going.current) return;
    going.current = true;
    setTimeout(() => (going.current = false), 1500);
    router.push(`/desk/check/${addr}`);
  };
  const onScan = (text: string) => {
    const a = parseAddressInput(text);
    if (!a) {
      setFrame('wrong');
      setTimeout(() => setFrame('searching'), 1600);
      return;
    }
    setFrame('detected');
    setTimeout(() => {
      setFrame('searching');
      open(a);
    }, 350);
  };
  const submit = (text = link) => {
    const a = parseAddressInput(text);
    if (!a) return setErr(c.invalid);
    setErr(null);
    setLink('');
    open(a);
  };

  const active = (issued.data ?? []).filter((a) => a.expiresAt > now);
  const monthEnd = new Date(now * 1000);
  const endOfMonth = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1).getTime() / 1000;
  const expiring = active.filter((a) => a.expiresAt < endOfMonth).length;

  const scan = (
    <View className="gap-4">
      <Text variant="title" className={cn(wide ? 'text-[30px] leading-[32px]' : 'text-[24px] leading-[28px]')}>
        {c.scanTitle}
      </Text>
      <QrScanner onResult={onScan} state={frame} pill={frame === 'wrong' ? c.scanWrong : c.scanPill} height={wide ? 330 : 300} />
      <View className="gap-1.5">
        <View className="flex-row items-end gap-2.5">
          <View className="flex-1">
            <Field
              label={c.pasteLabel}
              value={link}
              onChangeText={(v) => (setLink(v), setErr(null))}
              placeholder={c.pastePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => submit()}
              returnKeyType="go"
              error={null}
            />
          </View>
          <Button label={c.open} size="md" full={false} onPress={() => submit()} disabled={!link.trim()} className="min-h-[52px]" wrapClassName="self-end" />
        </View>
        {err ? (
          <Text accessibilityRole="alert" className="text-[14px] text-mirchi">
            {err}
          </Text>
        ) : null}
        <TextButton label={c.paste} icon={ClipboardPaste} onPress={async () => submit(await pasteText())} />
      </View>
    </View>
  );

  const side = (
    <View className="gap-4">
      <View className="flex-row items-center gap-3.5 rounded-block border-2 border-line bg-surface p-4">
        {issued.data ? <Meter value={active.length} tone="money" size="lg" label={`${active.length} active vouches`} /> : <Skeleton className="h-14 w-20" />}
        <View className="flex-1">
          <Text className="text-[17px] font-extrabold">{c.active}</Text>
          <Text className="text-[14px] text-muted">{expiring ? fill(c.expiring, { n: expiring }) : c.noneExpiring}</Text>
        </View>
      </View>
      <Text className="text-[17px] font-extrabold">{c.recent}</Text>
      {recent.length ? (
        <View className="overflow-hidden rounded-block border-2 border-line">
          {recent.slice(0, 6).map((r, i) => (
            <Rise key={r.addr} index={i}>
              <Pressable onPress={() => open(r.addr)} accessibilityRole="link" className={cn('min-h-[60px] flex-row items-center gap-3 px-3.5 py-2 active:bg-raised', i > 0 && 'border-t-2 border-line')}>
                <Avatar seed={r.addr} size={40} ring="none" />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold">{aliasFor(r.addr)}</Text>
                  <Text className="text-[13px] text-muted">{`${r.outcome === 'vouched' ? (r.level === 'resident' ? c.resident : c.idChecked) : r.outcome === 'removed' ? c.removed : c.looked} · ${ago(r.at, now)}`}</Text>
                </View>
                <Icon as={ChevronRight} size={20} className="text-muted" />
              </Pressable>
            </Rise>
          ))}
        </View>
      ) : (
        <Text className="text-[15px] leading-[21px] text-muted">{c.noRecent}</Text>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-bg">
      <HomeHeader title={fill(c.desk, { society: society.name })} />
      <View accessibilityRole="text" className={cn('flex-row items-center gap-3 border-b-2 border-line bg-raised py-3', wide ? 'px-7' : 'px-4')}>
        <Icon as={ShieldCheck} size={22} className="text-yellow" />
        <Text className="flex-1 text-[15px] font-bold leading-[20px]">{c.reminder}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className={cn('flex-1', wide ? 'flex-row gap-7 p-7' : 'gap-6 p-4 pb-10')}>
          <Rise index={0} className={wide ? 'flex-[3]' : undefined}>
            {scan}
          </Rise>
          <Rise index={1} className={cn(wide && 'flex-[2]')}>
            {side}
            <View aria-hidden pointerEvents="none" className={cn('items-end', wide ? 'mt-6' : 'mt-2')}>
              <Peep seed="guard-2" size={wide ? 150 : 110} tone="night" />
            </View>
          </Rise>
        </View>
      </ScrollView>
    </View>
  );
}
