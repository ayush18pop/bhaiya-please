/**
 * i18n. Two layers:
 * 1. `t(key, vars)` — the design system's shared strings (lib/i18n/{en,hi,kn}.json, flat keys like
 *    'run.goLive'). Missing translations fall back to English.
 * 2. `defineCopy({ en, hi?, kn? })` + `useCopy(copy)` — per-screen-group copy objects, deep-merged
 *    over English, so each feature owns its strings without one giant file.
 * Hindi and Kannada need native-speaker review before launch (design system note).
 */
import { useSyncExternalStore } from 'react';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import kn from './i18n/kn.json';
import { setKannadaFonts } from './fonts';
import type { Language } from './session';

export type StringKey = keyof typeof en;
const DICT: Record<Language, Partial<Record<StringKey, string>>> = { en, hi, kn };

let lang: Language = 'en';
const listeners = new Set<() => void>();

export function setLanguage(l: Language) {
  if (l === lang) return;
  lang = l;
  setKannadaFonts(l === 'kn');
  listeners.forEach((f) => f());
}
export const getLanguage = () => lang;
export function useLanguage(): Language {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
    () => lang,
  );
}

export function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Shared design-system string. Re-renders with language when used inside a component that calls useLanguage/useT. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  return fill(DICT[lang][key] ?? en[key], vars);
}

/** Hook form: subscribes to language changes. */
export function useT() {
  useLanguage();
  return t;
}

export const LANGUAGES: { id: Language; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
];

// ------------------------------------------------------------------ feature copy

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends readonly unknown[] ? T[K] : DeepPartial<T[K]> };
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends readonly (infer U)[] ? readonly Widen<U>[] : Widen<T[K]> };

export interface Copy<T> {
  en: T;
  hi?: DeepPartial<T>;
  kn?: DeepPartial<T>;
}

/** Declare a feature's copy: English is the full source, other languages override any subset. */
export function defineCopy<T extends object>(c: { en: T; hi?: DeepPartial<Widen<T>>; kn?: DeepPartial<Widen<T>> }): Copy<Widen<T>> {
  return c as unknown as Copy<Widen<T>>;
}

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v) : (v ?? b);
  }
  return out as T;
}

const cache = new WeakMap<object, Partial<Record<Language, unknown>>>();
export function resolveCopy<T>(c: Copy<T>, l: Language = lang): T {
  let m = cache.get(c);
  if (!m) cache.set(c, (m = {}));
  if (!m[l]) m[l] = l === 'en' || !c[l] ? c.en : merge(c.en, c[l]);
  return m[l] as T;
}

/** Feature copy in the current language (re-renders on language change). Interpolate with `fill`. */
export function useCopy<T>(c: Copy<T>): T {
  const l = useLanguage();
  return resolveCopy(c, l);
}
