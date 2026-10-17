/**
 * Peep: deterministic line-art bust from the design system (components/peep.js), seeded by the
 * account ID so a person looks the same everywhere. Stand-in art; swap parts for Open Peeps (CC0)
 * keeping the same seed logic.
 */
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { TierName } from '@bhaiya-please/core';
import { aliasFor } from '@/lib/alias';
import { C, cn } from '@/lib/utils';
import { LevelPlate } from './Signatures';
import { Text } from './Text';

export function peepParts(seed: string) {
  let h = 5381;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 2654435761) >>> 0;
  return { hair: h % 8, cloth: (h >>> 4) % 4, face: (h >>> 8) % 3, extra: (h >>> 12) % 5 };
}

export const Peep = memo(function Peep({ seed, size = 120, tone = 'paper', accent = false }: { seed: string; size?: number; tone?: 'paper' | 'night'; accent?: boolean }) {
  const { hair, cloth, face, extra } = peepParts(seed);
  const night = tone === 'night';
  const ink = night ? C.paper : C.ink;
  const fill = night ? C.ink : C.white;
  const bodyFill = accent && hair !== 3 ? C.yellow : fill;
  const helmetFill = accent ? C.yellow : ink;
  const x = (i: number) => extra === i && !(extra === 4 && hair === 7);
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size} stroke={ink} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round">
      <Path d="M8 124 C 10 99 29 87 48 85 L 72 85 C 91 87 110 99 112 124 Z" fill={bodyFill} />
      {cloth === 0 && <Path d="M48 85 C 52 95 68 95 72 85" fill="none" />}
      {cloth === 1 && (
        <G fill="none">
          <Path d="M50 85 L 60 101 L 70 85" />
          <Path d="M60 101 L 60 118" />
          <Path d="M60 108 L 60 108.5" />
        </G>
      )}
      {cloth === 2 && (
        <G fill="none">
          <Path d="M48 85 C 52 94 68 94 72 85" />
          <Path d="M38 88 L 82 124" />
          <Path d="M52 86 L 98 124" />
        </G>
      )}
      {cloth === 3 && (
        <G fill="none">
          <Path d="M47 85 L 56 106" />
          <Path d="M73 85 L 64 106" />
          <Path d="M60 104 L 60 124" />
        </G>
      )}
      <Path d="M51 70 L 51 86 C 55 91 65 91 69 86 L 69 70" fill={fill} />
      <Path d="M40 48 C 33 46 33 60 41 60" fill={fill} />
      <Path d="M80 48 C 87 46 87 60 79 60" fill={fill} />
      <Ellipse cx={60} cy={50} rx={21} ry={24} fill={fill} />
      {hair === 0 && <Path fill={ink} d="M39 48 C 36 30 46 22 60 22 C 74 22 84 30 81 48 C 78 40 74 36 66 34 C 58 38 48 38 42 40 C 40 42 39 45 39 48 Z" />}
      {hair === 1 && (
        <G fill={ink}>
          <Circle cx={60} cy={21} r={9} />
          <Path d="M39 50 C 37 32 48 26 60 26 C 72 26 83 32 81 50 C 78 39 70 33 60 33 C 50 33 42 39 39 50 Z" />
        </G>
      )}
      {hair === 2 && <Path fill={ink} d="M38 52 C 34 28 48 22 60 22 C 74 22 86 30 82 52 L 84 82 C 80 86 76 86 74 82 L 76 50 C 72 39 66 34 60 34 C 52 36 46 40 44 50 L 46 82 C 44 86 38 86 36 82 Z" />}
      {hair === 3 && (
        <G>
          <Path d="M35 58 C 33 30 47 17 60 17 C 76 17 89 29 85 58 L 76 58 L 76 47 L 44 47 L 44 58 Z" fill={helmetFill} />
          <Path d="M44 47 L 76 47" fill="none" />
          <Path d="M52 24 C 56 22 64 22 68 24" fill="none" />
        </G>
      )}
      {hair === 4 && (
        <G>
          <Path d="M39 40 C 40 27 50 22 60 22 C 71 22 80 27 81 40 Z" fill={ink} />
          <Path d="M34 40 L 86 40 C 86 44 84 46 80 46 L 40 46 C 36 46 34 44 34 40 Z" fill={ink} />
          <Circle cx={60} cy={32} r={3} fill={fill} />
        </G>
      )}
      {hair === 5 && (
        <G fill="none" strokeWidth={4}>
          <Path d="M40 40 C 38 46 38 52 40 56" />
          <Path d="M80 40 C 82 46 82 52 80 56" />
          <Path d="M54 29 C 57 27 63 27 66 29" strokeWidth={3.2} />
        </G>
      )}
      {hair === 6 && (
        <G fill={ink}>
          <Circle cx={44} cy={35} r={9} />
          <Circle cx={54} cy={27} r={10} />
          <Circle cx={66} cy={27} r={10} />
          <Circle cx={77} cy={35} r={9} />
          <Circle cx={40} cy={46} r={5} />
          <Circle cx={80} cy={46} r={5} />
        </G>
      )}
      {hair === 7 && <Path fill={ink} d="M34 60 C 30 26 48 18 60 18 C 74 18 90 26 86 60 C 88 74 85 86 81 92 L 74 92 C 78 77 80 63 78 53 C 74 41 68 37 60 37 C 50 37 44 43 42 53 C 40 63 42 77 46 92 L 39 92 C 35 86 32 74 34 60 Z" />}
      <Path d="M48 45.5 L 55 44.5" fill="none" />
      <Path d="M65 44.5 L 72 45.5" fill="none" />
      <Circle cx={52.5} cy={52} r={2.3} fill={ink} stroke="none" />
      <Circle cx={67.5} cy={52} r={2.3} fill={ink} stroke="none" />
      {face === 0 && <Path d="M54 62 C 57 66 63 66 66 62" fill="none" />}
      {face === 1 && <Path d="M55.5 63.5 L 64.5 63.5" fill="none" />}
      {face === 2 && <Path d="M53 61 C 55 69 65 69 67 61 Z" fill={ink} />}
      {x(1) && (
        <G fill="none" strokeWidth={2.6}>
          <Circle cx={52.5} cy={52} r={6.5} />
          <Circle cx={67.5} cy={52} r={6.5} />
          <Path d="M59 52 L 61 52" />
        </G>
      )}
      {x(2) && <Path fill={ink} d="M51 59.5 C 55 56 60 58 60 58 C 60 58 65 56 69 59.5 C 65 61.5 55 61.5 51 59.5 Z" />}
      {x(3) && <Circle cx={60} cy={42} r={2} fill={ink} stroke="none" />}
      {x(4) && <Path fill={ink} d="M41 55 C 43 72 51 77 60 77 C 69 77 77 72 79 55 C 75 64 69 69 60 69 C 51 69 45 64 41 55 Z" />}
    </Svg>
  );
});

/** Round avatar: paper disc, bust aligned to the bottom edge. */
export function Avatar({ seed, size = 48, ring = 'paper', dashed, faded, accent }: { seed: string; size?: number; ring?: 'paper' | 'ink' | 'yellow' | 'none'; dashed?: boolean; faded?: boolean; accent?: boolean }) {
  const rc = { paper: 'border-paper', ink: 'border-ink', yellow: 'border-yellow', none: 'border-transparent' }[ring];
  return (
    <View
      aria-hidden
      className={cn('items-center justify-end overflow-hidden rounded-pill bg-paper', ring === 'yellow' ? 'border-3' : 'border-2', rc, dashed && 'border-dashed border-muted', faded && 'opacity-60')}
      style={{ width: size, height: size }}>
      <Peep seed={seed.toLowerCase()} size={size * 1.08} accent={accent} />
    </View>
  );
}

/** Person chip: avatar + public name + level. The whole chip opens the profile. */
export function PersonChip({ address, level, size = 'md', link = true, className, onPaper }: { address: string; level?: TierName | null; size?: 'sm' | 'md'; link?: boolean; className?: string; onPaper?: boolean }) {
  const router = useRouter();
  const name = aliasFor(address);
  const sm = size === 'sm';
  const body = (
    <>
      <Avatar seed={address} size={sm ? 28 : 38} ring="none" />
      <Text numberOfLines={1} className={cn('font-bold', sm ? 'text-[14px]' : 'text-[16px]', onPaper && 'text-ink')}>
        {name}
      </Text>
      {level ? <LevelPlate level={level} size="xs" /> : null}
    </>
  );
  const cls = cn('flex-row items-center gap-2.5 self-start rounded-pill border-2', sm ? 'h-9 pl-0.5 pr-3' : 'h-12 pl-1 pr-3.5', onPaper ? 'border-ink bg-white' : 'border-edge bg-surface', className);
  if (!link) return <View className={cls}>{body}</View>;
  return (
    <Pressable onPress={() => router.push(`/p/${address}`)} accessibilityRole="link" accessibilityLabel={`${name}, open profile`} className={cn(cls, 'active:opacity-80')}>
      {body}
    </Pressable>
  );
}

/** A crowd row of busts bleeding off the edges (posters, empty states). Decorative. */
export function Crowd({ seeds, size = 120, overlap = 0.33, accentIndex = -1, tone = 'paper', className }: { seeds: string[]; size?: number; overlap?: number; accentIndex?: number; tone?: 'paper' | 'night'; className?: string }) {
  return (
    <View aria-hidden pointerEvents="none" className={cn('flex-row', className)}>
      {seeds.map((s, i) => (
        <View key={`${s}${i}`} style={{ marginLeft: i === 0 ? 0 : -size * overlap }}>
          <Peep seed={s} size={size} tone={tone} accent={i === accentIndex} />
        </View>
      ))}
    </View>
  );
}

/** A small stack of overlapping avatars ("your crowd"), then a +N plate. */
export function AvatarStack({ seeds, max = 24, size = 38, total }: { seeds: string[]; max?: number; size?: number; total?: number }) {
  const shown = seeds.slice(0, max);
  const rest = (total ?? seeds.length) - shown.length;
  return (
    <View className="flex-row flex-wrap items-center pl-2.5">
      {shown.map((s) => (
        <View key={s} style={{ marginLeft: -10, marginBottom: 6 }}>
          <View className="items-center justify-end overflow-hidden rounded-pill border-2 border-ink bg-paper" style={{ width: size, height: size }}>
            <Peep seed={s} size={size * 1.1} />
          </View>
        </View>
      ))}
      {rest > 0 ? (
        <View className="ml-1.5 rounded-plate border-2 border-ink bg-mirchi px-2 py-1">
          <Text className="font-display text-[14px] leading-[15px] text-ink">+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}
