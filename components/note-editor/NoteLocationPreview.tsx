import React, { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MAP_STYLE_OPTIONS } from '../../constants';
import { hasNavigableGpsCoords } from '../../utils/map/openExternalNavigation';
import { reverseGeocodeLabel } from '../../utils/map/overpass';
import { buildMapNoteIconModel } from '../../utils/map/createMapNoteIcon';

interface NoteLocationPreviewProps {
  coords?: { lat: number; lng: number };
  themeColor: string;
  mapStyleId?: string;
  onOpenMap?: () => void;
  /** 嵌入带标题的画布窗口时由外层控制高宽。 */
  className?: string;
}

const PREVIEW_ZOOM = 14;
/** 小预览切到完整地图时，用更大的目标视口承接同一片区域，避免落入默认 19 级近景。 */
export const NOTE_LOCATION_NAVIGATION_ZOOM = 16;
const TILE_SIZE = 256;
const LOCATION_LABEL_TIMEOUT_MS = 5000;

const clampLatitude = (latitude: number) => Math.max(-85.05112878, Math.min(85.05112878, latitude));

function tilePosition(coords: { lat: number; lng: number }) {
  const scale = 2 ** PREVIEW_ZOOM;
  const latitude = (clampLatitude(coords.lat) * Math.PI) / 180;
  return {
    x: ((coords.lng + 180) / 360) * scale,
    y: ((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * scale,
    scale
  };
}

function tileUrl(template: string, x: number, y: number) {
  return template
    .replace('{s}', 'a')
    .replace('{z}', String(PREVIEW_ZOOM))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Table 画布中的位置摘要：只绘制覆盖当前位置的九宫格瓦片，
 * 不创建第二个 Leaflet 实例，也不接管画布的平移/缩放手势。
 */
export const NoteLocationPreview: React.FC<NoteLocationPreviewProps> = ({
  coords,
  themeColor,
  mapStyleId = 'carto-light-nolabels',
  onOpenMap,
  className
}) => {
  const hasLocation = hasNavigableGpsCoords(coords);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const mapStyle = MAP_STYLE_OPTIONS.find((style) => style.id === mapStyleId) ?? MAP_STYLE_OPTIONS[2];
  const markerModel = useMemo(
    () => buildMapNoteIconModel(
      {
        text: '',
        images: [],
        imageRefs: [],
        media: [],
        emoji: '',
        isFavorite: false
      },
      { themeColor, pinSize: 1 }
    ),
    [themeColor]
  );

  useEffect(() => {
    let active = true;
    if (!coords || !hasLocation) {
      setLocationLabel(null);
      return () => {
        active = false;
      };
    }
    setLocationLabel(null);
    const timeout = window.setTimeout(() => {
      active = false;
      setLocationLabel(null);
    }, LOCATION_LABEL_TIMEOUT_MS);
    void reverseGeocodeLabel(coords.lat, coords.lng).then((label) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setLocationLabel(label?.trim() || null);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [coords?.lat, coords?.lng, hasLocation]);
  const tiles = useMemo(() => {
    if (!coords || !hasLocation || mapStyle.id === 'blank') return [];
    const position = tilePosition(coords);
    const startX = Math.floor(position.x) - 1;
    const startY = Math.floor(position.y) - 1;

    return Array.from({ length: 9 }, (_, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const rawX = startX + col;
      const rawY = startY + row;
      const x = ((rawX % position.scale) + position.scale) % position.scale;
      const y = Math.max(0, Math.min(position.scale - 1, rawY));
      return {
        id: `${rawX}-${rawY}`,
        src: tileUrl(mapStyle.url, x, y),
        left: `calc(50% + ${(rawX - position.x) * TILE_SIZE}px)`,
        top: `calc(50% + ${(rawY - position.y) * TILE_SIZE}px)`
      };
    });
  }, [coords?.lat, coords?.lng, hasLocation, mapStyle.id, mapStyle.url]);

  if (!hasLocation) {
    return (
      <section
        className={`chrome-inset relative aspect-square w-full overflow-hidden rounded-xl ${className ?? ''}`}
        aria-label="地理位置预览：未定位"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/35 text-gray-400 shadow-sm dark:bg-black/10">
            <MapPin size={19} strokeWidth={1.8} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-gray-700">未定位</p>
            <p className="mt-0.5 text-xs text-gray-400">在 Mapping 中放置此点</p>
          </div>
        </div>
      </section>
    );
  }

  const content = (
    <>
      <div className="absolute inset-0 bg-[#e5e7eb]" aria-hidden />
      {tiles.map((tile) => (
        <img
          key={tile.id}
          src={tile.src}
          alt=""
          draggable={false}
          className="absolute h-64 w-64 max-w-none select-none"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" aria-hidden />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 block"
        style={{
          width: markerModel.size[0],
          height: markerModel.size[1],
          transform: `translate(-${markerModel.anchor[0]}px, -${markerModel.anchor[1]}px)`
        }}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: markerModel.html }}
      />
      {locationLabel ? (
        <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm">
          {locationLabel}
        </span>
      ) : null}
    </>
  );

  return onOpenMap ? (
    <button
      type="button"
      className={`relative block aspect-square w-full overflow-hidden rounded-xl text-left transition-transform duration-200 hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chrome-fg-strong)] ${className ?? ''}`}
      onClick={onOpenMap}
      title="在 Mapping 中查看此位置"
      aria-label="在 Mapping 中查看此位置"
    >
      {content}
    </button>
  ) : (
    <section className={`relative aspect-square w-full overflow-hidden rounded-xl ${className ?? ''}`} aria-label="地理位置预览">
      {content}
    </section>
  );
};
