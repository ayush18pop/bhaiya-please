/**
 * Native map marker glyphs (react-native-svg), same geometry as the web markers. The `*G` parts
 * draw at the origin so the Expo Go schematic can place them; the `*Marker` views wrap them for
 * MapLibre ViewAnnotations.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { C, FONT, GATE, RUNNER, runnerInitial, runnerPlateText, SHOP, SHOP_GLYPH, TIER_PLATE } from './glyphs';
import type { RunnerPin, ShopPin } from './types';

/** Boom barrier, 48×32, top-left at origin. */
export function GateG() {
  const { post, arm, stripes, stripeW } = GATE;
  return (
    <G>
      <Rect x={post.x} y={post.y} width={post.w} height={post.h} fill={C.paper} stroke={C.ink} strokeWidth={2} />
      <Rect x={arm.x} y={arm.y} width={arm.w} height={arm.h} fill={C.yellow} stroke={C.ink} strokeWidth={2} />
      {stripes.map((x) => (
        <Rect key={x} x={x} y={arm.y} width={stripeW} height={arm.h} fill={C.ink} />
      ))}
    </G>
  );
}

/** Shop signboard, top-left at origin (34×22, or 40×26 + 3px shadow when selected). */
export function ShopG({ category, selected }: Pick<ShopPin, 'category' | 'selected'>) {
  const on = !!selected;
  const w = on ? SHOP.selW : SHOP.w;
  const h = on ? SHOP.selH : SHOP.h;
  return (
    <G>
      {on ? <Rect x={SHOP.shadow} y={SHOP.shadow} width={w} height={h} rx={2} fill={C.paper} /> : null}
      <Rect x={0} y={0} width={w} height={h} rx={2} fill={on ? C.yellow : C.paper} stroke={C.ink} strokeWidth={on ? 2.5 : 2} />
      <G transform={on ? `translate(${w / 2} ${h / 2}) scale(1.1) translate(${-SHOP.w / 2} ${-SHOP.h / 2})` : undefined}>
        <Path d={SHOP_GLYPH[category]} fill="none" stroke={C.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </G>
    </G>
  );
}

/** Runner disc centred at origin. `ring`: static pulse ring (live) / dashed ring (stale). */
export function RunnerG({ r, heading, ring = true }: { r: RunnerPin; heading?: number; ring?: boolean }) {
  const live = r.freshness === 'live';
  const letter = runnerInitial(r);
  return (
    <G opacity={live ? 1 : 0.4}>
      {ring ? <Circle r={RUNNER.ring} fill="none" stroke={C.yellow} strokeWidth={2} strokeDasharray={live ? undefined : '4 4'} strokeOpacity={live ? 0.6 : 1} /> : null}
      {heading !== undefined ? (
        <G rotation={heading} origin="0, 0">
          <Path d={RUNNER.arrow} fill={C.yellow} stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />
        </G>
      ) : null}
      {live ? <Circle cx={3} cy={3} r={RUNNER.r} fill={C.paper} /> : null}
      <Circle r={RUNNER.r} fill={C.yellow} stroke={C.ink} strokeWidth={2.5} />
      {letter ? (
        <SvgText y={5} textAnchor="middle" fontFamily={FONT.display} fontSize={13} fill={C.ink}>
          {letter}
        </SvgText>
      ) : (
        <G fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d={RUNNER.bike} />
          {RUNNER.bikeWheels.map(([x, y]) => (
            <Circle key={x} cx={x} cy={y} r={RUNNER.wheelR} />
          ))}
        </G>
      )}
    </G>
  );
}

export function Plate({ children, radius = 3 }: { children: string; radius?: number }) {
  return (
    <View style={[s.plate, { borderRadius: radius }]}>
      <Text style={s.plateText} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

export function TierPlate({ tier }: { tier: RunnerPin['tier'] }) {
  if (!tier) return null;
  const t = TIER_PLATE[tier];
  return (
    <View style={[s.tier, { backgroundColor: t.bg }]}>
      <Text style={s.tierText}>{t.label}</Text>
    </View>
  );
}

export function GateMarker({ label }: { label: string }) {
  return (
    <View style={s.col} accessibilityLabel={label}>
      <Plate radius={4}>{label}</Plate>
      <Svg width={GATE.w} height={GATE.h} viewBox={`0 0 ${GATE.w} ${GATE.h}`} style={{ marginTop: 4 }}>
        <GateG />
      </Svg>
    </View>
  );
}

/** Signboard box size (incl. stroke margin) — used to anchor the annotation on the board's centre. */
export const shopBox = (selected?: boolean) => {
  const extra = selected ? SHOP.shadow : 0;
  return { w: (selected ? SHOP.selW : SHOP.w) + 4 + extra, h: (selected ? SHOP.selH : SHOP.h) + 4 + extra };
};

export function ShopMarker({ shop }: { shop: ShopPin }) {
  const b = shopBox(shop.selected);
  return (
    <View style={s.col} accessibilityLabel={shop.name}>
      <Svg width={b.w} height={b.h} viewBox={`-2 -2 ${b.w} ${b.h}`}>
        <ShopG category={shop.category} selected={shop.selected} />
      </Svg>
      {shop.selected ? <Plate>{shop.name}</Plate> : null}
    </View>
  );
}

export const RUNNER_BOX = 64;

export function RunnerMarker({ r, heading }: { r: RunnerPin; heading?: number }) {
  const plate = r.focused ? runnerPlateText(r) : '';
  const live = r.freshness === 'live';
  return (
    <View style={s.row} accessibilityLabel={[r.name ?? 'Runner', r.chip].filter(Boolean).join(', ')}>
      <Svg width={RUNNER_BOX} height={RUNNER_BOX} viewBox={`${-RUNNER_BOX / 2} ${-RUNNER_BOX / 2} ${RUNNER_BOX} ${RUNNER_BOX}`}>
        <RunnerG r={r} heading={heading} />
      </Svg>
      {plate || (r.focused && r.tier) ? (
        <View style={[s.row, { gap: 4, marginLeft: -8, opacity: live ? 1 : 0.85 }]}>
          {plate ? <Plate>{plate}</Plate> : null}
          <TierPlate tier={r.tier} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  col: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  plate: { backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 7, paddingVertical: 1 },
  plateText: { color: C.ink, fontFamily: FONT.body800, fontSize: 13, lineHeight: 17 },
  tier: { borderWidth: 2, borderColor: C.ink, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2 },
  tierText: { color: C.ink, fontFamily: FONT.display, fontSize: 9, lineHeight: 11 },
});
