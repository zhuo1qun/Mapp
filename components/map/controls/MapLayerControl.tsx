import React from 'react';
import { Edit3, Save } from 'lucide-react';
import type { Frame } from '../../../types';
import type { GraphLayerGroupStandard } from '../../../utils/graph/graphRuntimeCore';
import { ChromeIconButton } from '../../ui/ChromeIconButton';
import { LayerToolbarIcon } from '../../ui/LayerToolbarIcon';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { useChromeMenuTop } from '../../../utils/ui/chromeMenuPosition';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';

interface MapLayerControlProps {
  showPanel: boolean;
  onTogglePanel: () => void;
  /** 遮罩关闭只关不切，避免与文档捕获阶段的 outside-close 叠成 toggle 再打开。 */
  onClosePanel?: () => void;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  /** 展开后的文字面板可与图标按钮采用不同材质，保证可读性。 */
  menuChromeSurfaceStyle?: React.CSSProperties;
  menuChromeAppearance?: MapChromeAppearance;
  chromeHoverBackground?: string;
  frames: Frame[] | undefined;
  frameLayerVisibility: Record<string, boolean>;
  setFrameLayerVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  showAllFrames: boolean;
  setShowAllFrames: (v: boolean) => void;
  activeFrame?: Frame | null;
  editingFrameDescription?: string | null;
  setEditingFrameDescription?: (v: string | null) => void;
  onSaveFrameDescription?: () => void;
  frameLayerRef: React.RefObject<HTMLDivElement | null>;
  /** 统一节点图层（标签 / Emoji / 簇），排在簇描述/簇列表左侧 */
  unifiedNotesLayerSlot?: React.ReactNode;
  /** 展开面板对齐页面左/右缘（与顶栏按钮 margin 一致），不再与图层按钮左右齐平 */
  dropdownAlign?: 'start' | 'end';
  /** 工具栏按钮图标：与图层面板当前分组方式一致 */
  layerGroupStandard?: GraphLayerGroupStandard;
  hostedWindow?: boolean;
}

export const MapLayerControl: React.FC<MapLayerControlProps> = ({
  showPanel,
  onTogglePanel,
  onClosePanel,
  themeColor,
  chromeSurfaceStyle,
  menuChromeSurfaceStyle,
  menuChromeAppearance = 'light',
  chromeHoverBackground,
  activeFrame = null,
  editingFrameDescription = null,
  setEditingFrameDescription = () => {},
  onSaveFrameDescription = () => {},
  frameLayerRef,
  unifiedNotesLayerSlot,
  dropdownAlign = 'end',
  layerGroupStandard = 'tag',
  hostedWindow = false
}) => {
  const ch = chromeSurfaceStyle;
  const menuCh = menuChromeSurfaceStyle ?? ch;
  const menuTop = useChromeMenuTop(showPanel && !hostedWindow, frameLayerRef, 8);
  const layerBody = (
    <MapLayerChromeBody
      unifiedNotesLayerSlot={unifiedNotesLayerSlot}
      activeFrame={activeFrame}
      editingFrameDescription={editingFrameDescription}
      setEditingFrameDescription={setEditingFrameDescription}
      onSaveFrameDescription={onSaveFrameDescription}
      menuCh={menuCh}
    />
  );

  return (
  <div className="relative" ref={frameLayerRef}>
    <ChromeIconButton
      themeColor={themeColor}
      chromeSurfaceStyle={ch}
      chromeHoverBackground={chromeHoverBackground}
      active={showPanel}
      pressThemeFlash
      nonChromeIdleHover="imperative-gray100"
      onClick={() => onTogglePanel()}
      tooltip="筛选"
    >
      <LayerToolbarIcon layerGroupStandard={layerGroupStandard} />
    </ChromeIconButton>

    {!hostedWindow ? (
    <ChromeWindow
      surface="layer"
      open={showPanel}
      onClose={onClosePanel ?? onTogglePanel}
      backdropLabel="关闭筛选"
      top={menuTop}
      align={dropdownAlign}
      appearance={menuChromeAppearance}
      dismissIgnoreRefs={[frameLayerRef]}
    >
      {layerBody}
    </ChromeWindow>
    ) : null}
  </div>
  );
};

export function MapLayerChromeBody({
  unifiedNotesLayerSlot,
  activeFrame,
  editingFrameDescription,
  setEditingFrameDescription,
  onSaveFrameDescription,
  menuCh
}: {
  unifiedNotesLayerSlot?: React.ReactNode;
  activeFrame?: Frame | null;
  editingFrameDescription?: string | null;
  setEditingFrameDescription?: (v: string | null) => void;
  onSaveFrameDescription?: () => void;
  menuCh?: React.CSSProperties;
}) {
  return (
    <>
      {unifiedNotesLayerSlot ? (
        <div
          className="pointer-events-auto shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {unifiedNotesLayerSlot}
        </div>
      ) : null}
      {activeFrame ? (
        <div
          className={`w-72 sm:w-80 rounded-xl shadow-xl border border-gray-100 flex flex-col pointer-events-auto overflow-hidden ${menuCh ? '' : 'bg-white'}`}
          style={{ maxHeight: '60vh', ...menuCh }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeFrame.color }} />
              <h3 className="font-bold text-gray-800 truncate text-xs">{activeFrame.title}</h3>
            </div>
            {editingFrameDescription === null ? (
              <button
                onClick={() => setEditingFrameDescription?.(activeFrame.description || '')}
                className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500"
                title="Edit Description"
              >
                <Edit3 size={12} />
              </button>
            ) : (
              <button
                onClick={onSaveFrameDescription}
                className="p-1 hover:bg-green-100 text-green-600 rounded transition-colors"
                title="Save Description"
              >
                <Save size={12} />
              </button>
            )}
          </div>

          <div
            className={`flex-1 overflow-y-auto p-3 custom-scrollbar ${menuCh ? '' : 'bg-white'}`}
            style={menuCh ? { backgroundColor: 'transparent' } : undefined}
          >
            {editingFrameDescription !== null ? (
              <textarea
                autoFocus
                value={editingFrameDescription}
                onChange={(e) => setEditingFrameDescription?.(e.target.value)}
                className="w-full h-full min-h-[100px] bg-transparent border-none focus:ring-0 p-0 text-xs text-gray-800 resize-none"
              />
            ) : (
              <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                {activeFrame.description || (
                  <span className="text-gray-400 italic">No description added yet. Click edit icon.</span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
