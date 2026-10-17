/**
 * Web map: MapLibre GL via react-map-gl, OpenFreeMap "dark" vector tiles (no API key), re-coloured
 * on load to the brand basemap. Lazy-loaded by MapView.web.tsx so maplibre (~250 KB gz) never
 * blocks first paint.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import Map, { Layer, Marker, Source } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { Feature, LineString, Point } from 'geojson';
import { basemapPatch, DARK_STYLE_URL } from './basemap';
import type { StyleLayerLike } from './basemap';
import { C, GATE_POST_DX } from './glyphs';

/** Put the barrier's post (not the middle of the arm) on the gate coordinate. */
const GATE_OFFSET: [number, number] = [GATE_POST_DX, 0];
import { GlassButton, GlassNote, LocateIcon, MARKER_CSS, PlusIcon, RunnerMarker, ShopMarker, SocietyMarker } from './markers.web';
import { arc, boundsOf } from './types';
import type { MapPoint, MapViewProps } from './types';
import { useGlide } from './useGlide';

/** Re-colour every basemap layer to tokens.color.map. Each call guarded: styles change upstream. */
function applyBasemap(map: MaplibreMap) {
  let layers: StyleLayerLike[] = [];
  try {
    layers = (map.getStyle()?.layers ?? []) as StyleLayerLike[];
  } catch {
    return;
  }
  for (const layer of layers) {
    if (layer.id.startsWith('bp-')) continue;
    const { paint, layout } = basemapPatch(layer);
    for (const [k, v] of Object.entries(paint)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setPaintProperty(layer.id, k as any, v as any);
      } catch {
        /* property not valid for this layer */
      }
    }
    for (const [k, v] of Object.entries(layout)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setLayoutProperty(layer.id, k as any, v as any);
      } catch {
        /* ignore */
      }
    }
  }
}

type Line = Feature<LineString, { tone: string }>;
const lineOf = (pts: MapPoint[], tone: string): Line => ({
  type: 'Feature',
  properties: { tone },
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lng, p.lat]) },
});

export default function MapGL(props: MapViewProps) {
  const ref = useRef<MapRef>(null);
  const runners = props.runners ?? [];
  const glide = useGlide(runners.map((r) => ({ id: r.id, pos: r.pos })));
  const pad = { top: 60, bottom: 40, left: 40, right: 40, ...props.padding };
  const bounds = boundsOf(props.fit);

  const refit = (duration = 900) => {
    const b = boundsOf(props.fit);
    if (b) ref.current?.fitBounds(b, { padding: pad, duration, maxZoom: 16 });
  };

  useEffect(() => {
    refit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fitKey]);

  const routes = useMemo(() => {
    const features: Line[] = [];
    for (const r of props.routes ?? []) {
      const from = 'runner' in r.from ? glide[r.from.runner]?.pos : r.from;
      if (from) features.push(lineOf(arc(from, r.to), r.tone));
    }
    return { type: 'FeatureCollection' as const, features };
  }, [props.routes, glide]);

  const trail = useMemo(() => {
    const features: Feature<Point, { o: number }>[] = [];
    for (const r of runners) {
      const pts = r.trail ?? [];
      pts.forEach((p, i) =>
        features.push({ type: 'Feature', properties: { o: 0.2 + (0.6 * (i + 1)) / pts.length }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }),
      );
    }
    return { type: 'FeatureCollection' as const, features };
  }, [runners]);

  const noteTop = (props.notePlacement ?? 'top') === 'top';

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.land }}>
      <style>{MARKER_CSS}</style>
      <Map
        ref={ref}
        initialViewState={bounds ? { bounds, fitBoundsOptions: { padding: pad, maxZoom: 16 } } : { longitude: 77.7447, latitude: 12.975, zoom: 14 }}
        mapStyle={DARK_STYLE_URL}
        style={{ width: '100%', height: '100%', background: C.land }}
        attributionControl={{ compact: true }}
        onLoad={(e) => {
          applyBasemap(e.target);
          // Start with the compact (i) attribution collapsed so it never covers our corner chips.
          const attrib = e.target.getContainer().querySelector('.maplibregl-ctrl-attrib');
          attrib?.classList.remove('maplibregl-compact-show');
          attrib?.removeAttribute('open');
        }}
        dragRotate={false}
        pitchWithRotate={false}
        touchZoomRotate
        cooperativeGestures={false}>
        <Source id="bp-routes" type="geojson" data={routes}>
          <Layer
            id="bp-route-casing"
            type="line"
            filter={['==', ['get', 'tone'], 'primary']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': C.ink, 'line-width': 7 }}
          />
          <Layer
            id="bp-route-line"
            type="line"
            layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
            paint={{
              'line-color': C.yellow,
              'line-width': ['match', ['get', 'tone'], 'primary', 4, 2.5],
              'line-opacity': ['match', ['get', 'tone'], 'primary', 1, 0.45],
              'line-dasharray': [2.5, 2],
            }}
          />
        </Source>
        <Source id="bp-trail" type="geojson" data={trail}>
          <Layer
            id="bp-trail-dots"
            type="circle"
            paint={{
              'circle-radius': 3.5,
              'circle-color': C.yellow,
              'circle-opacity': ['get', 'o'],
              'circle-stroke-color': C.ink,
              'circle-stroke-width': 1.5,
              'circle-stroke-opacity': ['get', 'o'],
            }}
          />
        </Source>
        {(props.shops ?? []).map((s) => (
          <Marker key={s.id} longitude={s.pos.lng} latitude={s.pos.lat} anchor="center" style={{ zIndex: s.selected ? 2 : 1 }}>
            <ShopMarker shop={s} onPress={props.onShopPress ? () => props.onShopPress?.(s.id) : undefined} />
          </Marker>
        ))}
        {props.society ? (
          <Marker longitude={props.society.pos.lng} latitude={props.society.pos.lat} anchor="bottom" offset={GATE_OFFSET} style={{ zIndex: 2 }}>
            <SocietyMarker label={props.society.label} />
          </Marker>
        ) : null}
        {runners.map((r) => {
          const g = glide[r.id] ?? { pos: r.pos };
          return (
            <Marker key={r.id} longitude={g.pos.lng} latitude={g.pos.lat} anchor="center" style={{ zIndex: r.focused ? 4 : 3 }}>
              <RunnerMarker r={r} heading={g.heading} onPress={props.onRunnerPress ? () => props.onRunnerPress?.(r.id) : undefined} />
            </Marker>
          );
        })}
      </Map>
      {props.note ? (
        <GlassNote style={{ position: 'absolute', left: 12, ...(noteTop ? { top: 12 } : { bottom: 12 }), maxWidth: props.controls ? 'calc(100% - 96px)' : 'calc(100% - 36px)' }}>
          {props.note}
        </GlassNote>
      ) : null}
      {props.controls ? (
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <GlassButton label="Locate me" onPress={() => refit(600)}>
            <LocateIcon />
          </GlassButton>
          <GlassButton label="Zoom in" onPress={() => ref.current?.zoomIn({ duration: 300 })}>
            <PlusIcon />
          </GlassButton>
        </div>
      ) : null}
    </div>
  );
}
