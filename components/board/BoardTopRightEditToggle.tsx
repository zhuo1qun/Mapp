import React from 'react';
import { WorkspaceEditToggle } from '../ui/WorkspaceEditToggle';

type Props = {
  isUIVisible: boolean;
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
};

export const BoardTopRightEditToggle: React.FC<Props> = ({
  isUIVisible,
  isEditMode,
  themeColor,
  chromeSurfaceStyle,
  chromeHoverBackground,
  onEnterEditMode,
  onExitEditMode
}) => {
  if (!isUIVisible) return null;

  return (
    <div
      data-allow-context-menu
      className="fixed right-2 top-2 z-[500] hidden h-10 items-center gap-3 pointer-events-auto sm:right-4 sm:top-4 sm:h-12 sm:flex"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <WorkspaceEditToggle isEditMode={isEditMode} themeColor={themeColor} chromeSurfaceStyle={chromeSurfaceStyle} chromeHoverBackground={chromeHoverBackground} onEnterEditMode={onEnterEditMode} onExitEditMode={onExitEditMode} />
    </div>
  );
};
