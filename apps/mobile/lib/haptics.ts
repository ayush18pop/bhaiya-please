/** Thin wrapper: haptics on device, silent no-op on web or when the module throws. */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const on = Platform.OS !== 'web';
const safe = (fn: () => Promise<void>) => {
  if (!on) return;
  fn().catch(() => {});
};

export const haptic = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(() => Haptics.selectionAsync()),
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
