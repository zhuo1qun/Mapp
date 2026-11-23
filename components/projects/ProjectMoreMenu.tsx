import type React from 'react';
import { Copy, Download, Edit2, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { Project } from '../../types';
import { ChromeMenuItem } from '../ui/ChromeMenuItem';
import { ChromeMenuShell } from '../ui/ChromeMenuShell';

type Props = {
  project: Project;
  onRename: (projectId: string) => void;
  onDuplicate: (project: Project) => void;
  onImportPoints: (project: Project) => void;
  onExportFullProject: (project: Project) => void;
  onUpdateBuiltinExample?: (project: Project) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  surfaceStyle: React.CSSProperties;
  fixedPlacementStyle: React.CSSProperties;
  motionOriginClass: 'origin-top' | 'origin-top-right';
  hoverBackground: string;
  canDelete?: boolean;
  canUpdateBuiltinExample?: boolean;
};

/** Project row actions; positioning is intentionally owned by the list host. */
export function ProjectMoreMenu({
  project,
  onRename,
  onDuplicate,
  onImportPoints,
  onExportFullProject,
  onUpdateBuiltinExample,
  onDelete,
  onClose,
  surfaceStyle,
  fixedPlacementStyle,
  motionOriginClass,
  hoverBackground,
  canDelete = true,
  canUpdateBuiltinExample = false
}: Props) {
  return (
    <ChromeMenuShell
      data-pm-more-menu
      className={`overflow-y-auto theme-surface-scrollbar animate-in fade-in zoom-in-95 ${motionOriginClass}`}
      style={{ ...surfaceStyle, ...fixedPlacementStyle }}
      onClick={(event) => event.stopPropagation()}
      role="menu"
    >
      <ChromeMenuItem icon={<Edit2 size={16} />} hoverBackground={hoverBackground} onClick={() => { onRename(project.id); onClose(); }}>
        Rename
      </ChromeMenuItem>
      <ChromeMenuItem icon={<Copy size={16} />} hoverBackground={hoverBackground} onClick={() => { onDuplicate(project); onClose(); }}>
        Duplicate Project
      </ChromeMenuItem>
      {canUpdateBuiltinExample && onUpdateBuiltinExample ? (
        <ChromeMenuItem icon={<RefreshCw size={16} />} hoverBackground={hoverBackground} onClick={() => { onUpdateBuiltinExample(project); onClose(); }}>
          更新示例
        </ChromeMenuItem>
      ) : null}
      <ChromeMenuItem icon={<Upload size={16} />} hoverBackground={hoverBackground} onClick={() => { onImportPoints(project); onClose(); }}>
        导入点位（JSON / CSV）
      </ChromeMenuItem>
      <ChromeMenuItem icon={<Download size={16} />} hoverBackground={hoverBackground} onClick={() => { onExportFullProject(project); onClose(); }}>
        Export Full Project (JSON)
      </ChromeMenuItem>
      {canDelete ? (
        <ChromeMenuItem
          icon={<Trash2 size={16} />}
          destructive
          onClick={(event) => {
            event.stopPropagation();
            onDelete(project.id);
            onClose();
          }}
        >
          Delete Project
        </ChromeMenuItem>
      ) : null}
    </ChromeMenuShell>
  );
}
