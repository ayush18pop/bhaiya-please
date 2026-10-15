import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Countdown } from '@/components/Countdown';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { RunnerRequestCard } from '@/components/RunnerRequestCard';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useRunnerBoard } from '@/hooks/queries';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';

export default function RunnerRequests() {
  const router = useRouter();
  const q = useRunnerBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const run = q.data?.run;

  if (q.isLoading && !q.data) return <Page><SkeletonCards /></Page>;
  if (!run)
    return (
      <Page>
        <EmptyState title={S.runner.noRun}>
          <Button variant="outline" onPress={() => router.replace('/u/run')}><Text>{S.runner.announce}</Text></Button>
        </EmptyState>
      </Page>
    );

  const rows = q.data!.rows;
  return (
    <Page>
      <View className="gap-0.5">
        <Text variant="h2">{S.runner.incoming}</Text>
        <View className="flex-row items-center gap-1.5">
          <Text variant="muted">Your run ·</Text>
          <Countdown to={run.eta} endLabel={S.runs.atGate} className="text-sm font-bold" />
          <Text variant="muted">· {fmt(S.runner.slotsLeft, { n: run.capacityLeft })}</Text>
        </View>
      </View>
      {rows.length === 0 ? (
        <EmptyState title={S.runner.noRequests} body={S.runs.emptyWarm} />
      ) : (
        <View className="gap-3">
          {rows.map((row) => (
            <RunnerRequestCard key={row.request.key} row={row} full={run.capacityLeft <= 0} busyKey={busy} setBusyKey={setBusy} />
          ))}
        </View>
      )}
    </Page>
  );
}
