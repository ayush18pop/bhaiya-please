/** Connectivity: browser online/offline events on web; NetInfo isn't installed, so native assumes online. */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

let lastOnlineAt = Date.now();
export const getLastOnlineAt = () => lastOnlineAt;

export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const up = () => {
      lastOnlineAt = Date.now();
      setOn(true);
    };
    const down = () => {
      lastOnlineAt = Date.now();
      setOn(false);
    };
    setOn(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}
