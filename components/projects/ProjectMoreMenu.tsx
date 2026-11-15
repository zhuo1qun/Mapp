import type React from 'react';
import { Copy, Download, Edit2, Image as ImageIcon, Palette, RefreshCw, Trash2 } from 'lucide-react';
import type { Project } from '../../types';
import { ChromeMenuItem } from '../ui/ChromeMenuItem';
import { ChromeMenuShell } from '../ui/ChromeMenuShell';

type Props = {
  project: Project;
  onRename: (projectId: string) => void;
  onDuplicate: (project: Project) => void;
  onExportData: (project: Project) => void;
  onExportFullProject: (project: Project) => void;
  onExportMappViz: (project: Project) => void;
  onCompressImages: (project: Project) => void;
  onUpdateBuiltinExample?: (project: Project) => void;
  onCheckData?: () => Promise<void>;
  onCleanupBrokenReferences?: (project: Project) => Promise<void>;
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
  onExportData,
  onExportFullProject,
  onExportMappViz,
  onCompressImages,
  onUpdateBuiltinExample,
  onCheckData,
  onCleanupBrokenReferences,
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
      <ChromeMenuItem icon={<Download size={16} />} hoverBackground={hoverBackground} onClick={() => { onExportData(project); onClose(); }}>
        Export Data (CSV)
      </ChromeMenuItem>
      <ChromeMenuItem icon={<Download size={16} />} hoverBackground={hoverBackground} onClick={() => { onExportFullProject(project); onClose(); }}>
        Export Full Project (JSON)
      </ChromeMenuItem>
      <ChromeMenuItem icon={<Download size={16} />} hoverBackground={hoverBackground} onClick={() => { onExportMappViz(project); onClose(); }}>
        Export Bibliometrics (.viz.json)
      </ChromeMenuItem>
      <ChromeMenuItem icon={<ImageIcon size={16} />} hoverBackground={hoverBackground} onClick={() => { onCompressImages(project); onClose(); }}>
        Compress Images
      </ChromeMenuItem>
      {onCheckData ? (
        <ChromeMenuItem
          icon={<Palette size={16} />}
          hoverBackground={hoverBackground}
          onClick={async () => {
            await onCheckData();
            onClose();
          }}
        >
          Check Data
        </ChromeMenuItem>
      ) : null}
      {onCleanupBrokenReferences ? (
        <ChromeMenuItem
          icon={<Trash2 size={16} />}
          hoverBackground={hoverBackground}
          onClick={async () => {
            await onCleanupBrokenReferences(project);
            onClose();
          }}
        >
          Clean Broken Links
        </ChromeMenuItem>
      ) : null}
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
