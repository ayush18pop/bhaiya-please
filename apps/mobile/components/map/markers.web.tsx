/**
 * Web map markers (DOM + inline SVG), reproducing the design system's "Map markers" artboard:
 * boom-barrier gate, paper shop signboards, yellow runner discs with a pulse ring.
 */
import type { CSSProperties, ReactNode } from 'react';
import { C, GATE, RUNNER, runnerInitial, runnerPlateText, SHOP, SHOP_GLYPH, TIER_PLATE, WEB_FONT } from './glyphs';
import type { RunnerPin, ShopPin } from './types';

export const MARKER_CSS = `
@keyframes bp-pulse { 0% { transform: scale(.6); opacity: .9 } 100% { transform: scale(1.6); opacity: 0 } }
.bp-pulse { position:absolute; left:50%; top:50%; width:40px; height:40px; margin:-20px 0 0 -20px; box-sizing:border-box; border:2px solid ${C.yellow}; border-radius:9999px; animation: bp-pulse 2s ease-out infinite; pointer-events:none }
.bp-marker { transition: opacity .6s ease; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.bp-shop svg { transition: transform .15s ease; }
.bp-plate { background:${C.paper}; color:${C.ink}; border:2px solid ${C.ink}; font: 800 13px/1.15 ${WEB_FONT.body800}; white-space:nowrap; box-sizing:border-box; }
.bp-tier { display:inline-block; padding:2px 4px; color:${C.ink}; border:2px solid ${C.ink}; border-radius:3px; font: 400 9px/1 ${WEB_FONT.display}; letter-spacing:.02em; }
.bp-glass { background:${C.glass}; -webkit-backdrop-filter: blur(16px) saturate(140%); backdrop-filter: blur(16px) saturate(140%); border:2px solid ${C.glassBorder}; box-shadow: 4px 4px 0 0 ${C.ink}; color:${C.paper}; box-sizing:border-box; }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .bp-glass { background:${C.raised}; border-color:${C.paper}; } }
.bp-btn { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
.bp-btn:active { transform: translate(2px,2px); box-shadow: 2px 2px 0 0 ${C.ink}; }
.bp-btn:focus-visible { outline: 3px solid ${C.yellow}; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .bp-pulse { animation: none; opacity: 0; }
  .bp-marker, .bp-shop svg, .bp-heading { transition: opacity .15s linear !important; }
}
.maplibregl-ctrl-attrib.maplibregl-compact { background: rgba(245,242,236,.75); }
.maplibregl-ctrl-attrib.maplibregl-compact-show { color: ${C.ink}; }
.maplibregl-map { background: ${C.land}; }
`;

export function GateGlyph({ size = 32 }: { size?: number }) {
  const { post, arm, stripes, stripeW } = GATE;
  return (
    <svg viewBox={`0 0 ${GATE.w} ${GATE.h}`} width={(size * GATE.w) / GATE.h} height={size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <rect x={post.x} y={post.y} width={post.w} height={post.h} fill={C.paper} stroke={C.ink} strokeWidth={2} />
      <rect x={arm.x} y={arm.y} width={arm.w} height={arm.h} fill={C.yellow} stroke={C.ink} strokeWidth={2} />
      {stripes.map((x) => (
        <rect key={x} x={x} y={arm.y} width={stripeW} height={arm.h} fill={C.ink} />
      ))}
    </svg>
  );
}

export function SocietyMarker({ label }: { label: string }) {
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="bp-plate" style={{ padding: '2px 8px', borderRadius: 4 }}>{label}</div>
      <GateGlyph />
    </div>
  );
}

export function ShopSign({ category, selected }: Pick<ShopPin, 'category' | 'selected'>) {
  const on = !!selected;
  const w = on ? SHOP.selW : SHOP.w;
  const h = on ? SHOP.selH : SHOP.h;
  const pad = 2;
  const extra = on ? SHOP.shadow : 0;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w + 2 * pad + extra} ${h + 2 * pad + extra}`}
      width={w + 2 * pad + extra}
      height={h + 2 * pad + extra}
      aria-hidden="true"
      style={{ display: 'block' }}>
      {on ? <rect x={SHOP.shadow} y={SHOP.shadow} width={w} height={h} rx={2} fill={C.paper} /> : null}
      <rect x={0} y={0} width={w} height={h} rx={2} fill={on ? C.yellow : C.paper} stroke={C.ink} strokeWidth={on ? 2.5 : 2} />
      <g transform={on ? `translate(${w / 2} ${h / 2}) scale(1.1) translate(${-SHOP.w / 2} ${-SHOP.h / 2})` : undefined}>
        <path d={SHOP_GLYPH[category]} fill="none" stroke={C.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function ShopMarker({ shop, onPress }: { shop: ShopPin; onPress?: () => void }) {
  const on = !!shop.selected;
  return (
    <div
      className="bp-marker bp-shop"
      role="button"
      tabIndex={onPress ? 0 : -1}
      aria-label={shop.name}
      aria-pressed={on}
      onClick={onPress}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPress?.()}
      title={shop.name}
      style={{ position: 'relative', padding: 6, margin: -6 }}>
      <ShopSign category={shop.category} selected={on} />
      {on ? (
        <div className="bp-plate" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: -2, padding: '1px 6px', borderRadius: 3 }}>
          {shop.name}
        </div>
      ) : null}
    </div>
  );
}

export function TierPlate({ tier }: { tier: RunnerPin['tier'] }) {
  if (!tier) return null;
  const t = TIER_PLATE[tier];
  return (
    <span className="bp-tier" style={{ background: t.bg }}>
      {t.label}
    </span>
  );
}

/** The runner disc as SVG, centred in a `box`×`box` square. */
export function RunnerDisc({ r, heading, box = 64 }: { r: RunnerPin; heading?: number; box?: number }) {
  const live = r.freshness === 'live';
  const letter = runnerInitial(r);
  const half = box / 2;
  return (
    <svg viewBox={`${-half} ${-half} ${box} ${box}`} width={box} height={box} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {!live ? <circle r={RUNNER.ring} fill="none" stroke={C.yellow} strokeWidth={2} strokeDasharray="4 4" /> : null}
      {heading !== undefined ? (
        <g className="bp-heading" style={{ transform: `rotate(${heading}deg)`, transition: 'transform .8s ease' }}>
          <path d={RUNNER.arrow} fill={C.yellow} stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />
        </g>
      ) : null}
      {live ? <circle cx={3} cy={3} r={RUNNER.r} fill={C.paper} /> : null}
      <circle r={RUNNER.r} fill={C.yellow} stroke={C.ink} strokeWidth={2.5} />
      {letter ? (
        <text y={5} textAnchor="middle" fontFamily={WEB_FONT.display} fontSize={13} fill={C.ink}>
          {letter}
        </text>
      ) : (
        <g fill="none" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d={RUNNER.bike} />
          {RUNNER.bikeWheels.map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r={RUNNER.wheelR} />
          ))}
        </g>
      )}
    </svg>
  );
}

export function RunnerMarker({ r, heading, onPress }: { r: RunnerPin; heading?: number; onPress?: () => void }) {
  const live = r.freshness === 'live';
  const h = r.heading ?? heading;
  const plate = r.focused ? runnerPlateText(r) : '';
  const label = [r.name ?? 'Runner', r.chip, live ? null : `last seen ${r.sub ?? ''}`].filter(Boolean).join(', ');
  return (
    <div
      className="bp-marker"
      role="button"
      tabIndex={onPress ? 0 : -1}
      aria-label={label}
      onClick={onPress}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPress?.()}
      style={{ position: 'relative', width: 64, height: 64 }}>
      {r.focused && live ? (
        <span
          style={{
            position: 'absolute', left: '50%', top: '50%', width: RUNNER.halo * 2, height: RUNNER.halo * 2, margin: -RUNNER.halo,
            borderRadius: 9999, background: 'rgba(255,180,0,.08)', border: '2px dashed rgba(255,180,0,.45)', boxSizing: 'border-box', pointerEvents: 'none',
          }}
        />
      ) : null}
      {live ? <span className="bp-pulse" /> : null}
      <div style={{ position: 'absolute', inset: 0, opacity: live ? 1 : 0.4, transition: 'opacity .6s ease' }}>
        <RunnerDisc r={r} heading={h} />
      </div>
      {plate || (r.focused && r.tier) ? (
        <div style={{ position: 'absolute', left: 32 + 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', opacity: live ? 1 : 0.85 }}>
          {plate ? <span className="bp-plate" style={{ padding: '2px 7px', borderRadius: 3 }}>{plate}</span> : null}
          <TierPlate tier={r.tier} />
        </div>
      ) : null}
    </div>
  );
}

export function GlassNote({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="bp-glass" style={{ padding: '6px 12px', borderRadius: 999, font: `700 13px/1.25 ${WEB_FONT.body700}`, ...style }}>
      {children}
    </div>
  );
}

export function GlassButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} className="bp-glass bp-btn" onClick={onPress}>
      {children}
    </button>
  );
}

export const LocateIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={C.paper} strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
    <circle cx={12} cy={12} r={7} />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={C.paper} strokeWidth={2.6} aria-hidden="true">
    <path d="M5 12h14M12 5v14" />
  </svg>
);
