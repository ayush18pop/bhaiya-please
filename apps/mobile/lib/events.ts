/**
 * App events for the sandbox guided tour (F2): screens call `appEvent()` after key successes; inside a
 * sandbox iframe they are forwarded to the parent split view with postMessage.
 */
import { Platform } from 'react-native';

export type AppEvent =
  | 'request.sent' | 'request.accepted' | 'runner.atGate' | 'handoff.saved' | 'receipt.given' | 'run.started'
  | 'vouch.issued' | 'report.filed' | 'onboarding.done';

const local = new Set<(e: AppEvent) => void>();

export function appEvent(e: AppEvent) {
  local.forEach((f) => f(e));
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ bp: 'event', type: e }, window.location.origin);
    } catch {}
  }
}

export function onAppEvent(f: (e: AppEvent) => void) {
  local.add(f);
  return () => local.delete(f);
}
