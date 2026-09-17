import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Project, Note, ProjectKind } from '../types';
import { Plus, MoreHorizontal, Trash2, Map as MapIcon, Image as ImageIcon, Download, LayoutGrid, X, Home, Cloud, Edit2, Check, Upload, Palette, Sparkles, ZoomIn, Copy, Code2, GitBranch, RefreshCw } from 'lucide-react';
import { generateId, formatDate, compressImageFromBase64 } from '../utils';
import { loadProject, loadNoteImages, saveProject, loadAllProjects } from '../utils/persistence/storage';
import { getLastSyncTime, type SyncStatus } from '../utils/persistence/sync';
import { downloadMappVizJson } from '../utils/export/mappVizJson';
import { projectKindLabel, isProjectKind, sanitizeProjectKind } from '../utils/projectKind';
import {
  formatImportErrorMessage,
  formatJsonParseFailure,
  formatUnexpectedImportError,
  validateFullProjectImportPayload
} from '../utils/import/importErrorFormat';
import { AnimatePresence } from 'framer-motion';
import {
  DEFAULT_THEME_COLOR,
  PROJECT_OPEN_SLIDE_DURATION_S,
  PROJECT_OPEN_SLIDE_EASE,
  PROJECT_RETURN_HOME_LIST_MOVE_DURATION_S,
  PROJECT_RETURN_HOME_LIST_MOVE_EASE,
  PROJECT_SIDEBAR_DRAWER_WIDTH_PX
} from '../constants';
import { ThemeColorPicker } from './ThemeColorPicker';
import { AppearanceSettingsBlock } from './AppearanceSettingsBlock';
import {
  mapChromeSurfaceStyle,
  mapChromeHoverBackground
} from '../utils/map/mapChromeStyle';
import { useChromeAppearance } from './ui/chromeAppearanceContext';
import { MotionDiv } from './ui/MotionDiv';
import { ChromeMenuItem } from './ui/ChromeMenuItem';
import { ChromeDialogSurface } from './ui/ChromeDialogSurface';
import { ChromeMenuShell } from './ui/ChromeMenuShell';
import { ChromeWindow } from './ui/ChromeWindow';
import { ChromeWindowHeader } from './ui/ChromeWindowHeader';
import { ChromeDropOverlay } from './ui/ChromeDropOverlay';
import { ChromeSearchField } from './ui/ChromeSearchField';
import { ChromeSegmentedControl } from './ui/ChromeSegmentedControl';
import { fetchBuiltinExamplesManifest } from '../utils/builtinExamples/manifest';
import { parseExportPayload } from '../utils/builtinExamples/projectFromExport';
import {
  getHomeHeroCharacterPose,
  HOME_HERO_LINES,
  isHomeHeroPinCharacter
} from '../utils/home/homeHeroTitle';
import {
  isFileDragLeavingViewport,
  isFileDragTypes,
  pickJsonFile
} from '../utils/ui/fileDrag';

/** 项目「更多」菜单 portal：高于侧栏与覆盖层，低于删除项目阻断层 10000 */
const PM_PROJECT_MORE_MENU_Z = 9901;
const LEGACY_BUILTIN_EXAMPLE_NAME = '上海';
const BUILTIN_EXAMPLE_SOURCE_ID = 'starter-board';

function computeProjectMoreMenuFixedStyle(
  row: DOMRectReadOnly,
  button: DOMRectReadOnly,
  fullWidth: boolean,
  vw: number,
  vh: number
): React.CSSProperties {
  const gap = 8;
  const estH = 280;
  const zIndex = PM_PROJECT_MORE_MENU_Z;
  if (fullWidth) {
    const spaceBelow = vh - row.bottom;
    const spaceAbove = row.top;
    const openUp = spaceBelow < estH + gap && spaceAbove > spaceBelow;
    const maxH = Math.min(
      vh * 0.6,
      openUp ? Math.max(120, row.top - gap * 2) : Math.max(120, vh - row.bottom - gap * 2)
    );
    const left = Math.max(gap, Math.min(row.left, vw - gap));
    const width = Math.min(row.width, vw - left - gap);
    const base: React.CSSProperties = {
      position: 'fixed',
      left,
      width: Math.max(120, width),
      maxHeight: maxH,
      zIndex
    };
    if (openUp) {
      return { ...base, bottom: vh - row.top + gap, top: 'auto' };
    }
    return { ...base, top: row.bottom + gap, bottom: 'auto' };
  }
  const w = 192;
  const spaceBelow = vh - button.bottom;
  const spaceAbove = button.top;
  const openUp = spaceBelow < estH + gap && spaceAbove > spaceBelow;
  const maxH = Math.min(
    vh * 0.6,
    openUp ? Math.max(120, button.top - gap * 2) : Math.max(120, vh - button.bottom - gap * 2)
  );
  const left = Math.max(gap, Math.min(button.right - w, vw - w - gap));
  const base: React.CSSProperties = {
    position: 'fixed',
    left,
    width: w,
    maxHeight: maxH,
    zIndex
  };
  if (openUp) {
    return { ...base, bottom: vh - button.top + gap, top: 'auto' };
  }
  return { ...base, top: button.bottom + gap, bottom: 'auto' };
}

/** 更多菜单：mapChrome 实色 + 模糊由 surfaceStyle 提供；几何由 fixedPlacementStyle（portal fixed） */
const MenuDropdown: React.FC<{
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
}> = ({
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
}) => {
  return (
    <ChromeMenuShell
      data-pm-more-menu
      className={`overflow-y-auto theme-surface-scrollbar animate-in fade-in zoom-in-95 ${motionOriginClass}`}
      style={{ ...surfaceStyle, ...fixedPlacementStyle }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      <ChromeMenuItem
        icon={<Edit2 size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onRename(project.id); onClose(); }}
      >
        Rename
      </ChromeMenuItem>
      <ChromeMenuItem
        icon={<Copy size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onDuplicate(project); onClose(); }}
      >
        Duplicate Project
      </ChromeMenuItem>
      {canUpdateBuiltinExample && onUpdateBuiltinExample ? (
        <ChromeMenuItem
          icon={<RefreshCw size={16} />}
          hoverBackground={hoverBackground}
          onClick={() => { onUpdateBuiltinExample(project); onClose(); }}
        >
          更新示例
        </ChromeMenuItem>
      ) : null}
      <ChromeMenuItem
        icon={<Download size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onExportData(project); onClose(); }}
      >
        Export Data (CSV)
      </ChromeMenuItem>
      <ChromeMenuItem
        icon={<Download size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onExportFullProject(project); onClose(); }}
      >
        Export Full Project (JSON)
      </ChromeMenuItem>
      <ChromeMenuItem
        icon={<Download size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onExportMappViz(project); onClose(); }}
      >
        Export Bibliometrics (.viz.json)
      </ChromeMenuItem>
      <ChromeMenuItem
        icon={<ImageIcon size={16} />}
        hoverBackground={hoverBackground}
        onClick={() => { onCompressImages(project); onClose(); }}
      >
        Compress Images
      </ChromeMenuItem>
      {onCheckData && (
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
      )}
      {onCleanupBrokenReferences && (
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
      )}
      {canDelete ? (
        <ChromeMenuItem
          icon={<Trash2 size={16} />}
          destructive
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id);
            onClose();
          }}
        >
          Delete Project
        </ChromeMenuItem>
      ) : null}
    </ChromeMenuShell>
  );
};

interface ProjectManagerProps {
  projects: Project[];
  currentProjectId: string | null;
  onCreateProject: (project: Project) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject?: (project: Project) => void;
  onDuplicateProject?: (project: Project) => void;
  isSidebar?: boolean;
  /** 侧栏向右展成全宽过渡为「主页」布局：列表同主页（居中、项项带框） */
  expandToHomeLayout?: boolean;
  onCloseSidebar?: () => void;
  onBackToHome?: () => void;
  viewMode?: 'map' | 'board' | 'table' | 'graph';
  activeProject?: Project | null;
  onExportCSV?: (project: Project) => void;
  onCheckData?: () => Promise<void>;
  onCleanupBrokenReferences?: (project: Project) => Promise<void>;
  syncStatus?: SyncStatus;
  themeColor?: string;
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeOpacityBottom?: number;
  onMapUiChromeOpacityBottomChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  uiDarkMode?: boolean;
  onUiDarkModeChange?: (dark: boolean) => void;
  currentMapStyle?: string;
  onMapStyleChange?: (styleId: string) => void;
  /** 加载项目：面板顶部分条，避免全屏遮罩 */
  showProjectLoadBar?: boolean;
  projectLoadProgress?: number;
  /**
   * 全屏壳「中间态」：只保留项目列表（与主页营销/设置/清理/New Project 等装饰分离），便于与主页之间做共享元素动效。
   */
  transitionListOnly?: boolean;
  /**
   * 从主页点进项目：即使 activeProject 已设置、expandToHomeLayout 变为 false，也需要让主页 Hero（START YOUR MAPPING）
   * 在过渡期保持挂载以便平滑滑出，避免瞬间卸载造成“瞬移”。
   */
  showHomeHeroInTransition?: boolean;
  /** 从项目回主页：已清空 current 但仍处于展开宽度过渡尾部，用于与主页共用同一套列表布局、避免瞬切 */
  sidebarExpandingToHome?: boolean;
  /** 仅取消“选中态高亮”（保持可见行收束逻辑不变） */
  clearSelectionInTransition?: boolean;
  /** 主页彩蛋模式：把标题交给物理层，UI 列表/按钮滑出 */
  easterEggMode?: boolean;
  onToggleEasterEggMode?: () => void;
  easterEggGravityY?: number;
  onEasterEggGravityYChange?: (v: number) => void;
  easterEggMouseConstraintStiffness?: number;
  onEasterEggMouseConstraintStiffnessChange?: (v: number) => void;
  /** 开发者示例项目维护模式：允许增删示例项目（仅本地 dev 入口切换） */
  exampleDevMaintenanceMode?: boolean;
  onExampleDevMaintenanceModeToggle?: () => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  projects,
  currentProjectId,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onUpdateProject,
  onDuplicateProject,
  syncStatus,
  isSidebar = false,
  expandToHomeLayout = false,
  onCloseSidebar,
  onBackToHome,
  viewMode = 'map',
  activeProject,
  onExportCSV,
  onCheckData,
  onCleanupBrokenReferences,
  themeColor = DEFAULT_THEME_COLOR,
  onThemeColorChange,
  mapUiChromeOpacity = 0.6,
  onMapUiChromeOpacityChange,
  mapUiChromeOpacityBottom = 0.4,
  onMapUiChromeOpacityBottomChange,
  mapUiChromeBlurPx = 4,
  onMapUiChromeBlurPxChange,
  uiDarkMode = false,
  onUiDarkModeChange,
  currentMapStyle = 'carto-light-nolabels',
  onMapStyleChange,
  showProjectLoadBar = false,
  projectLoadProgress = 0,
  transitionListOnly = false,
  showHomeHeroInTransition = false,
  sidebarExpandingToHome = false,
  clearSelectionInTransition = false,
  easterEggMode = false,
  onToggleEasterEggMode,
  easterEggGravityY,
  onEasterEggGravityYChange,
  easterEggMouseConstraintStiffness,
  onEasterEggMouseConstraintStiffnessChange,
  exampleDevMaintenanceMode = false,
  onExampleDevMaintenanceModeToggle
}) => {
  const devImportInputRef = useRef<HTMLInputElement>(null);
  const [devImportDragOver, setDevImportDragOver] = useState(false);
  const homeHeroMeasureRef = useRef<HTMLDivElement | null>(null);
  const [homeHeroMeasuredMaxH, setHomeHeroMeasuredMaxH] = useState<number>(520);
  const [renderHomeHeroShell, setRenderHomeHeroShell] = useState(false);
  const [collapseHomeHeroShell, setCollapseHomeHeroShell] = useState(false);
  const [homeHeroShellExpanded, setHomeHeroShellExpanded] = useState(false);
  /** 占位壳高度收完后为 true；占位 DOM 保留 maxHeight:0，不再卸载，避免最后一帧布局上跳 */
  const [homeHeroCollapsedDone, setHomeHeroCollapsedDone] = useState(true);

  const builtinExampleIds = useMemo(() => {
    try {
      const raw = localStorage.getItem('mapp-builtin-example-project-ids');
      const arr = raw ? (JSON.parse(raw) as unknown) : null;
      return new Set(Array.isArray(arr) ? (arr.filter((x) => typeof x === 'string') as string[]) : []);
    } catch {
      return new Set<string>();
    }
  }, [projects]);

  const displayProjects = useMemo(() => {
    const list = exampleDevMaintenanceMode
      ? projects.filter((p) => builtinExampleIds.has(p.id))
      : projects;
    return [...list].sort((a, b) => {
      const ax = builtinExampleIds.has(a.id) ? 0 : 1;
      const bx = builtinExampleIds.has(b.id) ? 0 : 1;
      if (ax !== bx) return ax - bx; // 示例项目置顶
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [projects, builtinExampleIds, exampleDevMaintenanceMode]);
  const chromeAppearance = useChromeAppearance();
  const mapChromeSurface = mapChromeSurfaceStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    chromeAppearance
  );
  const mapChromeHoverBg = mapChromeHoverBackground(mapUiChromeOpacity, chromeAppearance);
  const themeChromeInteractiveClass = `theme-chrome-interactive theme-chrome-interactive--${chromeAppearance}`;
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectKind, setNewProjectKind] = useState<ProjectKind>('mapping');
  const [newProjectNameShake, setNewProjectNameShake] = useState(false);
  const newProjectNameInputRef = useRef<HTMLInputElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImportingFromData, setIsImportingFromData] = useState(false);
  /** 导入失败时展示带位置说明的弹窗 */
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const newProjectFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCreateFileDragging, setIsCreateFileDragging] = useState(false);
  const [showThemeColorPicker, setShowThemeColorPicker] = useState(false);
  const [showHomeSettings, setShowHomeSettings] = useState(false);
  const [showAppearanceSettingsBlockInSettings, setShowAppearanceSettingsBlockInSettings] = useState(true);
  const [projectMoreAnchor, setProjectMoreAnchor] = useState<{
    row: DOMRectReadOnly;
    button: DOMRectReadOnly;
  } | null>(null);
  const [pendingBuiltinExampleUpdate, setPendingBuiltinExampleUpdate] = useState<Project | null>(null);
  const [isUpdatingBuiltinExample, setIsUpdatingBuiltinExample] = useState(false);

  const canUpdateBuiltinExample = (project: Project) =>
    builtinExampleIds.has(project.id) && project.name === LEGACY_BUILTIN_EXAMPLE_NAME;

  const handleConfirmBuiltinExampleUpdate = async () => {
    const target = pendingBuiltinExampleUpdate;
    if (!target || !onUpdateProject) return;

    setIsUpdatingBuiltinExample(true);
    try {
      const manifest = await fetchBuiltinExamplesManifest();
      const example = manifest.find((item) => item.id === BUILTIN_EXAMPLE_SOURCE_ID);
      if (!example) throw new Error('未找到最新示例');

      const response = await fetch(`/examples/${example.file}`, { cache: 'no-cache' });
      if (!response.ok) throw new Error('无法下载最新示例');

      const { project: latestExample } = parseExportPayload(await response.text());
      await onUpdateProject({
        ...latestExample,
        id: target.id,
        createdAt: target.createdAt,
        builtinExampleId: BUILTIN_EXAMPLE_SOURCE_ID
      });
      setPendingBuiltinExampleUpdate(null);
    } catch (error) {
      console.error('Failed to update builtin example:', error);
      alert('更新示例失败，请检查网络后重试。');
    } finally {
      setIsUpdatingBuiltinExample(false);
    }
  };

  const handleCreate = () => {
    if (!newProjectName.trim()) {
      setNewProjectNameShake(true);
      window.setTimeout(() => setNewProjectNameShake(false), 360);
      newProjectNameInputRef.current?.focus();
      return;
    }

    const newProject: Project = {
      id: generateId(),
      name: newProjectName,
      type: 'map',
      projectKind: newProjectKind,
      createdAt: Date.now(),
      notes: []
    };

    onCreateProject(newProject);
    setIsCreating(false);
    setNewProjectName('');
    setNewProjectKind('mapping');
    setIsCreateFileDragging(false);

    // If in sidebar mode, close sidebar after creation
    if (isSidebar && onCloseSidebar) {
      onCloseSidebar();
    }
  };

  const handleRename = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setEditingProjectId(projectId);
      setEditingProjectName(project.name);
      setOpenMenuId(null);
    }
  };

  const handleSaveRename = async () => {
    if (!editingProjectId || !onUpdateProject) return;

    const trimmedName = editingProjectName.trim();
    if (!trimmedName) {
      // 如果名称为空，取消重命名
      handleCancelRename();
      return;
    }

    const currentProject = projects.find(p => p.id === editingProjectId);
    if (!currentProject) {
      handleCancelRename();
      return;
    }

    // 如果名称没有变化，不需要保存
    if (trimmedName === currentProject.name) {
      handleCancelRename();
      return;
    }

    // 加载完整的项目数据（如果当前项目不是活动项目）
    let fullProject = currentProject;
    if (activeProject && activeProject.id === editingProjectId) {
      // 如果是当前活动项目，使用完整的活动项目数据
      fullProject = activeProject;
    } else {
      // 否则，尝试从存储中加载完整项目数据
      try {
        // 这里我们需要导入loadProject函数
        const { loadProject } = await import('../utils/persistence/storage');
        const loadedProject = await loadProject(editingProjectId, true);
        if (loadedProject) {
          fullProject = loadedProject;
        }
      } catch (error) {
        console.error('Failed to load full project data for rename:', error);
        // 如果加载失败，使用当前可用的数据
      }
    }

    onUpdateProject({
      ...fullProject,
      name: trimmedName
    });
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const handleCancelRename = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const handleDuplicateProject = async (project: Project) => {
    if (!onDuplicateProject) return;

    try {
      // Load the full project with images
      const fullProject = await loadProject(project.id, true);
      if (!fullProject) {
        alert('无法加载项目数据');
        return;
      }

      // Create a copy with new ID and name
      const duplicatedProject: Project = {
        id: generateId(),
        // 由项目状态层统一生成名称，避免此处与持久化层各加一次「(Copy)」。
        name: project.name,
        type: 'map',
        projectKind: sanitizeProjectKind(fullProject.projectKind),
        createdAt: Date.now(),
        notes: fullProject.notes.map(note => ({
          ...note,
          id: generateId(),
          createdAt: Date.now() // Ensure new timestamps
        })),
        frames: fullProject.frames?.map(frame => ({
          ...frame,
          id: generateId()
        })),
        connections: fullProject.connections?.map(conn => ({
          ...conn,
          id: generateId()
        })),
        themeColor: fullProject.themeColor,
        backgroundOpacity: fullProject.backgroundOpacity,
        graphLayers: fullProject.graphLayers,
        graphLayerStandard: fullProject.graphLayerStandard,
        graphFrameLayers: fullProject.graphFrameLayers,
        graphEmojiLayers: fullProject.graphEmojiLayers,
        graphNodeSize: fullProject.graphNodeSize,
        graphLabelFontPx: fullProject.graphLabelFontPx,
        graphEdgeWeight: fullProject.graphEdgeWeight,
        graphEdgeLabelFontPx: fullProject.graphEdgeLabelFontPx,
        graphEdgeCurve: fullProject.graphEdgeCurve,
        graphDefaultLayoutMode: fullProject.graphDefaultLayoutMode
      };

      onDuplicateProject(duplicatedProject);
      alert(`项目「${project.name}」已复制`);
    } catch (error) {
      console.error('Duplicate project failed:', error);
      alert('复制项目失败，请重试');
    }
  };

  const handleExportData = (project: Project) => {
    const standardNotes = project.notes;
    
    if (standardNotes.length === 0) {
      alert("This project has no standard note data");
      setOpenMenuId(null);
      return;
    }

    const coordHeader = 'Latitude, Longitude';
    
    // Create CSV content
    // Support multiple groups: Group1, Group2, Group3
    const headers = [coordHeader, 'Text Content', 'Tag1', 'Tag2', 'Tag3', 'Group1', 'Group2', 'Group3'];
    const rows = standardNotes.map(note => {
      const coords = `${note.coords.lat.toFixed(6)}, ${note.coords.lng.toFixed(6)}`;
      
      // Text content
      const text = note.text || '';
      
      // Tags
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      // Groups (support multiple groups)
      const groupNames = note.groupNames || [];
      // If no groupNames, use groupName (backward compatibility)
      const allGroups = groupNames.length > 0 
        ? groupNames 
        : (note.groupName ? [note.groupName] : []);
      
      const group1 = allGroups[0] || '';
      const group2 = allGroups[1] || '';
      const group3 = allGroups[2] || '';
      
      return [coords, text, tag1, tag2, tag3, group1, group2, group3];
    });

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-data.csv`;
    link.click();
    
    setOpenMenuId(null);
  };

  // Export full project data for cross-device sharing
  const handleExportFullProject = async (project: Project) => {
    try {
      // Load full project with images for export
      const fullProject = await loadProject(project.id, true);
      if (!fullProject) {
        alert('无法加载项目数据');
        return;
      }

      // Export complete project data as JSON (with all images loaded)
      // Ensure frames and connections are included
      const exportData = {
        version: '1.0',
        project: {
          id: fullProject.id,
          name: fullProject.name,
          type: fullProject.type,
          projectKind: sanitizeProjectKind(fullProject.projectKind),
          backgroundImage: fullProject.backgroundImage,
          createdAt: fullProject.createdAt,
          notes: fullProject.notes || [],
          frames: fullProject.frames || [],
          connections: fullProject.connections || [],
          themeColor: fullProject.themeColor,
          backgroundOpacity: fullProject.backgroundOpacity,
          graphLayers: fullProject.graphLayers,
          graphLayerStandard: fullProject.graphLayerStandard,
          graphFrameLayers: fullProject.graphFrameLayers,
          graphEmojiLayers: fullProject.graphEmojiLayers,
          graphNodeSize: fullProject.graphNodeSize,
          graphLabelFontPx: fullProject.graphLabelFontPx,
          graphEdgeWeight: fullProject.graphEdgeWeight,
          graphEdgeLabelFontPx: fullProject.graphEdgeLabelFontPx,
          graphEdgeCurve: fullProject.graphEdgeCurve,
          graphDefaultLayoutMode: fullProject.graphDefaultLayoutMode
        }
      };
      
      // Debug: log export data
      console.log('Exporting project:', {
        name: exportData.project.name,
        notes: exportData.project.notes.length,
        frames: exportData.project.frames.length,
        connections: exportData.project.connections.length
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${project.name}-project.json`;
      link.click();
      
      setOpenMenuId(null);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出项目失败');
    }
  };

  const handleExportMappViz = (project: Project) => {
    try {
      if (!(project.notes || []).length) {
        alert('该项目没有便签可导出');
        setOpenMenuId(null);
        return;
      }
      downloadMappVizJson(project);
      setOpenMenuId(null);
    } catch (error) {
      console.error('导出 viz.json 失败:', error);
      alert('导出 Bibliometrics 格式失败');
    }
  };

  // 数据检查：删除重复便签 + 压缩图片
  const handleCompressImages = async (project: Project) => {
    if (!onUpdateProject) {
      alert('无法执行数据检查：缺少项目更新方法');
      return;
    }

    const confirmCompress = confirm(`将对项目「${project.name}」执行数据检查：\n1) 删除重复便签\n2) 压缩所有图片（含背景/手绘）\n\n可能耗时较长，是否继续？`);
    if (!confirmCompress) return;

    try {
      // 1) 删除重复便签
      let duplicateCount = 0;
      const dedupedNotes: Note[] = [];
      for (const note of project.notes) {
        const found = dedupedNotes.find((n) => isDuplicateNote(n, note));
        if (found) {
          duplicateCount++;
          continue;
        }
        dedupedNotes.push(note);
      }

      // 2) 压缩图片
      let compressedCount = 0;
      let errorCount = 0;
      const updatedNotes = await Promise.all(
        dedupedNotes.map(async (note) => {
          const updatedNote = { ...note };
          
          // Compress images array
          if (note.images && note.images.length > 0) {
            const compressedImages = await Promise.all(
              note.images.map(async (image) => {
                try {
                  const compressed = await compressImageFromBase64(image);
                  compressedCount++;
                  return compressed;
                } catch (error) {
                  console.error('Error compressing image:', error);
                  errorCount++;
                  return image; // Return original if compression fails
                }
              })
            );
            updatedNote.images = compressedImages;
          }
          
          // Compress sketch
          if (note.sketch) {
            try {
              const compressed = await compressImageFromBase64(note.sketch);
              updatedNote.sketch = compressed;
              compressedCount++;
            } catch (error) {
              console.error('Error compressing sketch:', error);
              errorCount++;
            }
          }
          
          return updatedNote;
        })
      );

      const updatedProject: Project = {
        ...project,
        notes: updatedNotes
      };

      onUpdateProject(updatedProject);
      
      let message = `数据检查完成！删除重复便签 ${duplicateCount} 个，压缩图片 ${compressedCount} 张。`;
      if (errorCount > 0) {
        message += ` 有 ${errorCount} 张图片压缩失败（已保留原图）。`;
      }
      alert(message);
      setOpenMenuId(null);
    } catch (error) {
      console.error('数据检查失败:', error);
      alert('数据检查失败，请重试。');
    }
  };

  // Check if two notes are duplicates (same location and content)
  const isDuplicateNote = (note1: any, note2: any): boolean => {
    if (note1.text !== note2.text) return false;
    const latDiff = Math.abs(note1.coords?.lat - note2.coords?.lat);
    const lngDiff = Math.abs(note1.coords?.lng - note2.coords?.lng);
    return latDiff < 0.0001 && lngDiff < 0.0001;
  };

  // Import project from JSON data（merge 必须用参数传入：拖放时 setState 异步，不能依赖 isImportingFromData）
  const reportImportError = (message: string) => {
    setImportErrorMessage(message);
  };

  const handleImportProject = async (file: File, options?: { merge?: boolean }) => {
    const mergeIntoCurrent = !!(options?.merge && activeProject);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        reportImportError(
          formatImportErrorMessage(formatJsonParseFailure(text, parseErr), file.name)
        );
        return;
      }

      const structureErr = validateFullProjectImportPayload(data);
      if (structureErr) {
        reportImportError(formatImportErrorMessage(structureErr, file.name));
        return;
      }

      const importedProject = (data as { project: Project }).project;
      
      // Generate new ID to avoid conflicts
      const newProjectId = generateId();
      const newProject: Project = {
        id: newProjectId,
        name: `${importedProject.name} (Imported)`,
        type: 'map',
        projectKind: sanitizeProjectKind(importedProject.projectKind),
        createdAt: Date.now(),
        notes: importedProject.notes || [],
        frames: importedProject.frames || [],
        connections: importedProject.connections || [],
        themeColor: importedProject.themeColor,
        backgroundOpacity: importedProject.backgroundOpacity,
        graphLayers: importedProject.graphLayers,
        graphLayerStandard: importedProject.graphLayerStandard,
        graphFrameLayers: importedProject.graphFrameLayers,
        graphEmojiLayers: importedProject.graphEmojiLayers,
        graphNodeSize: importedProject.graphNodeSize,
        graphLabelFontPx: importedProject.graphLabelFontPx,
        graphEdgeWeight: importedProject.graphEdgeWeight,
        graphEdgeLabelFontPx: importedProject.graphEdgeLabelFontPx,
        graphEdgeCurve: importedProject.graphEdgeCurve,
        graphDefaultLayoutMode: importedProject.graphDefaultLayoutMode
      };

      // If importing into existing project (merge mode)
      if (mergeIntoCurrent && activeProject) {
        // Create ID mapping for notes, frames, and connections
        const noteIdMap = new Map<string, string>();
        const duplicateNoteIdMap = new Map<string, string>();
        const frameIdMap = new Map<string, string>();
        
        // Generate new IDs for imported notes (import ALL notes including compact and text)
        const importedNotes = (newProject.notes || []).map(note => {
          const newId = generateId();
          noteIdMap.set(note.id, newId);
          // 不要根据内容自动判断 variant，保持原始 variant 或默认为 standard
          const raw = (note as Note & { variant?: string }).variant || 'standard';
          const variant: 'standard' | 'image' = raw === 'image' ? 'image' : 'standard';
          return { ...note, id: newId, variant };
        });
        
        const noteCounts = {
          standard: importedNotes.filter(n => n.variant === 'standard').length,
          image: importedNotes.filter(n => n.variant === 'image').length,
          total: importedNotes.length
        };
        console.log('Merging notes into existing project:', {
          totalNotes: noteCounts.total,
          standard: noteCounts.standard,
          image: noteCounts.image,
          frames: (newProject.frames || []).length,
          connections: (newProject.connections || []).length
        });
        
        // Generate new IDs for imported frames
        const importedFrames = (newProject.frames || []).map(frame => {
          const newId = generateId();
          frameIdMap.set(frame.id, newId);
          return { ...frame, id: newId };
        });
        
        // Update note groupId / groupIds to new frame IDs
        importedNotes.forEach(note => {
          if (note.groupId && frameIdMap.has(note.groupId)) {
            note.groupId = frameIdMap.get(note.groupId)!;
          }
          if (note.groupIds?.length) {
            note.groupIds = note.groupIds
              .map(gid => (frameIdMap.has(gid) ? frameIdMap.get(gid)! : gid));
          }
        });
        
        // Merge notes with duplicate detection
        if (activeProject) {
          const uniqueImportedNotes = importedNotes.filter(importedNote => {
            const match = activeProject.notes.find(existingNote =>
              isDuplicateNote(importedNote, existingNote)
            );
            if (match) {
              duplicateNoteIdMap.set(importedNote.id, match.id);
              return false;
            }
            return true;
          });
          
          const mergedNotes = [...activeProject.notes, ...uniqueImportedNotes];

          const resolveMergedNoteId = (oldImportedId: string): string | undefined => {
            if (noteIdMap.has(oldImportedId)) return noteIdMap.get(oldImportedId)!;
            if (duplicateNoteIdMap.has(oldImportedId)) return duplicateNoteIdMap.get(oldImportedId)!;
            return oldImportedId;
          };

          const importedConnections = (newProject.connections || []).map(conn => ({
            ...conn,
            id: generateId(),
            fromNoteId: resolveMergedNoteId(conn.fromNoteId) ?? conn.fromNoteId,
            toNoteId: resolveMergedNoteId(conn.toNoteId) ?? conn.toNoteId
          })).filter(conn =>
            mergedNotes.some(n => n.id === conn.fromNoteId) &&
            mergedNotes.some(n => n.id === conn.toNoteId)
          );

          const mergedFrames = [...(activeProject.frames || []), ...importedFrames];
          const mergedConnections = [...(activeProject.connections || []), ...importedConnections];

          const updatedProject = {
            ...activeProject,
            notes: mergedNotes,
            frames: mergedFrames,
            connections: mergedConnections
          };
          
          // Save project using new storage system (this will handle image separation)
          await saveProject(updatedProject);
          
          // Reload the project to get the version with image IDs (not Base64)
          const savedProject = await loadProject(updatedProject.id, false);
          if (savedProject && onUpdateProject) {
            onUpdateProject(savedProject);
          } else if (onUpdateProject) {
            // Fallback: use original project if reload fails
            onUpdateProject(updatedProject);
          }
          
          const duplicateCount = importedNotes.length - uniqueImportedNotes.length;
          if (duplicateCount > 0) {
            alert(`Successfully merged ${uniqueImportedNotes.length} new notes. ${duplicateCount} duplicate(s) were skipped.`);
          } else {
            alert(`Successfully merged ${uniqueImportedNotes.length} new note(s).`);
          }
        }
      } else {
        // Create as new project - regenerate IDs 并保持 frame / 连线与便签 ID 一致
        const noteIdMap = new Map<string, string>();
        const frameIdMap = new Map<string, string>();

        const regeneratedNotes = (newProject.notes || []).map(note => {
          const raw = (note as Note & { variant?: string }).variant || 'standard';
          const variant: 'standard' | 'image' = raw === 'image' ? 'image' : 'standard';
          const newId = generateId();
          noteIdMap.set(note.id, newId);
          return {
            ...note,
            id: newId,
            variant
          };
        });

        const regeneratedFrames = (newProject.frames || []).map(frame => {
          const newId = generateId();
          frameIdMap.set(frame.id, newId);
          return { ...frame, id: newId };
        });

        regeneratedNotes.forEach(note => {
          if (note.groupId && frameIdMap.has(note.groupId)) {
            note.groupId = frameIdMap.get(note.groupId)!;
          }
          if (note.groupIds?.length) {
            note.groupIds = note.groupIds.map(gid =>
              frameIdMap.has(gid) ? frameIdMap.get(gid)! : gid
            );
          }
        });

        const regeneratedConnections = (newProject.connections || []).map(conn => ({
          ...conn,
          id: generateId(),
          fromNoteId: noteIdMap.get(conn.fromNoteId) ?? conn.fromNoteId,
          toNoteId: noteIdMap.get(conn.toNoteId) ?? conn.toNoteId
        }));
        
        // Debug: count notes by variant
        const noteCounts = {
          standard: regeneratedNotes.filter(n => n.variant === 'standard').length,
          image: regeneratedNotes.filter(n => n.variant === 'image').length,
          total: regeneratedNotes.length
        };
        
        const projectToCreate = {
          ...newProject,
          notes: regeneratedNotes,
          frames: regeneratedFrames,
          connections: regeneratedConnections
        };
        
        // Save project using new storage system (this will handle image separation)
        // This will convert Base64 images to image IDs
        try {
          await saveProject(projectToCreate);
          console.log('Project saved successfully');
        } catch (error) {
          console.error('Error saving project:', error);
          reportImportError(
            formatImportErrorMessage(
              {
                title: '保存导入项目失败',
                location: 'IndexedDB / saveProject',
                detail: error instanceof Error ? error.message : 'Unknown error'
              },
              file.name
            )
          );
          return;
        }
        
        // Reload the project to get the version with image IDs (not Base64)
        const savedProject = await loadProject(projectToCreate.id, false);
        if (savedProject) {
          console.log('Project reloaded successfully, adding to list');
          // Ensure frames and connections are included in reloaded project
          const projectWithFramesAndConnections = {
            ...savedProject,
            frames: savedProject.frames || projectToCreate.frames || [],
            connections: savedProject.connections || projectToCreate.connections || []
          };
          console.log('Project with frames and connections:', {
            frames: projectWithFramesAndConnections.frames.length,
            connections: projectWithFramesAndConnections.connections.length
          });
          // Add to projects list with separated images
          onCreateProject(projectWithFramesAndConnections);
          
          const itemCounts = [];
          if (regeneratedNotes.length > 0) itemCounts.push(`${regeneratedNotes.length} note(s)`);
          if (regeneratedFrames.length > 0) itemCounts.push(`${regeneratedFrames.length} frame(s)`);
          if (regeneratedConnections.length > 0) itemCounts.push(`${regeneratedConnections.length} connection(s)`);
          
          const message = itemCounts.length > 0 
            ? `Successfully created new project "${newProject.name}" with ${itemCounts.join(', ')}.`
            : `Successfully created new project "${newProject.name}".`;
          alert(message);
        } else {
          console.error('Failed to reload project after save, trying to reload project list');
          // Try to reload all projects to see if it's there
          const allProjects = await loadAllProjects(false);
          const foundProject = allProjects.find(p => p.id === projectToCreate.id);
          if (foundProject) {
            console.log('Project found in all projects, adding to list');
            onCreateProject(foundProject);
            alert(`Successfully imported project "${newProject.name}".`);
          } else {
            console.error('Project not found after save, using fallback');
            // Fallback: use original project if reload fails
            onCreateProject(projectToCreate);
            alert(`Project "${newProject.name}" imported, but there may be an issue with image storage.`);
          }
        }
      }
      
      setShowImportDialog(false);
      setIsImportingFromData(false);
      setIsCreating(false);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = '';
      }
      if (newProjectFileInputRef.current) {
        newProjectFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to import project:', error);
      reportImportError(formatUnexpectedImportError(error, file.name));
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImportProject(e.target.files[0], {
        merge: !!(isImportingFromData && activeProject)
      });
    }
  };

  // Drag and drop handlers for JSON import（新建项目对话框打开时由窗口自己收，不叠主页遮罩）
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCreating || !isFileDragTypes(e.dataTransfer.types)) return;
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCreating || !isFileDragTypes(e.dataTransfer.types)) return;
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (
      isFileDragLeavingViewport(x, y) ||
      x < rect.left ||
      x > rect.right ||
      y < rect.top ||
      y > rect.bottom
    ) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isCreating) return;

    const jsonFile = pickJsonFile(e.dataTransfer.files);
    if (jsonFile) {
      handleImportProject(jsonFile, { merge: !!activeProject });
    }
  };

  const closeCreateDialog = () => {
    setIsCreating(false);
    setNewProjectName('');
    setNewProjectKind('mapping');
    setIsCreateFileDragging(false);
  };

  const handleCreateDialogDragEnter = (e: React.DragEvent) => {
    if (!isFileDragTypes(e.dataTransfer.types)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsCreateFileDragging(true);
  };

  const handleCreateDialogDragOver = (e: React.DragEvent) => {
    if (!isFileDragTypes(e.dataTransfer.types)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCreateDialogDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (
      isFileDragLeavingViewport(x, y) ||
      x < rect.left ||
      x > rect.right ||
      y < rect.top ||
      y > rect.bottom
    ) {
      setIsCreateFileDragging(false);
    }
  };

  const handleCreateDialogDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCreateFileDragging(false);
    const jsonFile = pickJsonFile(e.dataTransfer.files);
    if (!jsonFile) return;
    closeCreateDialog();
    void handleImportProject(jsonFile, { merge: false });
  };

  useEffect(() => {
    if (isCreating) setIsDragging(false);
  }, [isCreating]);

  /** 回主页收尾：已无当前项目但仍在 expand 动画尾部 → 用主页壳与列表布局，只在之后一帧再关 transitionListOnly */
  const finishingReturnToHomeLayout =
    isSidebar && !!sidebarExpandingToHome && !activeProject;
  /** 占位收完前占布局；收完后壳保留 DOM（maxHeight:0），不再参与 pt-24 / 中间态壳判断 */
  const homeHeroShellAffectsLayout = renderHomeHeroShell && !homeHeroCollapsedDone;

  const useTransitionShell =
    !!transitionListOnly &&
    !finishingReturnToHomeLayout &&
    !showHomeHeroInTransition &&
    !homeHeroShellAffectsLayout &&
    // 进入项目中间态若要求全屏壳（expandToHomeLayout），不要退回紧凑 transition shell
    !expandToHomeLayout;

  const homeLikeList =
    (!isSidebar || expandToHomeLayout || homeHeroShellAffectsLayout) &&
    (!transitionListOnly || finishingReturnToHomeLayout);
  const compactProjectList =
    (isSidebar && !expandToHomeLayout) ||
    (transitionListOnly && !finishingReturnToHomeLayout && !expandToHomeLayout);

  /** 主页 Hero / CTA：稳定主页、主页进入、回主页显示；项目间切换全屏中间态不闪 Hero */
  const showHomeHeroShell =
    !isSidebar ||
    showHomeHeroInTransition ||
    !!sidebarExpandingToHome ||
    (expandToHomeLayout && !activeProject && !transitionListOnly);
  const homeHeroAnimateOut = !!transitionListOnly && !finishingReturnToHomeLayout;
  /** 视觉层面的“主页壳”：当占位壳还在收缩/展开时，继续使用主页的 padding 与布局，避免顶部间距瞬间归零 */
  const expandToHomeLayoutVisual =
    expandToHomeLayout || showHomeHeroInTransition || homeHeroShellAffectsLayout;

  /**
   * 侧栏「紧凑列表」里 pt-28 是为顶部 Home/设置/关闭 留空；
   * 从主页进项目时上方仍有 Hero 占位在收缩，若同时切到 pt-28，会与 mt-8 差一截，列表会整段向下跳。
   * 占位卸掉后再用 pt-28。
   */
  const listCompactTopToolbarPadding =
    compactProjectList && (!renderHomeHeroShell || homeHeroCollapsedDone);

  useEffect(() => {
    if (showHomeHeroShell) {
      setRenderHomeHeroShell(true);
      setCollapseHomeHeroShell(false);
      setHomeHeroShellExpanded(false);
      setHomeHeroCollapsedDone(false);
      return;
    }
    // 从“显示”到“隐藏”：标题/CTA 立刻隐藏，占位壳收高度到 0 后保留 DOM，避免卸载占位导致最后一小段上跳
    setHomeHeroShellExpanded(false);
    if (renderHomeHeroShell) {
      setCollapseHomeHeroShell(true);
      setHomeHeroCollapsedDone(false);
      const ms = Math.round(PROJECT_OPEN_SLIDE_DURATION_S * 1000);
      const id = window.setTimeout(() => {
        setHomeHeroCollapsedDone(true);
      }, ms + 100);
      return () => window.clearTimeout(id);
    }
    setHomeHeroCollapsedDone(true);
  }, [showHomeHeroShell, renderHomeHeroShell]);

  useLayoutEffect(() => {
    if (!renderHomeHeroShell || collapseHomeHeroShell || homeHeroCollapsedDone) return;
    const el = homeHeroMeasureRef.current;
    if (!el) return;
    // 读一次实际高度，作为 maxHeight 动画目标值（避免从/到 auto）
    const next = Math.max(0, Math.round(el.scrollHeight));
    if (next > 0 && Math.abs(next - homeHeroMeasuredMaxH) > 2) {
      setHomeHeroMeasuredMaxH(next);
    }
  }, [
    renderHomeHeroShell,
    collapseHomeHeroShell,
    homeHeroCollapsedDone,
    homeLikeList,
    compactProjectList,
    transitionListOnly,
    easterEggMode
  ]);

  const containerClass = useTransitionShell
    ? 'h-full w-full min-h-0 overflow-hidden flex flex-col relative'
    : expandToHomeLayoutVisual
      ? isSidebar
        ? // 全宽中间态：不要 border-r / shadow-2xl，否则会闪默认黑边
          'h-full w-full min-h-0 flex flex-col items-center justify-start pt-24 pb-0 relative'
        : 'h-full w-full min-h-0 flex flex-col items-center justify-start pt-24 pb-0 p-4 relative'
      : isSidebar
        ? 'h-full w-full flex flex-col border-r overflow-hidden'
        : 'w-full h-[100dvh] min-h-0 overflow-y-auto theme-surface-scrollbar flex flex-col items-center justify-start pt-40 pb-0 p-4 relative';

  const titleClass =
    'text-[clamp(4rem,21vw,6rem)] md:text-8xl font-black text-theme-chrome-fg tracking-tighter mb-4 text-center drop-shadow-sm leading-[0.9] flex flex-col';

  useLayoutEffect(() => {
    if (!openMenuId || homeLikeList) {
      setProjectMoreAnchor(null);
      return;
    }
    const update = () => {
      const row = document.querySelector(
        `[data-pm-project-row="${CSS.escape(openMenuId)}"]`
      ) as HTMLElement | null;
      const btn = row?.querySelector('[data-pm-more-btn]') as HTMLElement | null;
      if (row && btn) {
        setProjectMoreAnchor({
          row: row.getBoundingClientRect(),
          button: btn.getBoundingClientRect()
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [openMenuId, homeLikeList]);

  /** 点菜单外空白关闭「更多」（无蒙层）；保留菜单内与任意「更多」按钮上的点击 */
  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      const el = t instanceof Element ? t : (t as Node | null)?.parentElement;
      if (!el) return;
      if (el.closest('[data-pm-more-menu]')) return;
      if (el.closest('[data-pm-more-btn]')) return;
      setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [openMenuId]);

  const mainHomeChrome = (
    <>
      {/* 全屏启动页或侧栏展成主页布局：设置入口与 chrome 设定一致，与当前是否打开项目无关 */}
      {true &&
        !transitionListOnly &&
        onThemeColorChange &&
        onMapUiChromeOpacityChange &&
        onMapUiChromeOpacityBottomChange &&
        onMapUiChromeBlurPxChange && (
        <>
          {!isSidebar || expandToHomeLayout ? (
            <div className="absolute top-4 left-4 z-[2010] flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  setShowAppearanceSettingsBlockInSettings(true);
                  setShowHomeSettings(true);
                }}
                className={`${themeChromeInteractiveClass} flex h-10 w-10 items-center justify-center rounded-xl`}
                title="设置"
                aria-expanded={showHomeSettings}
              >
                <Palette size={22} strokeWidth={2} aria-hidden />
              </button>
              {onToggleEasterEggMode && !activeProject ? (
                <button
                  type="button"
                  onClick={() => onToggleEasterEggMode()}
                  className={`${themeChromeInteractiveClass} flex h-10 w-10 items-center justify-center rounded-xl`}
                  title="彩蛋"
                  aria-pressed={easterEggMode}
                >
                  <Sparkles size={22} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              {onExampleDevMaintenanceModeToggle &&
              typeof window !== 'undefined' &&
              (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? (
                <button
                  type="button"
                  onClick={() => onExampleDevMaintenanceModeToggle()}
                  className={`${themeChromeInteractiveClass} flex h-10 w-10 items-center justify-center rounded-xl`}
                  aria-pressed={exampleDevMaintenanceMode}
                  title="dev"
                >
                  <Code2 size={22} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
          <ChromeWindow
            open={showHomeSettings}
            // 主题色选择器是设置窗口之上的子对话框；父窗口不应抢先处理 Escape。
            onClose={() => {
              if (!showThemeColorPicker) setShowHomeSettings(false);
            }}
            backdropLabel="关闭设置"
            placement="center"
            compactBehavior="none"
            presenceKind="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-settings-title"
            className="flex w-[calc(100vw-1.5rem)] max-h-[min(85dvh,85vh)] min-w-0 max-w-md flex-col sm:w-[min(32rem,calc(100vw-2rem))] sm:max-w-lg"
            style={mapChromeSurface}
          >
                    <ChromeWindowHeader
                      title="设置"
                      titleId="home-settings-title"
                      onClose={() => setShowHomeSettings(false)}
                    />
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pt-2 pb-3 theme-surface-scrollbar">
                      {showAppearanceSettingsBlockInSettings ? (
                        <AppearanceSettingsBlock
                          themeColor={themeColor}
                          onRequestThemeEdit={() => {
                            setShowThemeColorPicker(true);
                          }}
                          uiDarkMode={uiDarkMode}
                          onUiDarkModeChange={onUiDarkModeChange ?? (() => {})}
                          mapUiChromeOpacity={mapUiChromeOpacity}
                          onMapUiChromeOpacityChange={onMapUiChromeOpacityChange}
                          mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
                          onMapUiChromeOpacityBottomChange={onMapUiChromeOpacityBottomChange}
                          mapUiChromeBlurPx={mapUiChromeBlurPx}
                          onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange}
                          {...(!isSidebar || expandToHomeLayout
                            ? {
                                easterEggGravityY,
                                onEasterEggGravityYChange,
                                easterEggMouseConstraintStiffness,
                                onEasterEggMouseConstraintStiffnessChange
                              }
                            : {})}
                        />
                      ) : null}
                    </div>
          </ChromeWindow>
        </>
      )}

      {isSidebar && !expandToHomeLayout && !transitionListOnly && (
        <>
          <div className="project-sidebar-actions project-sidebar-actions--left absolute top-4 left-4 z-[2010] flex flex-nowrap items-center gap-2">
            <button
              onClick={() => {
                if (onBackToHome) onBackToHome();
              }}
              className={`${themeChromeInteractiveClass} project-sidebar-action p-2 rounded-xl`}
            >
              <Home size={24} />
            </button>
            {onThemeColorChange &&
              onMapUiChromeOpacityChange &&
              onMapUiChromeOpacityBottomChange &&
              onMapUiChromeBlurPxChange && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAppearanceSettingsBlockInSettings(true);
                    setShowHomeSettings(true);
                  }}
                  className={`${themeChromeInteractiveClass} project-sidebar-action p-2 rounded-xl`}
                  title="设置"
                  aria-expanded={showHomeSettings}
                >
                  <Palette size={22} strokeWidth={2} aria-hidden />
                </button>
              )}
          </div>
          <div className="project-sidebar-actions project-sidebar-actions--right absolute top-4 right-4 z-[2000] flex flex-nowrap items-center gap-2">
            {activeProject && syncStatus === 'idle' && getLastSyncTime() && (
              <div
                className={`${themeChromeInteractiveClass} project-sidebar-action project-sidebar-sync-status flex items-center justify-center w-10 h-10 rounded-xl cursor-help`}
                title={`Synced: ${new Date(getLastSyncTime()!).toLocaleString('en-US')}`}
              >
                <Cloud size={20} />
              </div>
            )}
            <button 
              onClick={onCloseSidebar} 
              className={`${themeChromeInteractiveClass} project-sidebar-action w-10 h-10 p-2 rounded-xl flex items-center justify-center`}
            >
          <X size={24} />
        </button>
          </div>
        </>
      )}

      {/* 顶部 Hero/CTA：先收缩高度到 0 再卸载，避免进入项目时布局瞬变 */}
      {renderHomeHeroShell ? (
        <MotionDiv
          className="w-full shrink-0"
          initial={false}
          animate={{
            maxHeight: collapseHomeHeroShell ? 0 : homeHeroMeasuredMaxH,
            opacity: collapseHomeHeroShell ? 0 : 1
          }}
          transition={{
            duration: sidebarExpandingToHome
              ? PROJECT_RETURN_HOME_LIST_MOVE_DURATION_S
              : PROJECT_OPEN_SLIDE_DURATION_S,
            ease: sidebarExpandingToHome
              ? PROJECT_RETURN_HOME_LIST_MOVE_EASE
              : PROJECT_OPEN_SLIDE_EASE
          }}
          onAnimationComplete={() => {
            if (collapseHomeHeroShell) {
              setHomeHeroCollapsedDone(true);
            } else {
              // 只在“展开到位”时允许标题/CTA入场，避免高度没到位就开始出现造成卡顿/抖动
              setHomeHeroShellExpanded(true);
            }
          }}
          style={{ overflow: 'hidden', willChange: 'max-height, opacity' }}
        >
          <div ref={homeHeroMeasureRef}>
            <MotionDiv
              className="relative z-[5] flex w-full shrink-0 flex-col items-center overflow-visible pointer-events-none"
              initial={false}
              animate={
                easterEggMode
                  ? { opacity: 0 }
                  : !homeHeroShellExpanded || homeHeroAnimateOut
                    ? { opacity: 0 }
                    : { opacity: 1 }
              }
              transition={{
                duration: PROJECT_OPEN_SLIDE_DURATION_S,
                ease: PROJECT_OPEN_SLIDE_EASE
              }}
              style={{ willChange: 'opacity' }}
            >
              <h1
                className={titleClass}
                style={easterEggMode ? { visibility: 'hidden' } : undefined}
              >
                {HOME_HERO_LINES.map((line, lineIndex) => (
                  <span key={line} className="block whitespace-nowrap">
                    {Array.from(line).map((character, characterIndex) => {
                      const isPin = isHomeHeroPinCharacter(character);
                      const pose = isPin
                        ? { rotateDeg: 0, translateYPx: 0 }
                        : getHomeHeroCharacterPose(lineIndex, characterIndex);
                      return (
                        <span
                          key={`${line}-${characterIndex}`}
                          data-home-hero-character="true"
                          className={`title-character${isPin ? ' title-character--pin' : ''}`}
                          style={
                            {
                              '--title-character-rotate': `${pose.rotateDeg}deg`,
                              '--title-character-offset-y': `${pose.translateYPx}px`
                            } as React.CSSProperties
                          }
                        >
                          {character}
                        </span>
                      );
                    })}
                  </span>
                ))}
              </h1>
            </MotionDiv>

            <MotionDiv
              className="relative z-[6] flex w-full shrink-0 flex-col items-center overflow-visible"
              initial={false}
              animate={
                easterEggMode
                  ? { y: '200vh', opacity: 0 }
                  : !homeHeroShellExpanded || homeHeroAnimateOut
                    ? { opacity: 0 }
                    : { opacity: 1 }
              }
              transition={{
                duration: PROJECT_OPEN_SLIDE_DURATION_S,
                ease: PROJECT_OPEN_SLIDE_EASE
              }}
              style={{
                willChange: 'transform, opacity',
                pointerEvents: easterEggMode || homeHeroAnimateOut ? 'none' : 'auto'
              }}
            >
              {/* dev 维护模式：上传/拖拽区域替换 New Project；两者同尺寸同圆角 */}
              <div className="mt-0 w-full max-w-md px-4">
                {exampleDevMaintenanceMode ? (
                  <div
                    className={`${themeChromeInteractiveClass} flex h-16 w-full cursor-pointer items-center justify-center rounded-xl border`}
                    data-chrome-selected={devImportDragOver || undefined}
                    onClick={() => devImportInputRef.current?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDevImportDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDevImportDragOver(false);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDevImportDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleImportProject(f);
                    }}
                    title="拖拽 JSON 到此处导入为项目"
                  >
                    <Upload size={22} strokeWidth={2} aria-hidden />
                    <input
                      ref={devImportInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImportProject(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className={`${themeChromeInteractiveClass} flex h-16 w-full items-center justify-center rounded-xl border`}
                  >
                    <Plus size={22} strokeWidth={2} aria-hidden />
                  </button>
                )}
              </div>
            </MotionDiv>
          </div>
        </MotionDiv>
      ) : null}

      <MotionDiv
        initial={false}
        transition={
          sidebarExpandingToHome
            ? {
                y: {
                  duration: PROJECT_RETURN_HOME_LIST_MOVE_DURATION_S,
                  ease: PROJECT_RETURN_HOME_LIST_MOVE_EASE
                },
                opacity: {
                  duration: PROJECT_OPEN_SLIDE_DURATION_S,
                  ease: PROJECT_OPEN_SLIDE_EASE
                }
              }
            : {
                duration: PROJECT_OPEN_SLIDE_DURATION_S,
                ease: PROJECT_OPEN_SLIDE_EASE
              }
        }
        animate={
          easterEggMode
            ? { y: '200vh', opacity: 0 }
            : sidebarExpandingToHome
              // 布局从侧栏 pt-28 切到主页 pt-24 + mt-8 会先产生 16px 位移；
              // 用起始反向偏移抵消它，再与 Hero 高度同步归零。
              ? { y: [-16, 0], opacity: 1 }
            : // 不再对列表做 y 补偿：Hero 占位已有 maxHeight 收缩，且 compact 时 pt 与占位联动；
              // 叠加 y 会与布局变化同向/反向交错，出现「先下再上」的错觉。
              { y: 0, opacity: 1 }
        }
        className={
          isSidebar
          ? `min-h-0 flex-1 w-full max-w-md mx-auto overflow-y-auto overscroll-contain ${
              transitionListOnly ? 'scrollbar-hide' : 'theme-surface-scrollbar'
            } px-4 ${listCompactTopToolbarPadding ? 'pt-28 pb-4' : 'mt-8 pb-8'}`
            : compactProjectList
            ? `flex-1 overflow-y-auto overscroll-contain ${
                transitionListOnly ? 'scrollbar-hide' : 'theme-surface-scrollbar'
              } w-full px-4 pb-4 ${listCompactTopToolbarPadding ? 'pt-28' : 'mt-8'}`
              : 'min-h-0 flex-1 w-full max-w-md mt-8 overflow-y-auto overscroll-contain theme-surface-scrollbar bg-transparent p-4 pb-8'
        }
        style={{
          pointerEvents: easterEggMode ? 'none' : 'auto',
          ...(compactProjectList
            ? {
                touchAction: 'pan-y',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }
            : {})
        }}
        onTouchStart={(e) => {
          if (compactProjectList) {
            e.stopPropagation();
          }
        }}
        onTouchMove={(e) => {
          if (compactProjectList) {
            e.stopPropagation();
          }
        }}
        onWheel={(e) => {
          if (compactProjectList) {
            e.stopPropagation();
          }
        }}
        onScroll={(e) => {
          if (compactProjectList) {
            e.stopPropagation();
          }
        }}
      >
        <div className="flex flex-col gap-3">
          {displayProjects.map(p => {
            // 仅在「项目 -> 主页」中间态取消选中高亮；收束可见行的逻辑仍使用原 currentProjectId。
            const isCurrentOpen =
              !clearSelectionInTransition &&
              currentProjectId != null &&
              p.id === currentProjectId;
            const isInteractionSelected = isCurrentOpen || openMenuId === p.id;
            const hideOtherWhenTransition =
              transitionListOnly && currentProjectId != null && p.id !== currentProjectId;
            const rowOpacity = hideOtherWhenTransition ? 0 : 1;
            return (
            <MotionDiv
              key={p.id}
              data-pm-project-row={p.id}
              data-chrome-selected={isInteractionSelected || undefined}
              className={`${themeChromeInteractiveClass} group relative flex items-center justify-between rounded-2xl border border-solid p-4`}
              animate={{ opacity: rowOpacity }}
              transition={{
                opacity: {
                  duration: PROJECT_OPEN_SLIDE_DURATION_S,
                  ease: PROJECT_OPEN_SLIDE_EASE
                }
              }}
              style={{
                pointerEvents: hideOtherWhenTransition ? 'none' : undefined
              }}
            >
              <div 
                className="flex-1 cursor-pointer" 
                onClick={() => !editingProjectId && onSelectProject(p.id)}
              >
                {editingProjectId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveRename();
                        } else if (e.key === 'Escape') {
                          handleCancelRename();
                        }
                      }}
                      onBlur={() => {
                        // 当输入框失去焦点时，自动保存（如果有变化）
                        const trimmedName = editingProjectName.trim();
                        if (trimmedName && trimmedName !== p.name) {
                          handleSaveRename();
                        } else {
                          handleCancelRename();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`chrome-input-well chrome-input-well--${chromeAppearance} flex-1 rounded-lg px-2 py-1 text-lg font-bold outline-none`}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveRename();
                      }}
                      className="p-1 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelRename();
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="project-list-title text-lg font-bold leading-tight">
                        {p.name}
                      </div>
                      {isProjectKind(p.projectKind) ? (
                        <span
                          className="project-list-kind-badge shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                          title={p.projectKind === 'graph' ? 'Graph 项目' : 'Mapping 项目'}
                        >
                          {projectKindLabel(p.projectKind)}
                        </span>
                      ) : null}
                      {builtinExampleIds.has(p.id) ? (
                        <span
                          className="project-list-kind-badge shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold"
                          title="示例项目"
                        >
                          示例
                        </span>
                      ) : null}
                    </div>
                    <div className="project-list-meta mt-1 flex items-center gap-1 text-xs">
                      {p.projectKind === 'graph' ? (
                        <GitBranch size={12} />
                      ) : (
                        <MapIcon size={12} />
                      )}
                      {formatDate(p.createdAt)}
                    </div>
                  </>
                )}
              </div>

              <div className="relative z-[1]">
                <button
                  type="button"
                  data-pm-more-btn
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === p.id ? null : p.id);
                  }}
                  className="project-list-more-button rounded-full p-2"
                  aria-expanded={openMenuId === p.id}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </MotionDiv>
            );
          })}
          
          {displayProjects.length === 0 && (homeLikeList || transitionListOnly) && (
             <div className="text-center py-8 italic opacity-60 text-theme-chrome-fg">No projects yet. Start one!</div>
          )}
        </div>
      </MotionDiv>
    </>
  );

  return (
    <div 
      className={`${containerClass} ${isDragging ? 'ring-4 ring-offset-2' : ''}`}
      style={{
        backgroundColor: themeColor,
        // 侧栏常态右缘与主题同色；全宽中间态不画边，避免 expand 时 borderColor 被清掉闪出默认黑边
        borderColor:
          isSidebar && !useTransitionShell && !expandToHomeLayoutVisual ? themeColor : undefined,
        boxShadow: isDragging ? `0 0 0 4px ${themeColor}` : undefined
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showProjectLoadBar ? (
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 z-[2008] h-[3px] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={projectLoadProgress}
          aria-label="加载项目进度"
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{ backgroundColor: 'var(--theme-chrome-fg)' }}
          />
          {projectLoadProgress < 8 ? (
            <div
              className="project-manager-load-bar-fill--indeterminate absolute top-0 h-full"
              style={{ backgroundColor: 'var(--theme-chrome-fg)' }}
            />
          ) : (
            <div
              className="absolute top-0 left-0 h-full transition-[width] duration-300 ease-out"
              style={{
                width: `${Math.min(100, Math.max(5, projectLoadProgress))}%`,
                backgroundColor: 'var(--theme-chrome-fg)'
              }}
            />
          )}
        </div>
      ) : null}
      <ChromeDropOverlay
        open={isDragging && !isCreating}
        themeColor={themeColor}
        chromeOpacity={mapUiChromeOpacity}
        chromeBlurPx={mapUiChromeBlurPx}
        title="拖入项目 JSON 文件以合并"
        description="重复数据会自动跳过"
        onDismiss={() => setIsDragging(false)}
      />
      {mainHomeChrome}

      <ChromeWindow
        open={isCreating}
        onClose={closeCreateDialog}
        backdropLabel="关闭新建项目"
        placement="center"
        compactBehavior="none"
        presenceKind="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="新建项目"
        className="flex w-[calc(100vw-1.5rem)] max-h-[min(85dvh,85vh)] min-w-0 max-w-md flex-col sm:w-[min(32rem,calc(100vw-2rem))] sm:max-w-lg"
        style={mapChromeSurface}
        onDragEnter={handleCreateDialogDragEnter}
        onDragOver={handleCreateDialogDragOver}
        onDragLeave={handleCreateDialogDragLeave}
        onDrop={handleCreateDialogDrop}
      >
        <ChromeWindowHeader
          title="新建项目"
          onClose={closeCreateDialog}
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 pt-2 pb-3 theme-surface-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-gray-600">项目名称</span>
              <ChromeSearchField
                ref={newProjectNameInputRef}
                autoFocus
                showLeadingIcon={false}
                themeColor={themeColor}
                containerClassName={`min-w-0 flex-1 ${newProjectNameShake ? 'chrome-field-shake' : ''}`.trim()}
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="输入名称"
              />
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-1.5 shrink-0 text-xs font-medium text-gray-600">项目类型</span>
              <div className="min-w-0 flex-1">
                <ChromeSegmentedControl
                  aria-label="项目类型"
                  value={newProjectKind}
                  onChange={setNewProjectKind}
                  options={[
                    {
                      id: 'mapping',
                      label: (
                        <span className="flex items-center gap-1.5">
                          <MapIcon size={14} /> Mapping
                        </span>
                      )
                    },
                    {
                      id: 'graph',
                      label: (
                        <span className="flex items-center gap-1.5">
                          <GitBranch size={14} /> Graph
                        </span>
                      )
                    }
                  ]}
                />
                <p className="mt-1 text-center text-[11px] leading-snug text-gray-400">
                  {newProjectKind === 'graph' ? '图谱 · 看板 · 表格' : '地图 · 看板 · 表格'}
                </p>
              </div>
            </div>

            <div>
              <input
                ref={newProjectFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  closeCreateDialog();
                  void handleImportProject(file, { merge: false });
                }}
              />
              <button
                type="button"
                onClick={() => newProjectFileInputRef.current?.click()}
                className={`chrome-field flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors ${
                  isCreateFileDragging
                    ? 'border-transparent text-theme-chrome-fg'
                    : 'border-gray-300 text-gray-700'
                }`}
                style={isCreateFileDragging ? { backgroundColor: themeColor } : undefined}
              >
                <Upload size={14} strokeWidth={2} aria-hidden />
                上传项目 JSON
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={closeCreateDialog}
              className="chrome-field flex-1 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium text-theme-chrome-fg transition-opacity hover:opacity-90"
              style={{ backgroundColor: themeColor }}
            >
              创建
            </button>
          </div>
        </div>
      </ChromeWindow>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
          <ChromeDialogSurface
            appearance={chromeAppearance}
            className="max-w-md p-6 animate-in zoom-in-95"
            style={mapChromeSurface}
          >
            <h2 className="text-2xl font-black text-gray-800 mb-6">
              {isImportingFromData ? 'Import from Data' : 'Import Project'}
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              {isImportingFromData 
                ? 'Import project data into the current project. Map notes will be added directly, board notes will be placed to the right.'
                : 'Select a project JSON file to import as a new project.'}
            </p>
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileSelect}
              className="hidden"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowImportDialog(false);
                  setIsImportingFromData(false);
                }} 
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={() => importFileInputRef.current?.click()}
                className="flex-1 py-3 text-theme-chrome-fg font-bold rounded-xl shadow-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: themeColor }}
              >
                Select File
              </button>
            </div>
          </ChromeDialogSurface>
        </div>
      )}

      {pendingBuiltinExampleUpdate && (
        <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="update-example-title">
          <ChromeDialogSurface
            appearance={chromeAppearance}
            className="max-w-md p-6 animate-in zoom-in-95"
            style={mapChromeSurface}
          >
            <h2 id="update-example-title" className="text-xl font-black text-gray-800 mb-3">
              更新示例
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              将把示例「{pendingBuiltinExampleUpdate.name}」替换为最新的「湘江」内容。该示例中的便签、标签和关联修改将被覆盖，且无法撤回。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isUpdatingBuiltinExample}
                onClick={() => setPendingBuiltinExampleUpdate(null)}
                className="rounded-xl px-4 py-2 font-bold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isUpdatingBuiltinExample}
                onClick={() => void handleConfirmBuiltinExampleUpdate()}
                className="rounded-xl px-4 py-2 font-bold text-theme-chrome-fg shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}
              >
                {isUpdatingBuiltinExample ? '更新中…' : '更新'}
              </button>
            </div>
          </ChromeDialogSurface>
        </div>
      )}

      {/* Import error：带出错位置；允许选中复制 */}
      {importErrorMessage && (
        <div className="fixed inset-0 z-[3100] bg-black/50 flex items-center justify-center p-4">
          <ChromeDialogSurface
            className="import-error-selectable max-w-lg border-red-200/80 bg-white p-6"
            role="alertdialog"
            aria-labelledby="import-error-title"
          >
            <h2 id="import-error-title" className="text-xl font-black text-gray-900 mb-3">
              导入失败
            </h2>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap break-words font-sans leading-relaxed bg-red-50/80 border border-red-100 rounded-xl p-4 max-h-[50vh] overflow-auto cursor-text">
              {importErrorMessage}
            </pre>
            <button
              type="button"
              className="mt-5 w-full py-3 font-bold rounded-xl text-theme-chrome-fg shadow-lg"
              style={{ backgroundColor: themeColor }}
              onClick={() => setImportErrorMessage(null)}
            >
              知道了
            </button>
          </ChromeDialogSurface>
        </div>
      )}

      {/* Theme Color Picker */}
      {onThemeColorChange && (
        <ThemeColorPicker
          isOpen={showThemeColorPicker}
          onClose={() => setShowThemeColorPicker(false)}
          currentColor={themeColor}
          onColorChange={onThemeColorChange}
          panelChromeStyle={mapChromeSurface}
        />
      )}

      {openMenuId &&
        typeof document !== 'undefined' &&
        (() => {
          const pm = projects.find((proj) => proj.id === openMenuId);
          if (!pm) return null;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          return createPortal(
            <>
              {homeLikeList ? (
                <div
                  data-pm-more-menu
                  className={`map-chrome-content-${chromeAppearance} fixed bottom-6 left-1/2 max-h-[min(70dvh,70vh)] w-[calc(100%-2rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-3xl shadow-2xl border border-gray-100/80 py-2 animate-in slide-in-from-bottom-4 theme-surface-scrollbar`}
                  style={{
                    ...mapChromeSurface,
                    maxWidth: PROJECT_SIDEBAR_DRAWER_WIDTH_PX,
                    zIndex: PM_PROJECT_MORE_MENU_Z
                  }}
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-label="Project actions"
                >
                  <div className="px-4 pt-2 pb-1">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Project
                    </div>
                    <div className="text-sm font-bold text-gray-800 truncate">{pm.name}</div>
                  </div>
                  <ChromeMenuItem
                    icon={<Edit2 size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleRename(pm.id);
                      setOpenMenuId(null);
                    }}
                  >
                    Rename
                  </ChromeMenuItem>
                  <ChromeMenuItem
                    icon={<Copy size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleDuplicateProject(pm);
                      setOpenMenuId(null);
                    }}
                  >
                    Duplicate Project
                  </ChromeMenuItem>
                  {canUpdateBuiltinExample(pm) ? (
                    <ChromeMenuItem
                      icon={<RefreshCw size={16} />}
                      hoverBackground={mapChromeHoverBg}
                      onClick={() => {
                        setPendingBuiltinExampleUpdate(pm);
                        setOpenMenuId(null);
                      }}
                    >
                      更新示例
                    </ChromeMenuItem>
                  ) : null}
                  <ChromeMenuItem
                    icon={<Download size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleExportData(pm);
                      setOpenMenuId(null);
                    }}
                  >
                    Export Data (CSV)
                  </ChromeMenuItem>
                  <ChromeMenuItem
                    icon={<Download size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleExportFullProject(pm);
                      setOpenMenuId(null);
                    }}
                  >
                    Export Full Project (JSON)
                  </ChromeMenuItem>
                  <ChromeMenuItem
                    icon={<Download size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleExportMappViz(pm);
                      setOpenMenuId(null);
                    }}
                  >
                    Export Bibliometrics (.viz.json)
                  </ChromeMenuItem>
                  <ChromeMenuItem
                    icon={<ImageIcon size={16} />}
                    hoverBackground={mapChromeHoverBg}
                    onClick={() => {
                      handleCompressImages(pm);
                      setOpenMenuId(null);
                    }}
                  >
                    Compress Images
                  </ChromeMenuItem>
                  {(!builtinExampleIds.has(pm.id) || exampleDevMaintenanceMode) ? (
                    <ChromeMenuItem
                      icon={<Trash2 size={16} />}
                      destructive
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(pm.id);
                        setOpenMenuId(null);
                      }}
                    >
                      Delete Project
                    </ChromeMenuItem>
                  ) : null}
                </div>
              ) : projectMoreAnchor ? (
                (() => {
                  const isBuiltinExample = builtinExampleIds.has(pm.id);
                  const canDelete = !isBuiltinExample || exampleDevMaintenanceMode;
                  return (
                <MenuDropdown
                  project={pm}
                  onRename={handleRename}
                  onDuplicate={handleDuplicateProject}
                  onExportData={handleExportData}
                  onExportFullProject={handleExportFullProject}
                  onExportMappViz={handleExportMappViz}
                  onCompressImages={handleCompressImages}
                  onUpdateBuiltinExample={(project) => setPendingBuiltinExampleUpdate(project)}
                  onCheckData={onCheckData}
                  onCleanupBrokenReferences={onCleanupBrokenReferences}
                  onDelete={onDeleteProject}
                  onClose={() => setOpenMenuId(null)}
                  surfaceStyle={mapChromeSurface}
                  fixedPlacementStyle={computeProjectMoreMenuFixedStyle(
                    projectMoreAnchor.row,
                    projectMoreAnchor.button,
                    compactProjectList,
                    vw,
                    vh
                  )}
                  motionOriginClass={compactProjectList ? 'origin-top' : 'origin-top-right'}
                  hoverBackground={mapChromeHoverBg}
                  canDelete={canDelete}
                  canUpdateBuiltinExample={canUpdateBuiltinExample(pm)}
                />
                  );
                })()
              ) : null}
            </>,
            document.body
          );
        })()}

    </div>
  );
};
