import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AliasChip } from '@/components/AliasChip';
import { RequestSummary } from '@/components/RequestSummary';
import { TxButton } from '@/components/TxButton';
import { useCore } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { describeError } from '@/hooks/useTx';
import type { RequestRow } from '@/hooks/queries';
import { S } from '@/lib/strings';
import { TxBanner } from '@/components/TxBanner';

export function RunnerRequestCard({ row, full, busyKey, setBusyKey }: { row: RequestRow; full: boolean; busyKey: string | null; setBusyKey: (k: string | null) => void }) {
  const core = useCore();
  const qc = useQueryClient();
  const { request, accept, delivery } = row;
  const [fail, setFail] = useState<unknown>(null);
  const dim = !accept && full;
  return (
    <Card className={dim ? 'gap-3 px-4 opacity-60' : 'gap-3 px-4'}>
      <View className="flex-row items-center justify-between">
        <AliasChip address={request.creator} />
        {!accept && !dim ? <Badge variant="default"><Text>NEW</Text></Badge> : null}
      </View>
      <RequestSummary request={request} />
      {delivery ? (
        <Badge variant="secondary" className="self-start"><Text>Delivered ✓</Text></Badge>
      ) : accept ? (
        <Badge variant="accent" className="self-start"><Text>{S.runner.accepted}</Text></Badge>
      ) : dim ? (
        <Text className="font-semibold text-muted-foreground">{S.runner.runFull}</Text>
      ) : (
        <View className="gap-2">
          <TxButton
            disabled={busyKey !== null && busyKey !== request.key}
            labels={{ idle: S.runner.accept, pending: S.runner.accepting, done: S.runner.accepted }}
            hideBanner
            onTx={async () => {
              setBusyKey(request.key);
              setFail(null);
              try {
                return await core.acceptRequest(request.key);
              } catch (e) {
                setFail(e);
                throw e;
              } finally {
                setBusyKey(null);
              }
            }}
            onDone={() => qc.invalidateQueries()}
          />
          {fail ? <TxBanner error={fail} message={`${S.runner.cantAccept} — ${describeError(fail).message}`} /> : null}
        </View>
      )}
    </Card>
  );
}
