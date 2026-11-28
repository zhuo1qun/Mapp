import React, { useLayoutEffect, useRef, useState } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap, LeafletMouseEvent, DragEndEvent } from 'leaflet';
import type { Note } from '../../../types';
import { NoteMarker } from '../markers/NoteMarker';
import type { Coordinates } from '../../../types';
import {
  lngWrapOffsetsForBounds,
  primaryWrapOffsetForCenter
} from '../../../utils/map/lngWorldWrap';
import { selectClusterRepresentative } from '../../../utils/map/clusterRepresentative';

export interface ClusterResult {
  notes: Note[];
  position: [number, number];
}

type ClusterPathTransition = {
  token: number;
  paths: Array<{
    note: Note;
    from: [number, number];
    to: [number, number];
    targetGroupKey: string;
  }>;
  targetGroupKeys: ReadonlySet<string>;
};

function visualGroupKey(cluster: ClusterResult): string {
  return cluster.notes.map((note) => note.id).sort().join('|');
}

function visualLayout(clusters: ClusterResult[]) {
  const layout = new Map<
    string,
    { note: Note; position: [number, number]; groupKey: string }
  >();
  clusters.forEach((cluster) => {
    const groupKey = visualGroupKey(cluster);
    cluster.notes.forEach((note) => {
      layout.set(note.id, { note, position: cluster.position, groupKey });
    });
  });
  return layout;
}

interface ClusterMarkerLayerProps {
  clusteredMarkers: ClusterResult[];
  fallbackNotes: Note[];
  showTextLabels: boolean;
  pinSize: number;
  imageSize: number;
  showMedia: boolean;
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
  /** Playground 等受限数据源可按单条记录控制拖动权限。 */
  canEditNote?: (note: Note) => boolean;
  onMarkerDragEnd?: (note: Note, e: DragEndEvent) => void;
  onMarkerDrag?: (note: Note, e: any) => void;
  onMarkerLongPressDragStart?: (note: Note) => void;
  onMarkerLongPressDrag?: (note: Note, latLng: L.LatLng, pointer: { clientX: number; clientY: number }) => void;
  onMarkerLongPressDragEnd?: (note: Note, latLng: L.LatLng, pointer: { clientX: number; clientY: number }) => void;
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
  imageSize,
  showMedia,
  themeColor,
  mapInstance,
  onMarkerClick,
  onClusterClick,
  onMarkerHover,
  selectedNoteId,
  selectedNoteIds = null,
  isPreviewMode = false,
  isEditMode = false,
  canEditNote,
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
  const previousClustersRef = useRef<ClusterResult[] | null>(null);
  const clusterPathTimerRef = useRef<number | null>(null);
  const clusterPathTokenRef = useRef(0);
  const [clusterPathTransition, setClusterPathTransition] = useState<ClusterPathTransition | null>(null);

  useLayoutEffect(() => {
    const previous = previousClustersRef.current;
    previousClustersRef.current = clusteredMarkers;
    if (clusterPathTimerRef.current != null) {
      window.clearTimeout(clusterPathTimerRef.current);
      clusterPathTimerRef.current = null;
    }
    if (
      !previous ||
      !map.getContainer().classList.contains('map-cluster-settling') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setClusterPathTransition(null);
      return;
    }

    const before = visualLayout(previous);
    const after = visualLayout(clusteredMarkers);
    const paths: ClusterPathTransition['paths'] = [];
    const targetGroupKeys = new Set<string>();
    after.forEach((target, noteId) => {
      const source = before.get(noteId);
      if (!source || source.groupKey === target.groupKey) return;
      paths.push({
        note: target.note,
        from: source.position,
        to: target.position,
        targetGroupKey: target.groupKey
      });
      targetGroupKeys.add(target.groupKey);
    });
    if (paths.length === 0) {
      setClusterPathTransition(null);
      return;
    }

    const maxAnimatedMembers = 96;
    const animatedPaths =
      paths.length <= maxAnimatedMembers
        ? paths
        : paths.filter((_, index) => index % Math.ceil(paths.length / maxAnimatedMembers) === 0);
    const transition: ClusterPathTransition = {
      token: ++clusterPathTokenRef.current,
      paths: animatedPaths,
      targetGroupKeys
    };
    setClusterPathTransition(transition);
    clusterPathTimerRef.current = window.setTimeout(() => {
      setClusterPathTransition((current) =>
        current?.token === transition.token ? null : current
      );
      clusterPathTimerRef.current = null;
    }, 340);
    return () => {
      if (clusterPathTimerRef.current != null) {
        window.clearTimeout(clusterPathTimerRef.current);
        clusterPathTimerRef.current = null;
      }
    };
  }, [clusteredMarkers, map]);

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

  // 编辑态下，已单独渲染的 pin 没有「误拖整组」的风险，允许直接拖动。
  // 真正的 cluster 不会走到这个分支；点击聚合只负责导航，拆开后的独立 pin 才可拖动。
  const pinDraggable = (note: Note) => !isPreviewMode && isEditMode && (canEditNote?.(note) ?? true);

  const pinLongPressDraggable = (note: Note) =>
    !isPreviewMode &&
    !isEditMode &&
    (canEditNote?.(note) ?? true) &&
    ((selectedNoteIds != null && selectedNoteIds.size > 0 && selectedNoteIds.has(note.id)) ||
      selectedNoteId === note.id);

  const pinSelected = (note: Note) =>
    selectedNoteId === note.id || !!selectedNoteIds?.has(note.id);

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
            const groupKey = visualGroupKey(cluster);
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
                imageSize={imageSize}
                showMedia={showMedia}
                themeColor={themeColor}
                selected={pinSelected(note)}
                clusterPathReveal={clusterPathTransition?.targetGroupKeys.has(groupKey)}
                zIndexOffset={zBoost(note)}
                onClick={(e) => {
                  e.originalEvent?.stopPropagation();
                  e.originalEvent?.stopImmediatePropagation();
                  onMarkerClick(note, e);
                }}
                onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
                onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
                draggable={pinDraggable(note) && k === primaryK}
                onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
                onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
                longPressDragEnabled={pinLongPressDraggable(note) && k === primaryK}
                onLongPressDragStart={
                  onMarkerLongPressDragStart ? () => onMarkerLongPressDragStart(note) : undefined
                }
                onLongPressDrag={
                  onMarkerLongPressDrag ? (latLng, pointer) => onMarkerLongPressDrag(note, latLng, pointer) : undefined
                }
                onLongPressDragEnd={
                  onMarkerLongPressDragEnd
                    ? (latLng, pointer) => onMarkerLongPressDragEnd(note, latLng, pointer)
                    : undefined
                }
                motion={deletingNoteIds?.has(note.id) ? 'exit' : noteMotionById?.[note.id]}
              />
            ));
          } else {
            const clusterKey = cluster.notes.map((n) => n.id).sort().join('-');
            const groupKey = visualGroupKey(cluster);
            const topNote = selectClusterRepresentative(
              cluster.notes,
              noteStackRank,
              showMedia
            );
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
                imageSize={imageSize}
                showMedia={showMedia}
                themeColor={themeColor}
                selected={cluster.notes.some(pinSelected)}
                clusterPathReveal={clusterPathTransition?.targetGroupKeys.has(groupKey)}
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
        {clusterPathTransition?.paths.map((path) => (
          <NoteMarker
            key={`cluster-path-${clusterPathTransition.token}-${path.note.id}`}
            note={path.note}
            position={path.to}
            showTextLabels={false}
            pinSize={pinSize}
            imageSize={imageSize}
            showMedia={showMedia}
            themeColor={themeColor}
            zIndexOffset={10000 + zBoost(path.note)}
            interactive={false}
            selected={false}
            onClick={() => {}}
            clusterPathFrom={path.from}
            clusterPathGhost
          />
        ))}
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
            imageSize={imageSize}
            showMedia={showMedia}
            themeColor={themeColor}
            selected={pinSelected(note)}
            zIndexOffset={zBoost(note)}
            onClick={(e) => {
              e.originalEvent?.stopPropagation();
              e.originalEvent?.stopImmediatePropagation();
              onMarkerClick(note, e);
            }}
            onMouseEnter={onMarkerHover ? () => onMarkerHover(note) : undefined}
            onMouseLeave={onMarkerHover ? () => onMarkerHover(null) : undefined}
            draggable={pinDraggable(note) && k === primaryK}
            onDragEnd={onMarkerDragEnd ? (e) => onMarkerDragEnd(note, e) : undefined}
            onDrag={onMarkerDrag ? (e) => onMarkerDrag(note, e) : undefined}
            longPressDragEnabled={pinLongPressDraggable(note) && k === primaryK}
            onLongPressDragStart={
              onMarkerLongPressDragStart ? () => onMarkerLongPressDragStart(note) : undefined
            }
            onLongPressDrag={
              onMarkerLongPressDrag ? (latLng, pointer) => onMarkerLongPressDrag(note, latLng, pointer) : undefined
            }
            onLongPressDragEnd={
              onMarkerLongPressDragEnd
                ? (latLng, pointer) => onMarkerLongPressDragEnd(note, latLng, pointer)
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
