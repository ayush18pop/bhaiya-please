/**
 * E2 Check and vouch: who you're vouching for (level, handoffs, reports, existing vouches), the vouch
 * type, validity, and Vouch (saving / saved). Success thumps a VERIFIED BY … stamp onto the runner's
 * card. Already vouched by this desk → shows it with Remove.
 */
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { AttestationLevel } from '@bhaiya-please/core';
import {
  Alert, Avatar, Button, ConfirmSheet, LevelPlate, OptionCard, Poster, SaveButton, Screen, Skeleton, Stamp, Text, toast,
} from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useMyIssued, useProfile } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { monthYear } from '@/lib/format';
import { fill, useCopy } from '@/lib/i18n';
import { C, cn } from '@/lib/utils';
import { deskCopy } from '@/screens/desk/copy';
import { recordCheck } from '@/screens/desk/recent';
import { sharedCopy } from '@/screens/shared/copy';
import { StatTile, deskName, isAddress, shortDate, Rise } from '@/screens/shared/parts';

const SIX_MONTHS = 180 * 86400;

export default function CheckAndVouch() {
  const { addr } = useLocalSearchParams<{ addr: string }>();
  const router = useRouter();
  const c = useCopy(deskCopy);
  const s = useCopy(sharedCopy).system;
  if (!isAddress(addr)) {
    return (
      <Screen title={c.checkTitle}>
        <Poster kicker={s.kicker} title={c.invalidAddr} action={{ label: c.next, onPress: () => router.replace('/home') }} />
      </Screen>
    );
  }
  return <Check subject={addr.toLowerCase() as `0x${string}`} />;
}

function Check({ subject }: { subject: `0x${string}` }) {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const { address, mode, society } = useSession();
  const c = useCopy(deskCopy);
  const now = useNow();
  const profile = useProfile(subject);
  const issued = useMyIssued();
  const [level, setLevel] = useState<AttestationLevel>('id_checked');
  const [saved, setSaved] = useState<{ level: AttestationLevel; at: number; wasNew: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);
  const p = profile.data;
  const name = aliasFor(subject);
  const desk = fill(c.desk, { society: society.name });
  const mine = (issued.data ?? []).find((a) => a.subject === subject && a.expiresAt > now);
  const type = (l: AttestationLevel) => (l === 'resident' ? c.resident : c.idChecked);

  useEffect(() => {
    if (address) recordCheck(address, { addr: subject, at: Math.floor(Date.now() / 1000), outcome: 'looked' });
  }, [address, subject]);

  const blocked = mode !== 'desk' ? c.notDesk : subject === address ? c.self : null;

  const card = (
    <View className="rounded-[14px] border-2 border-paper">
      <View className="min-h-[300px] gap-4 overflow-hidden rounded-block border-2 border-ink bg-paper p-5">
        <View className="flex-row items-center gap-4">
          <View className="h-20 w-20 items-center justify-end overflow-hidden rounded-pill border-3 border-ink bg-white">
            <Avatar seed={subject} size={74} ring="none" />
          </View>
          <View className="flex-1 gap-2">
            <Text numberOfLines={2} className="font-display text-[24px] leading-[26px] text-ink">
              {name.toUpperCase()}
            </Text>
            {p ? <LevelPlate level={p.tier.name} size="md" /> : <Skeleton className="h-6 w-24 bg-ink/20" />}
          </View>
        </View>
        {p ? (
          <View className="flex-row gap-2.5">
            <StatTile value={p.receiptsTotal} label={c.handoffs} onPaper />
            <StatTile value={p.distinctResidents} label={c.residents} onPaper />
            <StatTile value={p.complaints30d} label={c.reports} tone={p.complaints30d ? 'mirchi' : 'yellow'} onPaper />
          </View>
        ) : (
          <Skeleton className="h-16 bg-ink/20" />
        )}
        <View className="gap-1">
          <Text className="text-[15px] font-extrabold text-ink">{c.existing}</Text>
          {p && p.attestations.length ? (
            p.attestations.map((a) => (
              <Text key={a.key} className="text-[15px] text-ink">
                {a.creator === address ? fill(c.byYou, { type: type(a.level as AttestationLevel), date: shortDate(a.createdAt) }) : fill(c.byOther, { type: type(a.level as AttestationLevel), desk: deskName(a.creator), month: monthYear(a.expiresAt) })}
              </Text>
            ))
          ) : (
            <Text className="text-[15px] text-ink">{p ? c.noneYet : ''}</Text>
          )}
        </View>
        {saved ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: 14, bottom: 14 }}>
            <Stamp ring={`VERIFIED BY ${desk.toUpperCase()} ·`} center={saved.level === 'resident' ? ['LIVES', 'HERE'] : ['ID', 'CHECKED']} color={C.cng} size={wide ? 190 : 150} rotate={-10} animate={saved.at} />
          </View>
        ) : null}
      </View>
    </View>
  );

  const until = monthYear((saved?.at ?? now) + SIX_MONTHS);
  const actions = blocked ? (
    <Alert tone="info" title={blocked} />
  ) : saved ? (
    <View className="gap-2.5">
      <View accessibilityRole="alert" className="gap-1.5 rounded-block border-2 border-go bg-surface p-3.5">
        <Text className="text-[17px] font-extrabold text-go">{saved.wasNew ? fill(c.savedTitle, { name }) : fill(c.savedSame, { desk, month: until })}</Text>
        {saved.wasNew ? <Text className="text-[14px] text-muted">{fill(c.savedBody, { desk, month: until })}</Text> : null}
      </View>
      <Button label={c.next} variant="secondary" onPress={() => router.replace('/home')} />
    </View>
  ) : mine ? (
    <View className="gap-3">
      <View className="gap-1 rounded-block border-2 border-go bg-surface p-3.5">
        <Text className="text-[17px] font-extrabold">{fill(c.alreadyTitle, { name })}</Text>
        <Text className="text-[14px] text-muted">{fill(c.alreadyBody, { type: type(mine.level as AttestationLevel), date: shortDate(mine.createdAt), month: monthYear(mine.expiresAt) })}</Text>
      </View>
      <Button label={c.remove} variant="destructive" onPress={() => setRemoving(true)} />
      <Button label={c.next} variant="secondary" onPress={() => router.replace('/home')} />
    </View>
  ) : (
    <SaveButton
      label={fill(c.vouch, { name })}
      size="xl"
      disabled={!p}
      onSave={() => core.issueAttestation({ subject, level })}
      onDone={() => {
        const wasNew = p?.tier.name === 'new';
        appEvent('vouch.issued');
        if (address) recordCheck(address, { addr: subject, at: Math.floor(Date.now() / 1000), outcome: 'vouched', level: level as 'id_checked' | 'resident' });
        setSaved({ level, at: Math.floor(Date.now() / 1000), wasNew });
        void qc.invalidateQueries();
      }}
    />
  );

  const form = (
    <View className="flex-1 gap-4">
      {!saved && !mine && !blocked ? (
        <>
          <Text className="text-[19px] font-extrabold">{c.question}</Text>
          <View accessibilityRole="radiogroup" className={cn('gap-3', wide && 'flex-row')}>
            <View className={cn(wide && 'flex-1')}>
              <OptionCard title={c.idChecked} body={c.idCheckedLine} selected={level === 'id_checked'} onPress={() => setLevel('id_checked')} className="min-h-[96px]" />
            </View>
            <View className={cn(wide && 'flex-1')}>
              <OptionCard title={c.resident} body={fill(c.residentLine, { society: society.name })} selected={level === 'resident'} onPress={() => setLevel('resident')} className="min-h-[96px]" />
            </View>
          </View>
          <Text className="text-[15px] text-muted">{c.validity}</Text>
        </>
      ) : null}
      <View className={cn(wide && 'mt-auto')}>{actions}</View>
    </View>
  );

  return (
    <Screen title={c.checkTitle} contentClassName={wide ? 'p-7' : undefined}>
      <View className={cn(wide ? 'flex-row gap-7' : 'gap-5')}>
        <Rise index={0} className={wide ? 'flex-1' : undefined}>
          {card}
        </Rise>
        <Rise index={1} className={wide ? 'flex-1' : undefined}>
          {form}
        </Rise>
      </View>
      <ConfirmSheet
        open={removing}
        onClose={() => setRemoving(false)}
        title={fill(c.removeTitle, { name })}
        body={fill(c.removeBody, { name })}
        confirm={
          mine ? (
            <View className="flex-row gap-3 pt-1">
              <View className="flex-1">
                <Button label={c.keep} variant="secondary" onPress={() => setRemoving(false)} />
              </View>
              <View className="flex-1">
                <SaveButton
                  label={c.remove}
                  variant="destructive"
                  onSave={() => core.revokeAttestation(mine.key)}
                  onDone={() => {
                    if (address) recordCheck(address, { addr: subject, at: Math.floor(Date.now() / 1000), outcome: 'removed' });
                    toast.success(c.removedToast);
                    setRemoving(false);
                    void qc.invalidateQueries();
                  }}
                />
              </View>
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}
