/**
 * D3 My profile (Profile tab). Run errands: the runner's reputation, which they own (loud yellow header,
 * "your crowd", stats, compliments, vouches, reports, receipts, level progress). Get things: the account
 * hub (reputation blocks only once there is something to show). Society desk: desk identity.
 */
import { useMemo, useState } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Bell, ChevronRight, HelpCircle, Link2, QrCode, Settings as SettingsIcon, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert, Button, Icon, ListGroup, ListRow, Poster, Sheet, SkeletonCards, Sink, Text,
} from '@/components/bp';
import { QrDisplay } from '@/components/QrDisplay';
import { useSession } from '@/components/providers';
import { useMyIssued, useProfile, useReceipts } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { copyText } from '@/lib/clipboard';
import { REAL_APP_URL } from '@/lib/core';
import { encodeAddressQR } from '@/lib/handoff';
import { fill, useCopy } from '@/lib/i18n';
import { sharedCopy } from './copy';
import { Compliments, CrowdPanel, LevelProgress, ProfileHeader, RecentReceipts, Reports, StatsRow, Vouches, Rise } from './parts';

export const profileLink = (address: string) => `${REAL_APP_URL}/p/${address}`;

export function ShareProfileSheet({ open, onClose, address }: { open: boolean; onClose: () => void; address: string }) {
  const c = useCopy(sharedCopy).profile;
  const link = profileLink(address);
  const share = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !('share' in navigator)) return copyText(link, 'Link copied');
      await Share.share({ message: fill(c.shareMsg, { link }), url: link });
    } catch {
      copyText(link, 'Link copied');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={c.shareTitle} scroll>
      <Text className="text-[15px] leading-[21px] text-muted">{c.shareBody}</Text>
      <View className="items-center py-1">
        <QrDisplay value={encodeAddressQR(address as never)} size={200} label={`${aliasFor(address)} profile QR`} caption={aliasFor(address)} />
      </View>
      <View className="rounded-block border-2 border-line bg-surface px-3.5 py-3">
        <Text numberOfLines={2} selectable className="text-[14px] text-muted">
          {link}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={c.copyLink} variant="secondary" icon={Link2} onPress={() => copyText(link, 'Link copied')} />
        </View>
        <View className="flex-1">
          <Button label={c.shareLink} icon={Share2} onPress={share} />
        </View>
      </View>
    </Sheet>
  );
}

function GuestProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCopy(sharedCopy).profile;
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16 }}>
      <Poster title={c.guestTitle} body={c.guestBody} action={{ label: c.getStarted, onPress: () => router.push('/welcome/use') }} minHeight={560} />
    </ScrollView>
  );
}

export default function MyProfile() {
  const { guest } = useSession();
  if (guest) return <GuestProfile />;
  return <OwnProfile />;
}

function OwnProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { address, mode, prefs, setMode } = useSession();
  const c = useCopy(sharedCopy).profile;
  const now = useNow();
  const profile = useProfile(address);
  const receipts = useReceipts(address);
  const issued = useMyIssued();
  const [sharing, setSharing] = useState(false);
  const p = profile.data;
  const valid = useMemo(() => (receipts.data ?? []).filter((r) => r.valid), [receipts.data]);
  const crowd = useMemo(() => [...new Set(valid.map((r) => r.receipt.creator))], [valid]);
  const backedUp = !!(address && prefs.backedUp[address]);
  const hasRep = !!p && (p.receiptsTotal > 0 || p.attestations.length > 0 || p.complaints.length > 0);
  const showRep = mode === 'run' || hasRep;
  const activeVouches = (issued.data ?? []).filter((a) => a.expiresAt > now).length;
  if (!address) return null;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ paddingTop: insets.top }} className="bg-yellow">
          <ProfileHeader
            address={address}
            profile={p}
            onSettings={() => router.push('/settings')}
            crowd={showRep && mode !== 'desk' ? <CrowdPanel seeds={crowd} own /> : null}
          />
        </View>
        <View className="gap-[22px] px-4 pb-8 pt-5">
          {profile.isError && !p ? (
            <Alert title={c.loadFailed} actions={<Button label={c.retry} variant="secondary" size="sm" full={false} onPress={() => profile.refetch()} />} />
          ) : !p ? (
            <SkeletonCards n={2} kind="row" />
          ) : (
            <>
              {mode === 'desk' ? (
                <Rise index={0}>
                  <ListGroup>
                    <ListRow icon={BadgeCheck} label={fill(c.deskLine, { n: activeVouches, es: activeVouches === 1 ? '' : 'es' })} hint={c.deskHint} onPress={() => router.push('/activity')} last />
                  </ListGroup>
                </Rise>
              ) : null}
              {showRep ? (
                <>
                  <Rise index={1}>
                    <StatsRow profile={p} third="last30" />
                  </Rise>
                  <Rise index={2}>
                    <Compliments profile={p} />
                  </Rise>
                  <Rise index={3}>
                    <Vouches list={p.attestations} />
                  </Rise>
                  <Rise index={4}>
                    <Reports list={p.complaints} now={now} />
                  </Rise>
                  <Rise index={5}>{receipts.data ? <RecentReceipts list={receipts.data} own /> : <SkeletonCards n={1} kind="row" />}</Rise>
                  <Rise index={6}>
                    <LevelProgress profile={p} />
                  </Rise>
                </>
              ) : mode === 'get' ? (
                <Rise index={1}>
                  <View className="gap-3 rounded-block border-2 border-dashed border-line px-4 py-4">
                    <Text className="text-[15px] leading-[21px] text-muted">{c.reputationEmpty}</Text>
                    <Button label={c.startRun} variant="secondary" size="sm" full={false} onPress={() => setMode('run')} />
                  </View>
                </Rise>
              ) : null}
            </>
          )}

          <Rise index={7} className="gap-2.5">
            <Button label={c.share} variant="secondary" icon={QrCode} onPress={() => setSharing(true)} />
            {!backedUp ? (
              <Sink onPress={() => router.push('/backup')} shadow="none" accessibilityRole="link" accessibilityLabel={`${c.backup}. Not done yet`} className="min-h-[56px] flex-row items-center gap-3 rounded-block border-2 border-mirchi bg-surface px-3.5">
                <View className="h-2.5 w-2.5 rounded-pill bg-mirchi" />
                <Text className="flex-1 text-[16px] font-bold">{c.backup}</Text>
                <Icon as={ChevronRight} size={20} />
              </Sink>
            ) : null}
            <ListGroup>
              {p && p.tier.name === 'new' && mode !== 'desk' ? <ListRow icon={BadgeCheck} label={c.getVerified} hint={c.getVerifiedHint} onPress={() => router.push('/verify')} /> : null}
              {backedUp ? <ListRow icon={BadgeCheck} label={c.backupDone} onPress={() => router.push('/backup')} /> : null}
              <ListRow icon={Bell} label={c.notifications} onPress={() => router.push('/notifications')} />
              <ListRow icon={HelpCircle} label={c.help} onPress={() => router.push('/help')} />
              <ListRow icon={SettingsIcon} label={c.settings} onPress={() => router.push('/settings')} last />
            </ListGroup>
          </Rise>
        </View>
      </ScrollView>
      <ShareProfileSheet open={sharing} onClose={() => setSharing(false)} address={address} />
    </View>
  );
}
