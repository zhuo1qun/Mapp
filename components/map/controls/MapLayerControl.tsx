import React from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Save } from 'lucide-react';
import type { Frame } from '../../../types';
import type { GraphLayerGroupStandard } from '../../../utils/graph/graphRuntimeCore';
import { ChromeIconButton } from '../../ui/ChromeIconButton';
import { LayerToolbarIcon } from '../../ui/LayerToolbarIcon';
import { useChromeMenuTop } from '../../../utils/ui/chromeMenuPosition';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';

interface MapLayerControlProps {
  showPanel: boolean;
  onTogglePanel: () => void;
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
  /** 统一节点图层（tag/frame），排在簇描述/簇列表左侧 */
  unifiedNotesLayerSlot?: React.ReactNode;
  /** 展开面板对齐页面左/右缘（与顶栏按钮 margin 一致），不再与图层按钮左右齐平 */
  dropdownAlign?: 'start' | 'end';
  /** 工具栏按钮图标：与图层面板当前 tag/frame 一致 */
  layerGroupStandard?: GraphLayerGroupStandard;
}

export const MapLayerControl: React.FC<MapLayerControlProps> = ({
  showPanel,
  onTogglePanel,
  themeColor,
  chromeSurfaceStyle,
  menuChromeSurfaceStyle,
  menuChromeAppearance = 'light',
  chromeHoverBackground,
  frames,
  frameLayerVisibility,
  setFrameLayerVisibility,
  showAllFrames,
  setShowAllFrames,
  activeFrame = null,
  editingFrameDescription = null,
  setEditingFrameDescription = () => {},
  onSaveFrameDescription = () => {},
  frameLayerRef,
  unifiedNotesLayerSlot,
  dropdownAlign = 'end',
  layerGroupStandard = 'tag'
}) => {
  const ch = chromeSurfaceStyle;
  const menuCh = menuChromeSurfaceStyle ?? ch;
  const menuTop = useChromeMenuTop(showPanel, frameLayerRef, 8);
  const edgeCls =
    dropdownAlign === 'start' ? 'ui-chrome-menu-page-left' : 'ui-chrome-menu-page-right';

  const panel =
    showPanel && menuTop != null ? (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[var(--z-map-sheet-backdrop)] bg-black/15 backdrop-blur-[2px] sm:hidden"
          aria-label="关闭图层"
          onClick={onTogglePanel}
        />
        <div
          data-map-layer-chrome-panel
          className={`map-layer-chrome-panel ui-compact-bottom-sheet map-chrome-content-${menuChromeAppearance} fixed z-[var(--z-map-anchored-panel)] ${edgeCls} flex gap-2 items-start pointer-events-none`}
          style={{ top: menuTop }}
        >
        {unifiedNotesLayerSlot ? (
          <div
            className="pointer-events-auto shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {unifiedNotesLayerSlot}
          </div>
        ) : null}
        {activeFrame && (
          <div
            className={`w-72 sm:w-80 rounded-xl shadow-xl border border-gray-100 flex flex-col pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-right-4 ${menuCh ? '' : 'bg-white'}`}
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
                  onClick={() => setEditingFrameDescription(activeFrame.description || '')}
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
                  onChange={(e) => setEditingFrameDescription(e.target.value)}
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
        )}
        </div>
      </>
    ) : null;

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
      tooltip="图层"
    >
      <LayerToolbarIcon layerGroupStandard={layerGroupStandard} />
    </ChromeIconButton>

    {panel ? createPortal(panel, document.body) : null}
  </div>
  );
};
