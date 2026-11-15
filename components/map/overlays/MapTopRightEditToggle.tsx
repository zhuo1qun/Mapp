import React from 'react';
import { WorkspaceEditToggle } from '../../ui/WorkspaceEditToggle';

interface Props {
  isEditMode: boolean;
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  chromeHoverBackground: string;
  onEnterEdit: () => void;
  onExitEdit: () => void;
}

export function MapTopRightEditToggle(props: Props) {
  return <WorkspaceEditToggle isEditMode={props.isEditMode} themeColor={props.themeColor} chromeSurfaceStyle={props.chromeSurfaceStyle} chromeHoverBackground={props.chromeHoverBackground} onEnterEditMode={props.onEnterEdit} onExitEditMode={props.onExitEdit} />;
}
