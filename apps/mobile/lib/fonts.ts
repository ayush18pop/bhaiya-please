/** Plus Jakarta Sans via expo-font. One family per weight (RN can't pick weights from a family on native). */
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Platform } from 'react-native';

export const FONT_ASSETS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

const FAMILY: Record<string, keyof typeof FONT_ASSETS> = {
  normal: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  black: 'PlusJakartaSans_800ExtraBold',
};

/** Browsers fall back to the system sans until the font file arrives (no blocking first paint). */
const WEB_FALLBACK = ', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Pull the weight utility out of a merged className and return the matching font style. */
export function fontStyleFor(className: string): { fontFamily: string; fontWeight: 'normal' } {
  const m = className.match(/(?:^|\s)font-(normal|medium|semibold|bold|extrabold|black)(?=\s|$)/g);
  const w = m ? m[m.length - 1].trim().slice(5) : 'normal';
  const fam = FAMILY[w] ?? FAMILY.normal;
  return { fontFamily: Platform.OS === 'web' ? fam + WEB_FALLBACK : fam, fontWeight: 'normal' };
}
