import React, { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, Palette } from 'lucide-react';
import { set } from 'idb-keyval';
import { MAP_STYLE_OPTIONS } from '../constants';
import type { Project } from '../types';
import { GraphStyleSettingsBlock } from './GraphStyleSettingsBlock';
import { ThemeColorPicker } from './ThemeColorPicker';
import { HelpHint } from './ui/HelpHint';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';
import { SettingsToggleSwitch } from './ui/SettingsToggleSwitch';
import { chromePanelFieldClass } from './ui/chromePanelField';
import {
  mapChromeContentStyle,
  type MapChromeAppearance
} from '../utils/map/mapChromeStyle';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { PORTAL_TOOLTIP_Z } from './ui/PortalTooltip';
import { ChromeWindow } from './ui/ChromeWindow';
import { ChromeWindowHeader } from './ui/ChromeWindowHeader';
import { ChromePresence } from './ui/ChromeSheetPresence';
import { useCompactViewport } from '../utils/ui/useCompactViewport';
import { useChromeMenuTop } from '../utils/ui/chromeMenuPosition';
import { exportWorkspaceSnapshot } from '../utils';
import { ExportResolutionDialog } from './ExportResolutionDialog';
import { AppearanceSettingsBlock } from './AppearanceSettingsBlock';

/** 由打开设置时所在的视图决定只展示哪一块 */
export type SettingsContextView = 'map' | 'board' | 'graph' | 'table';

const PANEL_WIDTH = 320;
const PANEL_GAP = 8;
const PANEL_PAD = 8;

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** 锚定到左上角设置按钮；面板在其下方展开，左缘与页面顶栏左边距对齐 */
  anchorRef: RefObject<HTMLElement | null>;
  /** 当前一级视图：仅渲染该视图相关设置 */
  settingsContextView: SettingsContextView;
  themeColor: string;
  onThemeColorChange?: (color: string) => void | Promise<void>;
  uiDarkMode?: boolean;
  onUiDarkModeChange?: (dark: boolean) => void;
  mapUiChromeOpacity: number;
  onMapUiChromeOpacityChange: (opacity: number) => void;
  mapUiChromeBlurPx: number;
  onMapUiChromeBlurPxChange: (blurPx: number) => void;
  currentMapStyle: string;
  onMapStyleChange: (styleId: string) => void;
  pinSize?: number;
  onPinSizeChange?: (size: number) => void;
  clusterThreshold?: number;
  onClusterThresholdChange?: (threshold: number) => void;
  labelSize?: number;
  onLabelSizeChange?: (size: number) => void;
  /** 地图：是否显示便签文字标签 */
  showTextLabels?: boolean;
  onShowTextLabelsChange?: (show: boolean) => void;
  /** 有则展示 Graph Style，并写入项目 */
  graphProject?: Project;
  onGraphProjectPatch?: (patch: Partial<Project>) => void | Promise<void>;
  boardVariantToggles?: {
    primary: boolean;
    image: boolean;
    onChange: (next: { primary: boolean; image: boolean }) => void;
  };
  /** 为 false 时只渲染内容，由顶栏槽提供 ChromeWindow。 */
  shell?: boolean;
  chromeAppearance?: MapChromeAppearance;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  anchorRef,
  settingsContextView,
  themeColor,
  onThemeColorChange,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx,
  onMapUiChromeBlurPxChange,
  currentMapStyle,
  onMapStyleChange,
  pinSize,
  onPinSizeChange,
  clusterThreshold,
  onClusterThresholdChange,
  labelSize,
  onLabelSizeChange,
  showTextLabels,
  onShowTextLabelsChange,
  graphProject,
  onGraphProjectPatch,
  boardVariantToggles,
  shell = true,
  chromeAppearance: chromeAppearanceProp
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);
  const [showAppearanceSettings, setShowAppearanceSettings] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [snapshotDimensions, setSnapshotDimensions] = useState({ width: 0, height: 0 });
  const [mapBgMenuOpen, setMapBgMenuOpen] = useState(false);
  const mapBgTriggerRef = useRef<HTMLButtonElement>(null);
  const mapBgMenuRef = useRef<HTMLDivElement>(null);
  const menuTop = useChromeMenuTop(isOpen, anchorRef, PANEL_GAP);
  const [panelSize, setPanelSize] = useState({ width: PANEL_WIDTH, maxHeight: 480 });
  const [mapBgMenuRect, setMapBgMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const isCompactViewport = useCompactViewport();
  const settingsAppearance = useChromeAppearance(chromeAppearanceProp);

  useEffect(() => {
    if (!isOpen) {
      setMapBgMenuOpen(false);
      setShowThemeColorPicker(false);
      setShowAppearanceSettings(false);
      setShowExportDialog(false);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_PAD * 2);
      const top = menuTop ?? 0;
      const maxHeight = Math.max(160, window.innerHeight - top - PANEL_PAD);
      setPanelSize({ width, maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, menuTop]);

  useLayoutEffect(() => {
    if (!mapBgMenuOpen || !mapBgTriggerRef.current) {
      return;
    }
    const update = () => {
      const el = mapBgTriggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 6;
      const pad = 10;
      const belowTop = r.bottom + gap;
      const maxHeight = Math.max(120, window.innerHeight - belowTop - pad);
      setMapBgMenuRect({
        top: belowTop,
        left: r.left,
        width: r.width,
        maxHeight
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [mapBgMenuOpen]);

  useEffect(() => {
    if (!mapBgMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (mapBgTriggerRef.current?.contains(t)) return;
      if (mapBgMenuRef.current?.contains(t)) return;
      setMapBgMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mapBgMenuOpen]);

  if (typeof document === 'undefined') return null;

  const handleMapStyleSelect = (styleId: string) => {
    onMapStyleChange(styleId);
    set('mapp-map-style', styleId);
    setMapBgMenuOpen(false);
  };

  const currentMapStyleLabel =
    MAP_STYLE_OPTIONS.find((s) => s.id === currentMapStyle)?.name ?? currentMapStyle;

  const settingsCardChrome = mapChromeContentStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    settingsAppearance
  );
  const snapshotElementId = `${settingsContextView}-view-container`;
  const snapshotFileName = `${graphProject?.name || 'project'}-${settingsContextView}`;
  const openSnapshotExport = () => {
    const rect = document.getElementById(snapshotElementId)?.getBoundingClientRect();
    setSnapshotDimensions({
      width: Math.max(1, Math.round(rect?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(rect?.height ?? window.innerHeight))
    });
    setShowExportDialog(true);
  };

  const panelBody = (
    <>
        <ChromeWindowHeader title="设置" onClose={onClose} />

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pt-2 pb-3 theme-surface-scrollbar">
          {settingsContextView === 'map' ? (
            <div className="flex flex-col gap-3">
              <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0 text-xs font-medium text-gray-600">底图背景</span>
                <button
                  ref={mapBgTriggerRef}
                  type="button"
                  aria-expanded={mapBgMenuOpen}
                  aria-haspopup="listbox"
                  onClick={() => setMapBgMenuOpen((o) => !o)}
                  className={`${chromePanelFieldClass} min-w-0 w-full sm:flex-1`}
                >
                  <span className="truncate">{currentMapStyleLabel}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-gray-500 transition-transform ${mapBgMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
              {isCompactViewport ? (
                <ChromePresence open={mapBgMenuOpen} kind="menu">
                  {(menuPhase) => (
                <div
                  ref={mapBgMenuRef}
                  role="listbox"
                  className={`overflow-hidden rounded-xl border border-gray-200 py-1 chrome-menu-${menuPhase}`}
                >
                  {MAP_STYLE_OPTIONS.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      role="option"
                      aria-selected={currentMapStyle === style.id}
                      onClick={() => handleMapStyleSelect(style.id)}
                      className={`flex w-full border-0 px-3 py-2.5 text-left text-sm transition-colors ${
                        currentMapStyle === style.id
                          ? 'font-medium text-gray-900'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      style={
                        currentMapStyle === style.id
                          ? { boxShadow: `inset 3px 0 0 0 ${themeColor}` }
                          : undefined
                      }
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
                  )}
                </ChromePresence>
              ) : null}
              {showTextLabels !== undefined && onShowTextLabelsChange ? (
                <SettingsToggleSwitch
                  label="显示标签"
                  checked={showTextLabels}
                  onChange={onShowTextLabelsChange}
                  themeColor={themeColor}
                />
              ) : null}
              {pinSize !== undefined &&
              onPinSizeChange &&
              clusterThreshold !== undefined &&
              onClusterThresholdChange ? (
                <div className="grid grid-cols-1 gap-3">
                  <SettingsCompactSlider
                    label="Pin Size"
                    hint={
                      <HelpHint>缩放地图上每个便签定位图钉（水滴标）的显示大小，便于在密集区域点选。</HelpHint>
                    }
                    themeColor={themeColor}
                    value={pinSize}
                    min={0.5}
                    max={2}
                    step={0.1}
                    onChange={onPinSizeChange}
                    formatValue={(v) => `${v.toFixed(1)}x`}
                    minCaption="0.5x"
                    maxCaption="2.0x"
                  />
                  {labelSize !== undefined && onLabelSizeChange ? (
                    <SettingsCompactSlider
                      label="Label Size"
                      hint={
                        <HelpHint>缩放地图上便签标题等文字标签的整体字号与占用范围；与图钉大小相互独立。</HelpHint>
                      }
                      themeColor={themeColor}
                      value={labelSize}
                      min={0.5}
                      max={2}
                      step={0.1}
                      onChange={onLabelSizeChange}
                      formatValue={(v) => `${v.toFixed(1)}x`}
                      minCaption="0.5x"
                      maxCaption="2.0x"
                    />
                  ) : null}
                  <SettingsCompactSlider
                    label="Cluster Threshold"
                    hint={
                      <HelpHint>
                        两个便签在屏幕上的距离小于该像素阈值时，会合并显示为带数字的聚合标记；数值越大越容易聚成一团。
                      </HelpHint>
                    }
                    themeColor={themeColor}
                    value={clusterThreshold}
                    min={1}
                    max={100}
                    step={5}
                    onChange={onClusterThresholdChange}
                    formatValue={(v) => `${v}px`}
                    minCaption="1px"
                    maxCaption="100px"
                  />
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-gray-500">地图控件参数暂不可用。</p>
              )}
            </div>
          ) : null}

          {settingsContextView === 'board' ? (
            boardVariantToggles ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs leading-relaxed text-gray-500">显示类型（便签 / 图片）</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boardVariantToggles.primary}
                      onChange={(e) =>
                        boardVariantToggles.onChange({
                          primary: e.target.checked,
                          image: boardVariantToggles.image
                        })
                      }
                      className="h-4 w-4 rounded border-gray-200"
                      style={{ accentColor: 'var(--theme-color)' }}
                    />
                    <span>便签</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={boardVariantToggles.image}
                      onChange={(e) =>
                        boardVariantToggles.onChange({
                          primary: boardVariantToggles.primary,
                          image: e.target.checked
                        })
                      }
                      className="h-4 w-4 rounded border-gray-200"
                      style={{ accentColor: 'var(--theme-color)' }}
                    />
                    <span>图片</span>
                  </label>
                </div>
              </div>
            ) : (
              <p className="py-2 text-xs leading-relaxed text-gray-500">看板视图相关样式将放在此处，敬请期待。</p>
            )
          ) : null}

          {settingsContextView === 'graph' ? (
            graphProject && onGraphProjectPatch ? (
              <GraphStyleSettingsBlock
                themeColor={themeColor}
                project={graphProject}
                onPatch={(patch) => void onGraphProjectPatch(patch)}
              />
            ) : (
              <p className="py-2 text-xs leading-relaxed text-gray-500">
                当前无法写入图谱样式（未打开项目或缺少保存接口）。
              </p>
            )
          ) : null}

          {settingsContextView === 'table' ? (
            <p className="py-2 text-xs leading-relaxed text-gray-500">表格视图相关样式将放在此处，敬请期待。</p>
          ) : null}
        </div>

        <div
          className={`grid shrink-0 gap-2 px-3 py-2.5 ${
            settingsContextView === 'table' ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setShowAppearanceSettings(true)}
            className="chrome-field flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-700 transition-colors"
          >
            <Palette size={14} strokeWidth={2} aria-hidden />
            <span className="truncate">主题</span>
          </button>
          {settingsContextView !== 'table' ? (
            <button
              type="button"
              onClick={openSnapshotExport}
              className="chrome-field flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-700 transition-colors"
            >
              <Camera size={14} strokeWidth={2} aria-hidden />
              <span className="truncate">导出快照</span>
            </button>
          ) : null}
        </div>
    </>
  );

  return (
    <>
    {shell ? (
    <ChromeWindow
      open={isOpen}
      onClose={onClose}
      backdropLabel="关闭设置"
      surface="window"
      appearance={settingsAppearance}
      align="start"
      top={menuTop}
      panelRef={panelRef}
      dismissIgnoreRefs={[anchorRef, mapBgMenuRef]}
      data-graph-top-left-panel=""
      role="dialog"
      aria-label="设置"
      className="flex flex-col"
      style={{
        width: panelSize.width,
        maxHeight: panelSize.maxHeight,
        ...settingsCardChrome
      }}
    >
      {panelBody}
    </ChromeWindow>
    ) : (
      panelBody
    )}

      <ChromeWindow
        open={showAppearanceSettings}
        onClose={() => {
          if (!showThemeColorPicker) setShowAppearanceSettings(false);
        }}
        backdropLabel="关闭主题设置"
        placement="center"
        compactBehavior="fullscreen"
        presenceKind="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-appearance-settings-title"
        className="flex w-[calc(100vw-1.5rem)] max-h-[min(85dvh,85vh)] min-w-0 max-w-md flex-col sm:w-[min(32rem,calc(100vw-2rem))] sm:max-w-lg"
        style={settingsCardChrome}
      >
        <ChromeWindowHeader
          title="主题设置"
          titleId="workspace-appearance-settings-title"
          onClose={() => setShowAppearanceSettings(false)}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pb-3 pt-2 theme-surface-scrollbar">
          <AppearanceSettingsBlock
            themeColor={themeColor}
            onRequestThemeEdit={() => setShowThemeColorPicker(true)}
            uiDarkMode={uiDarkMode ?? settingsAppearance === 'dark'}
            onUiDarkModeChange={onUiDarkModeChange ?? (() => {})}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={onMapUiChromeOpacityChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange}
          />
        </div>
      </ChromeWindow>

      <ThemeColorPicker
        isOpen={showThemeColorPicker}
        onClose={() => setShowThemeColorPicker(false)}
        currentColor={themeColor}
        panelChromeStyle={settingsCardChrome}
        onColorChange={(c) => {
          onThemeColorChange?.(c);
        }}
      />

      {settingsContextView !== 'table' ? (
        <ExportResolutionDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          onConfirm={(pixelRatio, options) => {
            void exportWorkspaceSnapshot(
              snapshotElementId,
              snapshotFileName,
              pixelRatio,
              options,
              settingsContextView
            );
          }}
          view={settingsContextView}
          currentDimensions={snapshotDimensions}
          themeColor={themeColor}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
        />
      ) : null}

      {mapBgMenuRect &&
        !isCompactViewport &&
        createPortal(
          <ChromePresence open={mapBgMenuOpen} kind="menu">
            {(menuPhase) => (
          <div
            ref={mapBgMenuRef}
            data-chrome-window-nested=""
            role="listbox"
            className={`map-chrome-content-${settingsAppearance} chrome-menu-${menuPhase} fixed overflow-hidden rounded-lg border border-gray-200 py-1 shadow-xl theme-surface-scrollbar`}
            style={{
              ...settingsCardChrome,
              zIndex: PORTAL_TOOLTIP_Z,
              top: mapBgMenuRect.top,
              left: mapBgMenuRect.left,
              width: mapBgMenuRect.width,
              maxHeight: mapBgMenuRect.maxHeight,
              overflowY: 'auto'
            }}
          >
            {MAP_STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                type="button"
                role="option"
                aria-selected={currentMapStyle === style.id}
                onClick={() => handleMapStyleSelect(style.id)}
                className={`flex w-full border-0 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  currentMapStyle === style.id
                    ? 'font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={
                  currentMapStyle === style.id
                    ? { boxShadow: `inset 3px 0 0 0 ${themeColor}` }
                    : undefined
                }
              >
                {style.name}
              </button>
            ))}
          </div>
            )}
          </ChromePresence>,
          document.body
        )}
    </>
  );
};
