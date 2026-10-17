/**
 * Shown instead of an empty or "ended" state when the data could not be read (network down or the
 * RPC's free read limit used up), so the app never claims a run ended or a list is empty when it
 * simply couldn't check.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@/components/bp';

export function readProblemText(err: unknown): { title: string; body: string } {
  const code = (err as { code?: string })?.code;
  if (code === 'QUOTA_EXHAUSTED' || code === 'RATE_LIMITED')
    return { title: "Couldn't check the network right now.", body: "Its free limit is used up for a moment. Nothing changed on your side; we'll try again shortly." };
  return { title: "Couldn't reach the network.", body: 'Check your connection. We will try again.' };
}

export function ReadProblem({ error, className }: { error: unknown; className?: string }) {
  const qc = useQueryClient();
  const t = readProblemText(error);
  return <Alert tone="error" title={t.title} body={t.body} className={className} actions={<Button label="Try again" variant="secondary" size="sm" full={false} onPress={() => void qc.invalidateQueries()} />} />;
}
