import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, X } from 'lucide-react';
import { computeAnchoredPanelPlacement } from '../ui/anchoredPanelPlacement';
import {
  NOTE_EDITOR_ADD_PILL_ACTIVE,
  NOTE_EDITOR_ADD_PILL_CLASS,
  NOTE_EDITOR_ADD_PILL_IDLE,
  NoteEditorAddPillLabel
} from './addPillStyles';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';

export interface NoteTimeRangeChange {
  startYear?: number;
  endYear?: number;
}

interface NoteTimeRangeControlProps {
  startYear?: number;
  endYear?: number;
  onChange: (next: NoteTimeRangeChange) => void;
  themeColor?: string;
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  /** 为 false 时收起浮动面板（例如父级编辑器关闭） */
  active?: boolean;
  /** 父级在「关闭其它浮层」时调用，用于收起时间面板 */
  onProvideDismiss?: (dismiss: () => void) => void;
  /** 打开时间面板前关闭其它浮层 */
  onBeforeOpen?: () => void;
}

const TIME_PANEL_EST_W = 268;
const TIME_PANEL_EST_H = 52;

/**
 * 便签起止年编辑：与 NoteEditor 其它浮层共用锚定定位。
 */
export const NoteTimeRangeControl: React.FC<NoteTimeRangeControlProps> = ({
  startYear,
  endYear,
  onChange,
  themeColor = '#6366f1',
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp,
  active = true,
  onProvideDismiss,
  onBeforeOpen
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editingStartYear, setEditingStartYear] = useState('');
  const [editingEndYear, setEditingEndYear] = useState('');

  const timeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const timePanelPortalRef = useRef<HTMLDivElement | null>(null);
  const [timePanelPlacement, setTimePanelPlacement] = useState<{ top: number; left: number } | null>(null);

  const closeTimeEdit = useCallback(() => {
    setIsEditingTime(false);
    setTimePanelPlacement(null);
  }, []);

  const updateTimePanelPlacement = useCallback(() => {
    const el = timeAnchorRef.current;
    if (!el) return;
    setTimePanelPlacement(
      computeAnchoredPanelPlacement(el.getBoundingClientRect(), {
        panelWidth: TIME_PANEL_EST_W,
        panelHeight: TIME_PANEL_EST_H,
        align: 'end'
      })
    );
  }, []);

  useLayoutEffect(() => {
    if (!active || !isEditingTime) {
      setTimePanelPlacement(null);
      return;
    }
    updateTimePanelPlacement();
  }, [active, isEditingTime, updateTimePanelPlacement]);

  useEffect(() => {
    if (!active) {
      closeTimeEdit();
    }
  }, [active, closeTimeEdit]);

  useEffect(() => {
    if (!active || !isEditingTime) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (timeAnchorRef.current?.contains(t)) return;
      if (timePanelPortalRef.current?.contains(t)) return;
      closeTimeEdit();
    };
    const onReposition = () => updateTimePanelPlacement();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [active, isEditingTime, closeTimeEdit, updateTimePanelPlacement]);

  useEffect(() => {
    if (!onProvideDismiss) return;
    onProvideDismiss(() => closeTimeEdit());
  }, [onProvideDismiss, closeTimeEdit]);

  const timeDisplay = useMemo(() => {
    if (startYear == null) return '时间';
    if (endYear != null && endYear !== startYear) return `${startYear}–${endYear}`;
    return String(startYear);
  }, [startYear, endYear]);

  const editingTimePreview = useMemo(() => {
    const s = editingStartYear.trim();
    const e = editingEndYear.trim();
    if (!s) return '时间';
    const ps = parseInt(s, 10);
    if (Number.isNaN(ps)) return s;
    if (!e) return String(ps);
    const pe = parseInt(e, 10);
    if (Number.isNaN(pe)) return `${ps}–${e}`;
    if (pe !== ps) return `${ps}–${pe}`;
    return String(ps);
  }, [editingStartYear, editingEndYear]);

  const openTimeEdit = () => {
    onBeforeOpen?.();
    setEditingStartYear(startYear != null ? String(startYear) : '');
    setEditingEndYear(endYear != null ? String(endYear) : '');
    setIsEditingTime(true);
  };

  const saveTimeEdit = () => {
    const startStr = editingStartYear.trim();
    const endStr = editingEndYear.trim();

    const parsedStart = startStr ? parseInt(startStr, 10) : undefined;
    const parsedEnd = endStr ? parseInt(endStr, 10) : undefined;

    const nextStartYear =
      parsedStart != null && !Number.isNaN(parsedStart) ? parsedStart : undefined;
    const nextEndYear =
      nextStartYear != null && parsedEnd != null && !Number.isNaN(parsedEnd) && parsedEnd !== nextStartYear
        ? parsedEnd
        : undefined;

    onChange({ startYear: nextStartYear, endYear: nextEndYear });
    closeTimeEdit();
  };

  const hasTime = startYear != null;

  return (
    <>
      <button
        ref={timeAnchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isEditingTime) {
            closeTimeEdit();
            return;
          }
          openTimeEdit();
        }}
        className={`${NOTE_EDITOR_ADD_PILL_CLASS} max-w-full ${
          isEditingTime || hasTime ? NOTE_EDITOR_ADD_PILL_ACTIVE : NOTE_EDITOR_ADD_PILL_IDLE
        }`}
        title="点击修改起止时间"
        aria-expanded={isEditingTime}
      >
        {hasTime || isEditingTime ? (
          <span className="truncate pr-1.5">{isEditingTime ? editingTimePreview : timeDisplay}</span>
        ) : (
          <NoteEditorAddPillLabel>+ 时间</NoteEditorAddPillLabel>
        )}
        <Calendar size={14} strokeWidth={2} className="shrink-0" aria-hidden />
      </button>

      {isEditingTime &&
        timePanelPlacement &&
        createPortal(
          <div
            ref={timePanelPortalRef}
            data-note-time-range-panel
            className={`map-chrome-content-${chromeAppearance} flex flex-nowrap items-center gap-1.5 rounded-xl border border-gray-100/80 p-2 shadow-lg whitespace-nowrap ${panelChromeStyle ? '' : 'bg-white'}`}
            style={{
              ...(panelChromeStyle || {}),
              position: 'fixed',
              top: timePanelPlacement.top,
              left: timePanelPlacement.left,
              zIndex: 10003
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="number"
              min={1}
              max={9999}
              value={editingStartYear}
              onChange={(e) => setEditingStartYear(e.target.value)}
              className="w-14 shrink-0 px-1.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeTimeEdit();
                if (e.key === 'Enter') saveTimeEdit();
              }}
            />
            <span className="text-gray-400 text-xs shrink-0">–</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={editingEndYear}
              onChange={(e) => setEditingEndYear(e.target.value)}
              className="w-14 shrink-0 px-1.5 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ['--tw-ring-color' as string]: themeColor }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeTimeEdit();
                if (e.key === 'Enter') saveTimeEdit();
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                saveTimeEdit();
              }}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors shrink-0 border-0 cursor-pointer"
              title="保存起止时间"
            >
              <Check size={16} className="text-green-600" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTimeEdit();
              }}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors shrink-0 border-0 cursor-pointer"
              title="取消"
            >
              <X size={16} />
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
