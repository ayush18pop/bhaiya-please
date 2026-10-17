/**
 * D6 Get verified: what it means, what to bring, where to go, and a big account QR for the desk.
 * Updates live: when a trusted desk vouches, the stamp thumps in, the plate flips New → Verified and
 * "सेटिंग हो गई!" appears with the new limits.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Attestation, TierName } from '@bhaiya-please/core';
import { Button, LEVEL_LIMITS, PlateFlip, Screen, SkeletonCards, Stamp, Text } from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useSession } from '@/components/providers';
import { useProfile } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { encodeAddressQR } from '@/lib/handoff';
import { haptic } from '@/lib/haptics';
import { fill, useCopy } from '@/lib/i18n';
import { C } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { Vouches, deskName, Rise } from '@/screens/shared/parts';

const RANK: Record<TierName, number> = { new: 0, verified: 1, trusted: 2 };

export default function Verify() {
  const router = useRouter();
  const { address, society } = useSession();
  const c = useCopy(sharedCopy).verify;
  const profile = useProfile(address);
  const p = profile.data;
  const first = useRef<TierName | null>(null);
  const seenVouches = useRef<Set<string> | null>(null);
  const [celebrate, setCelebrate] = useState<{ from: TierName; to: TierName; by: Attestation | null } | null>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!p || profile.isPlaceholderData) return;
    const trusted = p.attestations.filter((a) => a.trusted);
    if (first.current === null) {
      first.current = p.tier.name;
      seenVouches.current = new Set(trusted.map((a) => a.key));
      return;
    }
    const fresh = trusted.find((a) => !seenVouches.current!.has(a.key)) ?? null;
    if (RANK[p.tier.name] > RANK[first.current] && !celebrate) {
      setCelebrate({ from: first.current, to: p.tier.name, by: fresh });
      haptic.success();
      setTimeout(() => setFlipped(true), 450);
    }
  }, [p, profile.isPlaceholderData, celebrate]);

  if (!address) return null;
  if (celebrate) {
    const desk = deskName(celebrate.by?.creator);
    return (
      <Screen title={c.title} footer={<Button label={c.finish} onPress={() => router.replace('/home')} />}>
        <View className="items-center gap-5 pt-6">
          <Stamp ring={`VERIFIED BY ${desk.toUpperCase()} ·`} center={['ID', 'CHECKED']} color={C.go} size={170} animate={celebrate.to} />
          <PlateFlip from={celebrate.from} to={celebrate.to} flipped={flipped} />
          <Rise delay={500}>
            <Text variant="title" className="text-center text-[26px] leading-[30px]">
              {c.done}
            </Text>
          </Rise>
          <Text className="text-center text-[14px] text-muted">{fill(c.doneBody, { desk })}</Text>
        </View>
      </Screen>
    );
  }

  const already = p && p.tier.name !== 'new';
  return (
    <Screen title={c.title}>
      {!p ? (
        <SkeletonCards n={2} kind="row" />
      ) : (
        <>
          <Rise index={0}>
            <Text className="text-[16px] leading-[23px]">{already ? c.alreadyBody : c.intro}</Text>
          </Rise>
          {already ? (
            <Rise index={1}>
              <View className="gap-2">
                <Text className="text-[17px] font-bold">{c.already}</Text>
                <Text className="text-[14px] text-muted">{LEVEL_LIMITS[p.tier.name]}</Text>
              </View>
            </Rise>
          ) : null}
          <Rise index={2}>
            <View className="overflow-hidden rounded-block border-2 border-line">
              <View className="flex-row gap-3 border-b-2 border-line px-3.5 py-3">
                <Text className="w-[70px] text-[15px] font-extrabold">{c.bring}</Text>
                <Text className="flex-1 text-[15px] leading-[21px]">{c.bringBody}</Text>
              </View>
              <View className="flex-row gap-3 px-3.5 py-3">
                <Text className="w-[70px] text-[15px] font-extrabold">{c.goTo}</Text>
                <Text className="flex-1 text-[15px] leading-[21px]">{fill(c.goToBody, { society: society.name })}</Text>
              </View>
            </View>
          </Rise>
          <Rise index={3}>
            <View className="rounded-[14px] border-2 border-paper">
              <View className="items-center gap-2.5 rounded-block border-2 border-ink bg-white p-[18px]">
                <Text className="text-[16px] font-extrabold text-ink">{c.show}</Text>
                <QrDisplay value={encodeAddressQR(address)} size={200} label="Your account QR" />
                <Text className="text-[13px] font-bold text-ink">{fill(c.qrCaption, { name: aliasFor(address) })}</Text>
              </View>
            </View>
          </Rise>
          <Text className="text-center text-[14px] text-muted">{c.live}</Text>
          {already && p.attestations.length ? <Vouches list={p.attestations} /> : null}
        </>
      )}
    </Screen>
  );
}

