/** D4 Someone else's profile: the same public parts as D3, no shortcuts, plus how it's calculated. */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Button, Poster, SkeletonCards } from '@/components/bp';
import { useProfile, useReceipts } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { useCopy } from '@/lib/i18n';
import { sharedCopy } from '@/screens/shared/copy';
import { CalculatedLine, Compliments, CrowdPanel, ProfileHeader, RecentReceipts, Reports, StatsRow, Vouches, isAddress, Rise } from '@/screens/shared/parts';

export default function OtherProfile() {
  const { addr } = useLocalSearchParams<{ addr: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sharedCopy);
  const address = isAddress(addr) ? (addr.toLowerCase() as `0x${string}`) : null;
  if (!address) {
    return (
      <View className="flex-1 bg-bg p-4" style={{ paddingTop: insets.top + 16 }}>
        <Poster kicker={c.system.kicker} title={c.profile.invalidTitle} body={c.profile.invalidBody} action={{ label: c.system.goHome, onPress: () => router.replace('/home') }} />
      </View>
    );
  }
  return <PublicProfile address={address} />;
}

function PublicProfile({ address }: { address: `0x${string}` }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sharedCopy).profile;
  const now = useNow();
  const profile = useProfile(address);
  const receipts = useReceipts(address);
  const p = profile.data;
  const crowd = useMemo(() => [...new Set((receipts.data ?? []).filter((r) => r.valid).map((r) => r.receipt.creator))], [receipts.data]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ paddingTop: insets.top }} className="bg-yellow">
        <ProfileHeader address={address} profile={p} onBack={back} compact crowd={p && p.receiptsTotal > 0 ? <CrowdPanel seeds={crowd} own={false} /> : null} />
      </View>
      <View className="gap-[18px] px-4 pb-8 pt-[18px]">
        {profile.isError && !p ? (
          <Alert title={c.loadFailed} actions={<Button label={c.retry} variant="secondary" size="sm" full={false} onPress={() => profile.refetch()} />} />
        ) : !p ? (
          <SkeletonCards n={2} kind="row" />
        ) : (
          <>
            <Rise index={0}>
              <StatsRow profile={p} third="reports" />
            </Rise>
            <Rise index={1}>
              <Compliments profile={p} title={false} />
            </Rise>
            <Rise index={2}>
              <Vouches list={p.attestations} />
            </Rise>
            <Rise index={3}>
              <Reports list={p.complaints} now={now} />
            </Rise>
            <Rise index={4}>{receipts.data ? <RecentReceipts list={receipts.data} own={false} /> : <SkeletonCards n={1} kind="row" />}</Rise>
          </>
        )}
        <CalculatedLine />
      </View>
    </ScrollView>
  );
}
