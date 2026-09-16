import React, { useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap, LeafletMouseEvent, DragEndEvent } from 'leaflet';
import type { Note } from '../../../types';
import { NoteMarker } from '../markers/NoteMarker';
import type { Coordinates } from '../../../types';
import {
  lngWrapOffsetsForBounds,
  primaryWrapOffsetForCenter
} from '../../../utils/map/lngWorldWrap';

export interface ClusterResult {
  notes: Note[];
  position: [number, number];
}

interface ClusterMarkerLayerProps {
  clusteredMarkers: ClusterResult[];
  fallbackNotes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  themeColor: string;
  mapInstance: LeafletMap | null;
  onMarkerClick: (note: Note, e?: LeafletMouseEvent) => void;
  onClusterClick: (clusterNotes: Note[], e?: LeafletMouseEvent) => void;
  /** 仅对未聚合的单 pin 生效：hover 时回调，用于显示临时 label（及 tab 预览） */
  onMarkerHover?: (note: Note | null) => void;
  selectedNoteId?: string | null;
  /** 多选时凡在集合内的 pin 可拖（与 label 展示集合一致） */
  selectedNoteIds?: ReadonlySet<string> | null;
  isPreviewMode?: boolean;
  isEditMode?: boolean;
  onMarkerDragEnd?: (note: Note, e: DragEndEvent) => void;
  onMarkerDrag?: (note: Note, e: any) => void;
  onMarkerLongPressDragStart?: (note: Note) => void;
  onMarkerLongPressDrag?: (note: Note, latLng: L.LatLng) => void;
  onMarkerLongPressDragEnd?: (note: Note, latLng: L.LatLng) => void;
  // marker 拖拽乐观坐标覆盖
  noteCoordOverrides?: Record<string, Coordinates>;
  /** 图层面板叠放序：序号越大越在上层（与同视图 sortNotesByLayerStack 一致） */
  noteStackRank?: ReadonlyMap<string, number>;
  /** 删除动画尚未提交数据时，保持该图钉在地图上的收缩状态。 */
  deletingNoteIds?: ReadonlySet<string>;
  /** 新建草稿进入编辑器前后的图钉动效；点位本身已写入项目，而非另画一个临时 pin。 */
  noteMotionById?: Readonly<Record<string, 'enter' | 'settle' | 'exit'>>;
}

function ClusterMarkerLayerInner({
  clusteredMarkers,
  fallbackNotes,
  showTextLabels,
  pinSize,
  themeColor,
  mapInstance,
  onMarkerClick,
  onClusterClick,
  onMarkerHover,
  selectedNoteId,
  selectedNoteIds = null,
  isPreviewMode = false,
  isEditMode = false,
  onMarkerDragEnd,
  onMarkerDrag,
  onMarkerLongPressDragStart,
  onMarkerLongPressDrag,
  onMarkerLongPressDragEnd,
  noteCoordOverrides = {},
  noteStackRank,
  deletingNoteIds,
  noteMotionById
}: ClusterMarkerLayerProps) {
  const map = useMap();
  const [, bump] = useState(0);
  const rafRef = useRef<number | null>(null);
  // 退出动画期间不能让异步聚类结果把 fallback pin 重挂为 cluster pin，
  // 否则同一个 note 会从头再播放一次 exit。
  const frozenClustersRef = useRef<ClusterResult[] | null>(null);
  /** Native Leaflet pinch emits `move` for every touch frame. React must not
   * reconcile markers in that loop: Leaflet already transforms them visually. */
  const isGestureZoomingRef = useRef(false);

  useMapEvents({
    zoomstart: () => {
      isGestureZoomingRef.current = true;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    zoomend: () => {
      isGestureZoomingRef.current = false;
      if (map._mappSmoothZooming || map._animatingZoom || map._mappZoomCommitGuard) return;
      bump((n) => n + 1);
    },
    moveend: () => {
      if (map._mappSmoothZooming || map._animatingZoom || map._mappZoomCommitGuard) return;
      bump((n) => n + 1);
    },
    // @ts-expect-error custom event from smoothMapZoom commit
    mappzoomcommitdone: () => bump((n) => n + 1),
    move: () => {
      // Native pinch also sends `move` every frame. Let Leaflet own the visual
      // transform until zoomend; rerendering here re-projects every DivIcon and
      // visibly fights the tile/marker transform on mobile.
      if (
        isGestureZoomingRef.current ||
        map._mappSmoothZooming ||
        map._animatingZoom ||
        map._mappZoomCommitGuard
      ) {
        return;
      }
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        bump((n) => n + 1);
      });
    }
  });

  if (!mapInstance || !map) return null;

  const freezeClusterLayout = (deletingNoteIds?.size ?? 0) > 0;
  if (freezeClusterLayout && frozenClustersRef.current === null) {
    frozenClustersRef.current = clusteredMarkers;
  } else if (!freezeClusterLayout) {
    frozenClustersRef.current = null;
  }
  const activeNoteIds = new Set(fallbackNotes.map((note) => note.id));
  // useMapClustering 在下一帧才会更新；在此之前不允许旧结果把已移除的点重新画出来。
  const renderClusters = (frozenClustersRef.current ?? clusteredMarkers)
    .map((cluster) => {
      const notes = cluster.notes.filter((note) => activeNoteIds.has(note.id));
      if (notes.length === 0) return null;
      if (notes.length === cluster.notes.length) return cluster;
      return {
        notes,
        position: [notes[0]!.coords.lat, notes[0]!.coords.lng] as [number, number]
      };
    })
    .filter((cluster): cluster is ClusterResult => cluster !== null);

  const b = map.getBounds();
  const west = b.getWest();
  const east = b.getEast();
  const cLng = map.getCenter().lng;

  const zBoost = (note: Note) => (note.isFavorite ? 200 : 0) + (noteStackRank?.get(note.id) ?? 0) * 2;

  const pinDraggable = (noteId: string) =>
    !isPreviewMode &&
    isEditMode &&
    ((selectedNoteIds != null && selectedNoteIds.size > 0 && selectedNoteIds.has(noteId)) ||
      selectedNoteId === noteId);

  const pinLongPressDraggable = (noteId: string) =>
    !isPreviewMode &&
    !isEditMode &&
    ((selectedNoteIds != null && selectedNoteIds.size > 0 && selectedNoteIds.has(noteId)) ||
      selectedNoteId === noteId);

  const wrapKs = (lng: number) => {
    const ks = lngWrapOffsetsForBounds(lng, west, east);
    return ks.length ? ks : [0];
  };

  if (renderClusters.length > 0) {
    return (
      <>
        {renderClusters.map((cluster) => {
          if (cluster.notes.length === 1) {
            const note = cluster.notes[0]!;
            const override = noteCoordOverrides[note.id];
            const lat = override ? override.lat : cluster.position[0]!;
            const lng = override ? override.lng : cluster.position[1]!;
            const ks = wrapKs(lng);
            const primaryK = primaryWrapOffsetForCenter(lng, cLng, ks);
            return ks.map((k) => (
              <NoteMarker
                key={`${note.id}~w${k}`}
                note={note}
                position={[lat, lng + 360 * k]}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={zBoost(note)}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onMarkerClick(note, e);
                }}
                onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
                onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
                draggable={pinDraggable(note.id) && k === primaryK}
                onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
                onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
                longPressDragEnabled={pinLongPressDraggable(note.id) && k === primaryK}
                onLongPressDragStart={
                  onMarkerLongPressDragStart ? () => onMarkerLongPressDragStart(note) : undefined
                }
                onLongPressDrag={
                  onMarkerLongPressDrag ? (latLng) => onMarkerLongPressDrag(note, latLng) : undefined
                }
                onLongPressDragEnd={
                  onMarkerLongPressDragEnd
                    ? (latLng) => onMarkerLongPressDragEnd(note, latLng)
                    : undefined
                }
                motion={deletingNoteIds?.has(note.id) ? 'exit' : noteMotionById?.[note.id]}
              />
            ));
          } else {
            const clusterKey = cluster.notes.map((n) => n.id).sort().join('-');
            const topNote = [...cluster.notes].sort(
              (a, b) => (noteStackRank?.get(b.id) ?? 0) - (noteStackRank?.get(a.id) ?? 0)
            )[0]!;
            const clusterZ = Math.max(...cluster.notes.map((n) => zBoost(n)));
            const [lat, lng] = cluster.position;
            const ks = wrapKs(lng);
            return ks.map((k) => (
              <NoteMarker
                key={`cluster-${clusterKey}~w${k}`}
                note={topNote}
                position={[lat, lng + 360 * k]}
                clusterCount={cluster.notes.length}
                showTextLabels={showTextLabels}
                pinSize={pinSize}
                themeColor={themeColor}
                zIndexOffset={clusterZ}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onClusterClick(cluster.notes, e);
                }}
                motion={deletingNoteIds?.has(topNote.id) ? 'exit' : noteMotionById?.[topNote.id]}
              />
            ));
          }
        })}
      </>
    );
  }

  return (
    <>
      {fallbackNotes.map((note) => {
        const override = noteCoordOverrides[note.id];
        const lat = override?.lat ?? note.coords.lat;
        const lng = override?.lng ?? note.coords.lng;
        const ks = wrapKs(lng);
        const primaryK = primaryWrapOffsetForCenter(lng, cLng, ks);
        return ks.map((k) => (
          <NoteMarker
            key={`${note.id}~w${k}`}
            note={note}
            position={[lat, lng + 360 * k]}
            showTextLabels={showTextLabels}
            pinSize={pinSize}
            themeColor={themeColor}
            zIndexOffset={zBoost(note)}
            onClick={(e) => {
              e.originalEvent?.stopPropagation();
              e.originalEvent?.stopImmediatePropagation();
              onMarkerClick(note, e);
            }}
            onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
            onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
            draggable={pinDraggable(note.id) && k === primaryK}
            onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
            onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
            longPressDragEnabled={pinLongPressDraggable(note.id) && k === primaryK}
            onLongPressDragStart={
              onMarkerLongPressDragStart ? () => onMarkerLongPressDragStart(note) : undefined
            }
            onLongPressDrag={
              onMarkerLongPressDrag ? (latLng) => onMarkerLongPressDrag(note, latLng) : undefined
            }
            onLongPressDragEnd={
              onMarkerLongPressDragEnd
                ? (latLng) => onMarkerLongPressDragEnd(note, latLng)
                : undefined
            }
            motion={deletingNoteIds?.has(note.id) ? 'exit' : noteMotionById?.[note.id]}
          />
        ));
      })}
    </>
  );
}

export const ClusterMarkerLayer = React.memo(ClusterMarkerLayerInner) as React.FC<ClusterMarkerLayerProps>;
