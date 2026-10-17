/** B2 Runner sheet: "Do I trust this person with ₹300?" before asking. */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReceiptTag } from '@bhaiya-please/core';
import { Alert, Avatar, Button, CountChip, LevelPlate, Meter, Skeleton, StatusPlate, tagLabel, Text, TextButton } from '@/components/bp';
import { MapView } from '@/components/map/MapView';
import { useSession } from '@/components/providers';
import { usePings, useProfile, useRun } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { rupees } from '@/lib/format';
import { fill, useCopy, useT } from '@/lib/i18n';
import { runnerPin } from '@/lib/mapModel';
import { placeName } from '@/lib/societies';
import { residentCopy } from '@/screens/resident/copy';
import { InfoRows, levelMeaning, minsTo, SheetScreen, StatTile, useGuestGate, Rise } from '@/screens/resident/parts';

export default function RunnerSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const t = useT();
  const c = useCopy(residentCopy);
  const now = useNow();
  const { society } = useSession();
  const { guard, sheet } = useGuestGate();
  const run = useRun(key);
  const r = run.data;
  const profile = useProfile(r?.creator);
  const pings = usePings(r ? [r.key] : []);
  const p = profile.data;
  const name = r ? aliasFor(r.creator) : '';
  const level = p?.tier.name ?? null;
  const missing = !run.isLoading && !r;
  const full = !!r && r.capacityLeft <= 0;
  const ended = missing || (!!r && now >= r.expiresAt);
  const atGate = !!r && !ended && (now >= r.eta || !!r.atGateAt);
  const closed = full || ended || atGate;
  const mins = r ? minsTo(r.eta, now) : 0;
  const pin = r ? runnerPin(r, pings.data?.[0], now, { tier: level, focused: true }) : null;

  const top = p
    ? (Object.entries(p.tagCounts) as [ReceiptTag, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    : [];

  const backdrop = (
    <MapView
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      society={{ pos: society.gate, label: fill(c.home.gate, { society: society.name }) }}
      runners={pin ? [pin] : []}
      routes={pin ? [{ id: pin.id, from: { runner: pin.id }, to: society.gate, tone: 'primary' }] : []}
      fit={[society.gate, ...(pin ? [pin.pos] : [])]}
      fitKey={`${key}:${pin ? 1 : 0}`}
      padding={{ top: 24, bottom: 520, left: 48, right: 48 }}
    />
  );

  const banner = full ? fill(c.runner.fullBanner, { name }) : atGate ? fill(c.runner.atGateBanner, { name }) : fill(c.runner.endedBanner, { name });

  const footer = closed ? (
    <>
      <Alert tone="expired" title={missing ? c.runner.missing : banner} body={missing ? c.runner.missingBody : undefined} />
      <Button label={c.common.seeOtherRuns} onPress={() => router.replace('/home')} />
    </>
  ) : (
    <Button label={fill(t('request.cta.askRunner'), { name })} disabled={!r} onPress={guard(() => router.push(`/run/${key}/shops`))} />
  );

  return (
    <SheetScreen backdrop={backdrop} footer={footer}>
      {!r || !p ? (
        missing ? (
          <Text variant="title">{c.runner.missing}</Text>
        ) : (
          <View className="gap-3" aria-busy>
            <View className="flex-row items-center gap-4">
              <Skeleton className="h-[86px] w-[86px] rounded-pill" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-10 w-2/3" />
              </View>
            </View>
            <Skeleton className="h-20 rounded-block" />
            <Skeleton className="h-48 rounded-block" />
          </View>
        )
      ) : (
        <>
          <Rise index={0}>
            <View className="flex-row items-center gap-4 pr-10">
              <Avatar seed={r.creator} size={86} ring="paper" />
              <View className="flex-1 gap-2">
                <Text variant="title" numberOfLines={1}>
                  {name}
                </Text>
                <View className="flex-row items-center gap-2">
                  <LevelPlate level={p.tier.name} size="lg" />
                  {full ? <StatusPlate kind="full" /> : null}
                </View>
              </View>
            </View>
          </Rise>
          <Rise index={1}>
            <Text className="text-[15px] leading-[21px] text-muted">{levelMeaning(p.tier.name, society.name, p.receiptsTotal, c)}</Text>
          </Rise>
          <Rise index={2} className="flex-row gap-3">
            <StatTile value={p.receiptsTotal} label={c.runner.handoffs} />
            <StatTile value={p.distinctResidents} label={c.runner.residents} />
          </Rise>
          {top.length ? (
            <Rise index={3} className="flex-row flex-wrap gap-2">
              {top.map(([tag, n]) => (
                <CountChip key={tag} label={tagLabel(tag)} count={n} />
              ))}
            </Rise>
          ) : null}
          <Rise index={4}>
            <InfoRows
              rows={[
                {
                  k: c.runner.arrivingIn,
                  v: atGate || ended ? t('status.atGate') : <Meter value={mins} unit={c.common.min} size="sm" border="line" className="border-0 bg-transparent px-0 py-0" label={`${mins} min`} />,
                },
                { k: c.runner.comingFrom, v: placeName(r.fromZone) },
                { k: c.runner.slotsLeft, v: full ? c.runner.full : String(r.capacityLeft) },
                { k: c.runner.cap, v: rupees(p.tier.priceCap) },
                { k: c.runner.reports, v: p.complaints30d ? String(p.complaints30d) : c.runner.none },
              ]}
            />
          </Rise>
          <TextButton label={c.runner.viewProfile} onPress={() => router.push(`/p/${r.creator}`)} />
        </>
      )}
      {sheet}
    </SheetScreen>
  );
}
