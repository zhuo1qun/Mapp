import React, { useRef } from 'react';
import { Settings, Tag as TagIcon, Frame as FrameIcon, Smile } from 'lucide-react';
import { ChromeIconButton } from '../ui/ChromeIconButton';
import { ProjectNotesLayerPanel } from '../layer/ProjectNotesLayerPanel';
import type { Frame, GraphLayerState, Note } from '../../types';

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
  belowToolbar
}) => {
  const tagBtnWrapRef = useRef<HTMLDivElement>(null);
  const emojiBtnWrapRef = useRef<HTMLDivElement>(null);
  const frameBtnWrapRef = useRef<HTMLDivElement>(null);

  if (!isUIVisible) return null;

  const closePanels = () => {
    setShowTagLayerPanel(false);
    setShowEmojiLayerPanel(false);
    setShowFrameLayerPanel(false);
  };

  return (
    <div
      data-allow-context-menu
      data-graph-top-left-chrome
      className="fixed top-2 sm:top-4 ui-workspace-left z-[1000] pointer-events-none flex flex-col items-start gap-2 sm:gap-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto flex h-10 sm:h-12 items-center gap-1.5 sm:gap-2">
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
      {showTagLayerPanel ? (
        <div className="pointer-events-auto">
          <ProjectNotesLayerPanel
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            variant="graph"
            embed={false}
            dockAlign="start"
            menuAnchorRef={tagBtnWrapRef}
            merged={mergedTagLayers}
            layerGroupStandard="tag"
            hideStandardToggle
            onLayerGroupStandardChange={() => {}}
            onStateChange={onTagLayersChange}
            notes={notes}
            onUpdateNote={onUpdateNote}
            onBatchUpdateNotes={onBatchUpdateNotes}
            frames={frames}
            projectId={projectId}
            onActivateNote={onActivateNoteFromLayer}
          />
        </div>
      ) : null}
      {showFrameLayerPanel ? (
        <div className="pointer-events-auto">
          <ProjectNotesLayerPanel
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            variant="graph"
            embed={false}
            dockAlign="start"
            menuAnchorRef={frameBtnWrapRef}
            merged={mergedFrameLayers}
            layerGroupStandard="frame"
            hideStandardToggle
            onLayerGroupStandardChange={() => {}}
            onStateChange={onFrameLayersChange}
            notes={notes}
            onUpdateNote={onUpdateNote}
            onBatchUpdateNotes={onBatchUpdateNotes}
            frames={frames}
            onUpdateFrame={onUpdateFrame}
            projectId={projectId}
            onActivateNote={onActivateNoteFromLayer}
          />
        </div>
      ) : null}
      {showEmojiLayerPanel ? (
        <div className="pointer-events-auto">
          <ProjectNotesLayerPanel
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            variant="graph"
            embed={false}
            dockAlign="start"
            menuAnchorRef={emojiBtnWrapRef}
            merged={mergedEmojiLayers}
            layerGroupStandard="emoji"
            hideStandardToggle
            onLayerGroupStandardChange={() => {}}
            onStateChange={onEmojiLayersChange}
            notes={notes}
            onUpdateNote={onUpdateNote}
            onBatchUpdateNotes={onBatchUpdateNotes}
            frames={frames}
            projectId={projectId}
            onActivateNote={onActivateNoteFromLayer}
          />
        </div>
      ) : null}
    </div>
  );
};
