/** App-wide background watchers (signed-in): notification inbox owner, the live-data diff watcher and alert upkeep. */
import { useEffect } from 'react';
import { useSession } from '@/components/providers';
import { setHistoryOwner } from '@/lib/history';
import { setNotifOwner } from '@/lib/notifications';
import AlertSync from '@/screens/shared/AlertSync';
import NotificationWatcher from '@/screens/shared/NotificationWatcher';

export function AppWatchers() {
  const { address } = useSession();
  useEffect(() => {
    setNotifOwner(address);
    setHistoryOwner(address);
  }, [address]);
  return address ? (
    <>
      <NotificationWatcher />
      <AlertSync />
    </>
  ) : null;
}
