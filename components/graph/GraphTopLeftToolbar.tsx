import React, { useRef, type ReactNode } from 'react';
import { Settings, Tag as TagIcon, Frame as FrameIcon, Smile } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { ChromeToolbarSlot, CHROME_TOOLBAR_WINDOW_CLASS } from '../ui/ChromeToolbarSlot';
import { useChromeAppearance } from '../ui/chromeAppearanceContext';
import { ProjectNotesLayerPanel } from '../layer/ProjectNotesLayerPanel';
import { useChromeMenuTop } from '../../utils/ui/chromeMenuPosition';
import type { Frame, GraphLayerState, Note } from '../../types';

type GraphLayerKind = 'tag' | 'emoji' | 'frame';

type Props = {
  isUIVisible: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  setShowSettingsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showSettingsPanel?: boolean;
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
  showTagLayerPanel: boolean;
  setShowTagLayerPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showEmojiLayerPanel: boolean;
  setShowEmojiLayerPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showFrameLayerPanel: boolean;
  setShowFrameLayerPanel: React.Dispatch<React.SetStateAction<boolean>>;
  canShowLayer: boolean;
  panelChromeStyle?: React.CSSProperties;
  mergedTagLayers: GraphLayerState;
  mergedEmojiLayers: GraphLayerState;
  mergedFrameLayers: GraphLayerState;
  onTagLayersChange: (next: GraphLayerState) => void;
  onEmojiLayersChange: (next: GraphLayerState) => void;
  onFrameLayersChange: (next: GraphLayerState) => void;
  notes: Note[];
  onUpdateNote: (note: Note) => void;
  onBatchUpdateNotes?: (nextNotes: Note[]) => void | Promise<void>;
  frames: Frame[];
  onUpdateFrame?: (frame: Frame) => void;
  projectId: string;
  onActivateNoteFromLayer?: (note: Note) => void;
  /** 与按钮行共用左上定位容器、自然排在按钮下方的内容（如节点详情卡）。 */
  belowToolbar?: React.ReactNode;
  settingsPanel?: ReactNode;
};

export const GraphTopLeftToolbar: React.FC<Props> = ({
  isUIVisible,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  setShowSettingsPanel,
  showSettingsPanel = false,
  settingsButtonRef,
  showTagLayerPanel,
  setShowTagLayerPanel,
  showEmojiLayerPanel,
  setShowEmojiLayerPanel,
  showFrameLayerPanel,
  setShowFrameLayerPanel,
  canShowLayer,
  panelChromeStyle,
  mergedTagLayers,
  mergedEmojiLayers,
  mergedFrameLayers,
  onTagLayersChange,
  onEmojiLayersChange,
  onFrameLayersChange,
  notes,
  onUpdateNote,
  onBatchUpdateNotes,
  frames,
  onUpdateFrame,
  projectId,
  onActivateNoteFromLayer,
  belowToolbar,
  settingsPanel
}) => {
  const chromeAppearance = useChromeAppearance();
  const toolbarRowRef = useRef<HTMLDivElement>(null);
  const tagBtnWrapRef = useRef<HTMLDivElement>(null);
  const emojiBtnWrapRef = useRef<HTMLDivElement>(null);
  const frameBtnWrapRef = useRef<HTMLDivElement>(null);

  const layerPanelKind: GraphLayerKind | null = showTagLayerPanel
    ? 'tag'
    : showFrameLayerPanel
      ? 'frame'
      : showEmojiLayerPanel
        ? 'emoji'
        : null;
  const toolbarKind =
    showSettingsPanel ? 'settings' as const : layerPanelKind;
  const layerMenuTop = useChromeMenuTop(toolbarKind != null, toolbarRowRef, 8);

  if (!isUIVisible) return null;

  const closePanels = () => {
    setShowTagLayerPanel(false);
    setShowEmojiLayerPanel(false);
    setShowFrameLayerPanel(false);
  };

  const layerPanelShared = {
    themeColor,
    panelChromeStyle,
    variant: 'graph' as const,
    embed: false,
    flow: true,
    hosted: true,
    dockAlign: 'start' as const,
    hideStandardToggle: true,
    onLayerGroupStandardChange: () => {},
    notes,
    onUpdateNote,
    onBatchUpdateNotes,
    frames,
    projectId,
    onActivateNote: onActivateNoteFromLayer
  };

  return (
    <div
      data-allow-context-menu
      data-graph-top-left-chrome
      data-mapp-chrome-ui=""
      className="fixed top-2 sm:top-4 ui-workspace-left z-[1000] pointer-events-none flex flex-col items-start gap-2 sm:gap-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={toolbarRowRef}
        className="pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2"
      >
        <ChromeIconButton
          ref={settingsButtonRef}
          themeColor={themeColor}
          chromeSurfaceStyle={chromeSurfaceStyle}
          chromeHoverBackground={chromeHoverBackground}
          nonChromeIdleHover="imperative-gray100"
          active={showSettingsPanel}
          pressThemeFlash
          onClick={(e) => {
            e.stopPropagation();
            setShowSettingsPanel((v) => !v);
            closePanels();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          tooltip="设置"
        >
          <Settings size={18} className="sm:w-5 sm:h-5" />
        </ChromeIconButton>
        {canShowLayer ? (
          <>
            <div ref={tagBtnWrapRef}>
              <ChromeIconButton
                themeColor={themeColor}
                chromeSurfaceStyle={chromeSurfaceStyle}
                chromeHoverBackground={chromeHoverBackground}
                active={showTagLayerPanel}
                pressThemeFlash
                nonChromeIdleHover="imperative-gray100"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagLayerPanel((v) => !v);
                  setShowEmojiLayerPanel(false);
                  setShowFrameLayerPanel(false);
                  setShowSettingsPanel(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                tooltip="标签图层"
              >
                <TagIcon size={18} className="sm:w-5 sm:h-5" />
              </ChromeIconButton>
            </div>
            <div ref={emojiBtnWrapRef}>
              <ChromeIconButton
                themeColor={themeColor}
                chromeSurfaceStyle={chromeSurfaceStyle}
                chromeHoverBackground={chromeHoverBackground}
                active={showEmojiLayerPanel}
                pressThemeFlash
                nonChromeIdleHover="imperative-gray100"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiLayerPanel((v) => !v);
                  setShowTagLayerPanel(false);
                  setShowFrameLayerPanel(false);
                  setShowSettingsPanel(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                tooltip="Emoji 图层"
              >
                <Smile size={18} className="sm:w-5 sm:h-5" />
              </ChromeIconButton>
            </div>
            <div ref={frameBtnWrapRef}>
              <ChromeIconButton
                themeColor={themeColor}
                chromeSurfaceStyle={chromeSurfaceStyle}
                chromeHoverBackground={chromeHoverBackground}
                active={showFrameLayerPanel}
                pressThemeFlash
                nonChromeIdleHover="imperative-gray100"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFrameLayerPanel((v) => !v);
                  setShowTagLayerPanel(false);
                  setShowEmojiLayerPanel(false);
                  setShowSettingsPanel(false);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                tooltip="簇图层"
              >
                <FrameIcon size={18} className="sm:w-5 sm:h-5" />
              </ChromeIconButton>
            </div>
          </>
        ) : null}
      </div>
      {belowToolbar}
      <ChromeToolbarSlot
        kind={toolbarKind}
        appearance={chromeAppearance}
        onClose={() => {
          closePanels();
          setShowSettingsPanel(false);
        }}
        top={layerMenuTop}
        dismissIgnoreRefs={[toolbarRowRef, tagBtnWrapRef, emojiBtnWrapRef, frameBtnWrapRef]}
        resolve={(kind) => {
          if (kind === 'settings') {
            return {
              align: 'start' as const,
              surface: 'window' as const,
              backdropLabel: '关闭设置',
              className: CHROME_TOOLBAR_WINDOW_CLASS,
              style: panelChromeStyle,
              role: 'dialog',
              'aria-label': '设置',
              children: settingsPanel
            };
          }
          return {
            align: 'start' as const,
            surface: 'window' as const,
            backdropLabel: '关闭筛选',
            className: CHROME_TOOLBAR_WINDOW_CLASS,
            style: panelChromeStyle,
            role: 'dialog',
            'aria-label': '筛选',
            children: (
              <div className="pointer-events-auto flex min-h-0 min-w-0 flex-1 flex-col">
                {kind === 'tag' ? (
                  <ProjectNotesLayerPanel
                    {...layerPanelShared}
                    merged={mergedTagLayers}
                    layerGroupStandard="tag"
                    onStateChange={onTagLayersChange}
                  />
                ) : null}
                {kind === 'frame' ? (
                  <ProjectNotesLayerPanel
                    {...layerPanelShared}
                    merged={mergedFrameLayers}
                    layerGroupStandard="frame"
                    onStateChange={onFrameLayersChange}
                    onUpdateFrame={onUpdateFrame}
                  />
                ) : null}
                {kind === 'emoji' ? (
                  <ProjectNotesLayerPanel
                    {...layerPanelShared}
                    merged={mergedEmojiLayers}
                    layerGroupStandard="emoji"
                    onStateChange={onEmojiLayersChange}
                  />
                ) : null}
              </div>
            )
          };
        }}
      />
    </div>
  );
};
