/**
 * B11 Report a problem: calm and serious, behind a confirm sheet. After a recorded handoff: wrong item,
 * rude, other. Without a handoff: "Runner didn't show up", only when verified no-show proof exists
 * (saved by the alert set when the runner accepted, re-checked against the records).
 */
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck, Phone, ShieldAlert } from 'lucide-react-native';
import type { Address, ComplaintReason, EntityKey } from '@bhaiya-please/core';
import { Alert, Button, ConfirmSheet, Icon, ListGroup, ListRow, OptionCard, SaveButton, Screen, SkeletonCards, Text } from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useNoShow, useRequestStatus } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { monthYear } from '@/lib/format';
import { findLog, logActivity, type RequestLog } from '@/lib/history';
import { fill, useCopy, useT } from '@/lib/i18n';
import { sawAccepted } from '@/lib/triggers';
import { residentCopy } from '@/screens/resident/copy';
import { useInvalidate, Rise } from '@/screens/resident/parts';

// 'no_show' needs verified no-show proof (no handoff), so it's offered on its own path above.
const REASONS: ComplaintReason[] = ['wrong_item', 'rude', 'other'];
const SIX_MONTHS = 180 * 86400;
const clock = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function Report() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const t = useT();
  const c = useCopy(residentCopy);
  const invalidate = useInvalidate();
  const { society, address } = useSession();
  const q = useRequestStatus(key);
  const s = q.data;
  const ns = useNoShow(key, !!s && !s.delivery);
  const proof = ns.data?.proof ?? null;
  const [reason, setReason] = useState<ComplaintReason | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<{ reason: ComplaintReason; at: number } | null>(null);
  const rider = s?.delivery?.rider ?? s?.accept?.rider ?? proof?.noshow.rider ?? (findLog(key) as RequestLog | undefined)?.runner ?? null;
  const name = aliasFor(rider);
  const noShowMode = !!s && !s.delivery;

  if ((!s && q.isLoading) || (noShowMode && ns.isLoading))
    return (
      <Screen title={t('report.cta')}>
        <SkeletonCards n={2} kind="row" />
      </Screen>
    );

  const filed = s?.complaint ?? ns.data?.complaint ?? null;
  const record = saved ?? (filed ? { reason: filed.reason, at: filed.createdAt } : null);
  if (record)
    return (
      <Screen title={c.report.saved} footer={<Button label={c.common.done} onPress={() => router.replace('/home')} />}>
        <Rise index={0}>
          <Text variant="display">{c.report.saved}</Text>
        </Rise>
        <Rise index={1}>
          <View className="flex-row overflow-hidden rounded-block border-2 border-line bg-surface">
            <View className="w-1.5 bg-mirchi" />
            <View className="flex-1 gap-1 px-4 py-3.5">
              <Text className="text-[17px] font-bold">{noShowMode && record.reason === 'no_show' ? c.report.noShow : c.report.reasons[record.reason]}</Text>
              <Text className="text-[14px] text-muted">{fill(c.report.until, { name, date: monthYear(record.at + SIX_MONTHS) })}</Text>
            </View>
          </View>
        </Rise>
        <Text className="text-[15px] leading-[21px] text-muted">{c.report.thanks}</Text>
      </Screen>
    );

  const safety = (
    <ListGroup title={c.report.serious}>
      <ListRow
        label={c.report.police}
        icon={ShieldAlert}
        tone="mirchi"
        onPress={() => void Linking.openURL('tel:112').catch(() => {})}
        right={
          <View className="flex-row items-center gap-2">
            <Text className="font-meter text-[18px] text-mirchi">112</Text>
            <Icon as={Phone} size={18} className="text-muted" />
          </View>
        }
        chevron={false}
      />
      <ListRow label={fill(c.report.security, { society: society.name })} hint={c.report.securityHint} last />
    </ListGroup>
  );
  const confirmSheet = (r: ComplaintReason | null, against: Address | null) => (
    <ConfirmSheet
      open={confirm}
      onClose={() => setConfirm(false)}
      title={c.report.confirmTitle}
      body={fill(c.report.confirmBody, { name })}
      confirm={
        <View className="flex-row gap-3 pt-1">
          <View className="flex-1">
            <Button label={c.report.goBack} variant="secondary" onPress={() => setConfirm(false)} />
          </View>
          <View className="flex-1">
            <SaveButton
              label={c.report.submit}
              variant="destructive"
              disabled={!r || !against}
              onSave={() => core.fileComplaint({ requestKey: key as EntityKey, rider: against!, reason: r! })}
              onDone={() => {
                setConfirm(false);
                setSaved({ reason: r!, at: Math.floor(Date.now() / 1000) });
                logActivity({ kind: 'request', key, outcome: 'reported' });
                appEvent('report.filed');
                void invalidate();
              }}
            />
          </View>
        </View>
      }
    />
  );

  if (!s?.delivery) {
    const helpBtn = <Button label={c.report.help} variant="secondary" size="md" onPress={() => router.push('/help?faq=noshow')} />;
    if (proof?.valid)
      return (
        <Screen title={t('report.cta')} footer={<Button label={c.report.submit} variant="destructive" onPress={() => setConfirm(true)} />}>
          <Text className="text-[15px] text-muted">{fill(c.report.noShowAbout, { name })}</Text>
          <Rise index={0}>
            <OptionCard title={c.report.noShow} selected onPress={() => undefined} />
          </Rise>
          <Rise index={1}>
            <View className="flex-row items-start gap-3 rounded-block border-2 border-go bg-surface px-4 py-3.5">
              <Icon as={BadgeCheck} size={22} className="mt-0.5 text-go" />
              <Text className="flex-1 text-[15px] leading-[21px]">{c.report.noShowVerified}</Text>
            </View>
          </Rise>
          <View className="flex-row overflow-hidden rounded-block border-2 border-line bg-surface">
            <View className="w-1.5 bg-mirchi" />
            <Text className="flex-1 px-4 py-3.5 text-[15px] leading-[21px]">{fill(c.report.noShowNext, { name })}</Text>
          </View>
          {safety}
          {confirmSheet('no_show', proof.noshow.rider)}
        </Screen>
      );
    if (proof)
      return (
        <Screen title={t('report.cta')}>
          <Alert tone="info" title={c.report.noShowInvalidTitle} body={c.report.noShowInvalidBody} actions={helpBtn} />
        </Screen>
      );
    if (sawAccepted(address, key) && !s?.accept)
      return (
        <Screen title={t('report.cta')}>
          <Alert tone="expired" title={c.report.noShowPendingTitle} body={fill(c.report.noShowPendingBody, { name })} actions={helpBtn} />
        </Screen>
      );
    return (
      <Screen title={t('report.cta')}>
        <Alert tone="info" title={c.report.onlyAfter} body={c.report.onlyAfterBody} actions={helpBtn} />
      </Screen>
    );
  }

  const delivery = s.delivery;
  return (
    <Screen title={t('report.cta')} footer={<Button label={c.report.submit} variant="destructive" disabled={!reason} onPress={() => setConfirm(true)} />}>
      <Text className="text-[15px] text-muted">{fill(c.report.about, { name, time: clock(delivery.createdAt) })}</Text>
      <View accessibilityRole="radiogroup" className="gap-2.5">
        {REASONS.map((r, i) => (
          <Rise key={r} index={i}>
            <OptionCard title={c.report.reasons[r]} selected={reason === r} onPress={() => setReason(r)} />
          </Rise>
        ))}
      </View>
      <View className="flex-row overflow-hidden rounded-block border-2 border-line bg-surface">
        <View className="w-1.5 bg-mirchi" />
        <Text className="flex-1 px-4 py-3.5 text-[15px] leading-[21px]">{fill(c.report.next, { name })}</Text>
      </View>
      {safety}
      {confirmSheet(reason, delivery.rider)}
    </Screen>
  );
}
