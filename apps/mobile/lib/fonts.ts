/**
 * Brand type (design system "Type"): Archivo Black (display, plates, CTAs) · Baloo 2 500–800 (UI,
 * English and Hindi) · Baloo Tamma 2 (Kannada) · Modak (Hindi display, celebrations only) · DSEG7
 * (digits in meter windows only). One family per weight: RN can't pick weights from a family on native.
 */
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { Baloo2_500Medium, Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { BalooTamma2_500Medium, BalooTamma2_600SemiBold, BalooTamma2_700Bold, BalooTamma2_800ExtraBold } from '@expo-google-fonts/baloo-tamma-2';
import { Modak_400Regular } from '@expo-google-fonts/modak';
import { Platform } from 'react-native';

export const FONT_ASSETS = {
  ArchivoBlack_400Regular,
  Baloo2_500Medium,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
  BalooTamma2_500Medium,
  BalooTamma2_600SemiBold,
  BalooTamma2_700Bold,
  BalooTamma2_800ExtraBold,
  Modak_400Regular,
  DSEG7: require('../assets/fonts/DSEG7Classic-Bold.ttf'),
};

type Weight = 'medium' | 'semibold' | 'bold' | 'extrabold';
const BODY: Record<Weight, string> = {
  medium: 'Baloo2_500Medium',
  semibold: 'Baloo2_600SemiBold',
  bold: 'Baloo2_700Bold',
  extrabold: 'Baloo2_800ExtraBold',
};
const KANNADA: Record<Weight, string> = {
  medium: 'BalooTamma2_500Medium',
  semibold: 'BalooTamma2_600SemiBold',
  bold: 'BalooTamma2_700Bold',
  extrabold: 'BalooTamma2_800ExtraBold',
};

const WEB_FALLBACK = ', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const web = (f: string, fallback = WEB_FALLBACK) => (Platform.OS === 'web' ? `${f}${fallback}` : f);

let kannada = false;
/** Set by the i18n layer: Kannada swaps the body family (display stays Archivo Black). */
export const setKannadaFonts = (on: boolean) => {
  kannada = on;
};

export const FONT = {
  // Web: Devanagari / Kannada glyphs (Hindi/Kannada copy, language names) fall back to Baloo.
  display: web('ArchivoBlack_400Regular', `, Baloo2_800ExtraBold, BalooTamma2_800ExtraBold${WEB_FALLBACK}`),
  hindiDisplay: web('Modak_400Regular'),
  meter: web('DSEG7', ', ui-monospace, monospace'),
  body: (w: Weight = 'medium') => web((kannada ? KANNADA : BODY)[w], `, ${(kannada ? BODY : KANNADA)[w]}${WEB_FALLBACK}`),
};

/**
 * Resolve the font from a merged className: `font-display`, `font-meter`, `font-hindi` pick those
 * families; otherwise `font-medium|semibold|bold|extrabold` (also normal→medium, black→extrabold) pick
 * the Baloo weight.
 */
export function fontStyleFor(className: string): { fontFamily: string; fontWeight: 'normal' } {
  if (/(?:^|\s)font-display(?=\s|$)/.test(className)) return { fontFamily: FONT.display, fontWeight: 'normal' };
  if (/(?:^|\s)font-meter(?=\s|$)/.test(className)) return { fontFamily: FONT.meter, fontWeight: 'normal' };
  if (/(?:^|\s)font-hindi(?=\s|$)/.test(className)) return { fontFamily: FONT.hindiDisplay, fontWeight: 'normal' };
  const m = className.match(/(?:^|\s)font-(normal|medium|semibold|bold|extrabold|black)(?=\s|$)/g);
  const raw = m ? m[m.length - 1].trim().slice(5) : 'medium';
  const w: Weight = raw === 'normal' ? 'medium' : raw === 'black' ? 'extrabold' : (raw as Weight);
  return { fontFamily: FONT.body(w), fontWeight: 'normal' };
}
