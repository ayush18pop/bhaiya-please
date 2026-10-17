/**
 * Brand basemap: OpenFreeMap "dark" re-coloured to tokens.color.map. One rule set, used by web
 * (setPaintProperty on load) and native (patched style JSON).
 */
import { C } from './glyphs';

export const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface StyleLayerLike {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

/** `null` = remove the property (fall back to the spec default). */
export interface LayerPatch {
  paint: Record<string, unknown>;
  layout: Record<string, unknown>;
}

const MAJOR = /motorway|trunk|primary|secondary|major|runway/;
const MINOR = /minor|tertiary|street|service|track|path|pier|taxiway|highway|road|bridge|tunnel|link/;

export function basemapPatch(layer: StyleLayerLike): LayerPatch {
  const id = layer.id.toLowerCase();
  const paint: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};
  switch (layer.type) {
    case 'background':
      paint['background-color'] = C.land;
      break;
    case 'fill':
      if (/water|ocean|lake/.test(id)) {
        paint['fill-color'] = C.water;
        paint['fill-opacity'] = 1;
      } else if (/road|pier|bridge/.test(id)) {
        paint['fill-color'] = C.minorRoad;
      } else if (/building/.test(id)) {
        paint['fill-color'] = C.landAlt;
        paint['fill-outline-color'] = C.landAlt;
      } else {
        // landuse, landcover, parks, wood, aeroway areas: a hair lighter than land, no texture.
        paint['fill-color'] = C.landAlt;
        paint['fill-opacity'] = 1;
        if (layer.paint && 'fill-pattern' in layer.paint) paint['fill-pattern'] = null;
      }
      break;
    case 'line':
      if (/water|river|canal|stream/.test(id)) paint['line-color'] = C.water;
      else if (/boundary|admin/.test(id)) {
        paint['line-color'] = C.border;
        paint['line-opacity'] = 0.5;
      } else if (/rail|transit/.test(id)) paint['line-color'] = /dash/.test(id) ? C.land : '#22221F';
      else if (MAJOR.test(id)) {
        paint['line-color'] = C.majorRoad;
        paint['line-opacity'] = 1;
      } else if (MINOR.test(id)) {
        paint['line-color'] = C.minorRoad;
        paint['line-opacity'] = /path/.test(id) ? 0.7 : 1;
      }
      break;
    case 'symbol':
      paint['text-color'] = C.labels;
      paint['text-halo-color'] = C.land;
      paint['text-halo-width'] = 1.5;
      paint['text-halo-blur'] = 0;
      // No POI icons, oneway arrows or place dots: our markers are the only icons on the map.
      paint['icon-opacity'] = 0;
      if (/poi/.test(id)) layout.visibility = 'none';
      break;
    case 'raster':
    case 'hillshade':
      layout.visibility = 'none';
      break;
  }
  return { paint, layout };
}

/** Returns a copy of a style JSON with every layer patched. */
export function patchStyle<S extends { layers: StyleLayerLike[] }>(style: S): S {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const { paint, layout } = basemapPatch(layer);
      const p: Record<string, unknown> = { ...layer.paint };
      const l: Record<string, unknown> = { ...layer.layout };
      for (const [k, v] of Object.entries(paint)) if (v === null) delete p[k]; else p[k] = v;
      for (const [k, v] of Object.entries(layout)) if (v === null) delete l[k]; else l[k] = v;
      return { ...layer, paint: p, layout: l };
    }),
  };
}
