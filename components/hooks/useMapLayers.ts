import { useState, useEffect, useMemo, useRef } from 'react';
import { Note, Frame } from '../../types';

interface UseMapLayersProps {
  notes: Note[];
  projectFrames: Frame[] | undefined;
}

export const useMapLayers = ({ notes, projectFrames }: UseMapLayersProps) => {
  // Frame layer visibility state
  const [frameLayerVisibility, setFrameLayerVisibility] = useState<Record<string, boolean>>({});
  const [showAllFrames, setShowAllFrames] = useState(true); // Default to show all
  const [showFrameLayerPanel, setShowFrameLayerPanel] = useState(false);
  const frameLayerRef = useRef<HTMLDivElement>(null);

  // Initialize frame layer visibility when project frames change
  useEffect(() => {
    if (projectFrames) {
      const newVisibility: Record<string, boolean> = {};
      let hasChanges = false;

      projectFrames.forEach(frame => {
        if (!(frame.id in frameLayerVisibility)) {
          newVisibility[frame.id] = true; // Default to visible
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setFrameLayerVisibility(prev => ({ ...prev, ...newVisibility }));
      }
    }
  }, [projectFrames, frameLayerVisibility]);

  // 必须用捕获阶段：MapControls 会在容器上 capture + stopPropagation，
  // 冒泡 mousedown 到不了 document，点定位/新建时图层不会关。设置面板同理。
  useEffect(() => {
    if (!showFrameLayerPanel) return;
    const handlePointerDownCapture = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (frameLayerRef.current?.contains(target)) return;
      if (target instanceof Element) {
        // MapLayerControl / ProjectNotesLayerPanel / 颜色与时间浮层均可能 portal 到 body
        if (
          target.closest('[data-map-layer-chrome-panel]') ||
          target.closest('[data-graph-top-left-panel]') ||
          target.closest('[data-tag-add-panel]') ||
          target.closest('[data-note-time-range-panel]')
        ) {
          return;
        }
      }
      setShowFrameLayerPanel(false);
    };
    document.addEventListener('pointerdown', handlePointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', handlePointerDownCapture, true);
  }, [showFrameLayerPanel]);

  // Filter notes based on frame layer visibility
  const getFilteredNotes = useMemo(() => {
    if (!projectFrames || projectFrames.length === 0) {
      return notes; // No frames, show all notes
    }

    // If show all is enabled, show all notes
    if (showAllFrames) {
      return notes;
    }

    return notes.filter(note => {
      // If note has no frame associations, hide it when Show All is disabled
      if (!note.groupIds || note.groupIds.length === 0) {
        return false; // Hide notes without frame associations when filtering is active
      }

      // Show note if any of its associated frames are visible (OR logic)
      return note.groupIds.some(frameId => frameLayerVisibility[frameId] !== false);
    });
  }, [notes, projectFrames, frameLayerVisibility, showAllFrames]);

  return {
    frameLayerVisibility,
    setFrameLayerVisibility,
    showAllFrames,
    setShowAllFrames,
    showFrameLayerPanel,
    setShowFrameLayerPanel,
    frameLayerRef,
    getFilteredNotes
  };
};






