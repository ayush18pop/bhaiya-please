import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { RequestSummary } from '@/components/RequestSummary';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useMyRequests } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { ago } from '@/lib/format';
import { S } from '@/lib/strings';

export default function MyRequests() {
  const router = useRouter();
  const now = useNow();
  const q = useMyRequests();
  return (
    <Page>
      <Text variant="h2">{S.request.myRequests}</Text>
      {q.isLoading && !q.data ? (
        <SkeletonCards />
      ) : !q.data?.length ? (
        <EmptyState title={S.request.empty} body={S.runs.emptyWarm} />
      ) : (
        <View className="gap-3">
          {q.data.map(({ request, accept, delivery }) => {
            const label = delivery ? 'Delivered' : accept ? 'Accepted' : 'Posted';
            return (
              <Pressable key={request.key} onPress={() => router.push(`/r/request/${request.key}`)}>
                <Card className="gap-2 px-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1"><RequestSummary request={request} /></View>
                    <Badge variant={delivery ? 'secondary' : accept ? 'default' : 'muted'}><Text>{label}</Text></Badge>
                  </View>
                  <Text variant="caption">{ago(request.createdAt, now)}</Text>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Page>
  );
}
