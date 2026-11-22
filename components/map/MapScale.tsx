import React, { useCallback, useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

const TARGET_WIDTH_PX = 100;

function floorNiceDistance(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(meters));
  const normalized = meters / power;
  const factor = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return factor * power;
}

function distanceLabel(meters: number): string {
  if (meters >= 1000) return `${meters / 1000} km`;
  return `${Math.round(meters)} m`;
}

/** 只有刻度线和文字的顶部中央比例尺。 */
export const MapScale: React.FC<{ color?: string }> = ({ color = '#111827' }) => {
  const map = useMap();
  const [scale, setScale] = useState({ width: TARGET_WIDTH_PX, label: '' });

  const update = useCallback(() => {
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const center = size.divideBy(2);
    const left = map.containerPointToLatLng([center.x - TARGET_WIDTH_PX / 2, center.y]);
    const right = map.containerPointToLatLng([center.x + TARGET_WIDTH_PX / 2, center.y]);
    const metersAcrossTarget = map.distance(left, right);
    const meters = floorNiceDistance(metersAcrossTarget);
    if (!meters) return;
    setScale({
      width: Math.max(1, (meters / metersAcrossTarget) * TARGET_WIDTH_PX),
      label: distanceLabel(meters)
    });
  }, [map]);

  useEffect(() => {
    update();
    map.on('moveend zoomend resize', update);
    return () => {
      map.off('moveend zoomend resize', update);
    };
  }, [map, update]);

  if (!scale.label) return null;
  return (
    <div
      className="ui-workspace-safe-top pointer-events-none fixed left-1/2 z-[var(--z-map-toolbar)] flex -translate-x-1/2 flex-col items-center"
      style={{ color }}
      aria-label={`地图比例尺 ${scale.label}`}
    >
      <div style={{ width: scale.width, borderTop: '1px solid currentColor' }} />
      <span className="mt-1 text-xs leading-none">{scale.label}</span>
    </div>
  );
};

