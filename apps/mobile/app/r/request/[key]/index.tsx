import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PartyPopper } from 'lucide-react-native';
import { AliasChip } from '@/components/AliasChip';
import { ArkivNote } from '@/components/ArkivNote';
import { SuccessBurst } from '@/components/Motion';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { LiveTracking } from '@/components/LiveTracking';
import { Countdown } from '@/components/Countdown';
import { OnChainProof } from '@/components/OnChainProof';
import { RequestSummary } from '@/components/RequestSummary';
import { StatusTimeline } from '@/components/StatusTimeline';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useRequestStatus, type RequestStage } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { ago, fmt } from '@/lib/format';
import { aliasFor } from '@/lib/alias';
import { S } from '@/lib/strings';

const IDX: Record<RequestStage, number> = { posted: 0, accepted: 1, delivered: 2, rated: 3 };

export default function RequestStatusScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const now = useNow();
  const q = useRequestStatus(key);
  const s = q.data;

  if (q.isLoading && !s)
    return (
      <Page>
        <SkeletonCards n={2} />
      </Page>
    );
  if (!s?.request)
    return (
      <Page>
        <EmptyState title={S.request.lapsed}>
          <Button variant="outline" onPress={() => router.replace('/r')}>
            <Text>{S.request.seeOtherRuns}</Text>
          </Button>
        </EmptyState>
      </Page>
    );

  const rider = s.accept?.rider ?? s.run?.creator;
  const idx = IDX[s.stage];

  return (
    <Page
      footer={
        s.stage === 'accepted' ? (
          <Button size="lg" onPress={() => router.push(`/r/request/${key}/handoff`)}>
            <Text>{S.request.showCode}</Text>
          </Button>
        ) : s.stage === 'posted' && !s.lapsed ? (
          <Button size="lg" disabled>
            <Text>{S.request.showCode}</Text>
          </Button>
        ) : undefined
      }>
      {s.run && !s.lapsed && (s.stage === 'posted' || s.stage === 'accepted') ? <LiveTracking run={s.run} /> : null}
      <RequestSummary request={s.request} />
      <Card className="gap-4 py-5">
        <View className="px-2">
          <StatusTimeline steps={S.request.stages} current={idx} />
        </View>
        <View className="gap-1 px-4">
          {s.lapsed ? (
            <Text className="font-semibold text-destructive">{S.request.lapsed}</Text>
          ) : s.stage === 'posted' ? (
            <Text>
              Posted {ago(s.request.createdAt, now)} · {rider ? fmt(S.request.waitingFor, { who: aliasFor(rider) }) : 'waiting'}
            </Text>
          ) : s.stage === 'accepted' ? (
            <Text>Accepted {s.accept ? ago(s.accept.createdAt, now) : ''}. {S.safety.gate}</Text>
          ) : s.stage === 'delivered' ? (
            <Text>Handoff confirmed {s.delivery ? ago(s.delivery.createdAt, now) : ''}</Text>
          ) : (
            <Text>All done. Thanks for rating.</Text>
          )}
          {s.run && s.stage !== 'delivered' && s.stage !== 'rated' && !s.lapsed ? (
            <View className="flex-row items-baseline gap-2">
              <Text variant="muted">{S.request.arrivesIn}</Text>
              <Countdown to={s.run.eta} endLabel={S.runs.atGate} className="font-bold" />
            </View>
          ) : null}
        </View>
        {rider && !s.lapsed ? (
          <View className="px-4">
            <AliasChip address={rider} />
          </View>
        ) : null}
      </Card>

      {s.lapsed && (
        <Button variant="outline" onPress={() => router.replace('/r')}>
          <Text>{S.request.seeOtherRuns}</Text>
        </Button>
      )}

      {s.stage === 'delivered' && (
        <Card className="gap-3 border-secondary bg-secondary/10 p-4">
          <SuccessBurst size={64} />
          <Text variant="h3" className="text-center">{S.request.delivered}</Text>
          <Text className="text-center">{fmt(S.request.deliveredBody, { who: aliasFor(s.delivery!.rider) })}</Text>
          <Button variant="secondary" size="lg" onPress={() => router.push(`/r/request/${key}/rate`)}>
            <Text>{S.request.rateIt}</Text>
          </Button>
        </Card>
      )}
      {s.stage === 'rated' && (
        <Button variant="outline" onPress={() => router.push(`/r/request/${key}/rate`)}>
          <Text>{s.receipt ? 'View receipt' : 'View complaint'}</Text>
        </Button>
      )}

      <OnChainProof entityKey={s.request.key} />
      <ArkivNote text="Each step is its own record on Arkiv." explainer="Posted, accepted, delivered and rated are four separate records, created by different wallets. Nobody can rewrite an earlier step." />
    </Page>
  );
}
