import { lazy, Suspense } from 'react';
import { View } from 'react-native';
import { MapSkeleton } from './MapSkeleton';
import type { MapViewProps } from './types';

const MapGL = lazy(() => import('./MapGL.web'));

/** Web: MapLibre GL, code-split so the map never delays first paint. */
export function MapView(props: MapViewProps) {
  return (
    <View style={[{ overflow: 'hidden', position: 'relative' }, props.style]}>
      <Suspense fallback={<MapSkeleton />}>
        <MapGL {...props} />
      </Suspense>
    </View>
  );
}
