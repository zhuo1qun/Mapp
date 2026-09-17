
import React, { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Map as MapIcon, Grid, Menu, Loader2, Table2, GitBranch, Cloud, CloudOff, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from './components/ui/MotionDiv';
import { Note, ViewMode, Project, ProjectKind } from './types';
import { get, set } from 'idb-keyval';
import {
  MAP_STYLE_OPTIONS,
  PROJECT_ENTER_SETTLE_MS,
  PROJECT_OPEN_OVERLAY_FADE_S,
  PROJECT_OPEN_SLIDE_DURATION_S,
  PROJECT_OPEN_SLIDE_EASE,
  PROJECT_RETURN_HOME_SELECTION_DURATION_S,
  PROJECT_RETURN_HOME_LIST_MOVE_DURATION_S,
  PROJECT_SIDEBAR_DRAWER_WIDTH_PX,
  PROJECT_SIDEBAR_DOCKED_WIDTH_PX,
  PROJECT_LIST_MAX_WIDTH_PX,
  PROJECT_SIDEBAR_FIXED_WIDTH_MIN_VIEWPORT_PX
} from './constants';
import { useProjectState } from './components/hooks/useProjectState';
import { useViewState } from './components/hooks/useViewState';
import { useAppState } from './components/hooks/useAppState';
import { ProjectKindPromptDialog } from './components/ProjectKindPromptDialog';
import {
  needsProjectKindPrompt,
  defaultViewModeForKind,
  isViewModeAllowedForKind,
  resolveProjectKind,
  isProjectKind
} from './utils/projectKind';
import { 
  syncProjectsToCloud, 
  loadProjectsFromCloud, 
  mergeProjects, 
  shouldSync,
  getLastSyncTime,
  type SyncStatus 
} from './utils/persistence/sync';
import {
  migrateFromOldFormat,
  deleteImage,
  deleteSketch,
  getViewPositionCache,
  clearViewPositionCache,
  checkStorageUsage,
  checkStorageDetails,
  analyzeStorageRedundancy,
  cleanupCorruptedImages,
  cleanupLargeImages,
  cleanupDuplicateImages,
  analyzeDuplicateImages,
  attemptImageRecovery,
  loadNoteImages,
  cleanBrokenReferences,
  loadAllProjects,
  saveProject,
  ProjectSummary
} from './utils/persistence/storage';
import {
  mapChromeSurfaceStyle,
  mapChromeHoverBackground,
  mapChromeControlStyle,
  mapChromeControlHoverBackground,
  resolveChromeAppearance,
  DEFAULT_MAP_UI_CHROME_OPACITY,
  DEFAULT_MAP_UI_CHROME_OPACITY_BOTTOM,
  DEFAULT_MAP_UI_CHROME_BLUR_PX
} from './utils/map/mapChromeStyle';
import { ChromeAppearanceContext } from './components/ui/chromeAppearanceContext';
import { applyThemeChromeCssVars } from './utils/theme/themeChrome';
import { cancelPendingMapLocate, isMapLocatePending } from './utils/map/pendingMapLocate';
import { useDataImport } from './components/hooks/useDataImport';
import { useCsvImport } from './components/hooks/useCsvImport';
import { useFileDrop } from './components/hooks/useFileDrop';
import { ChromeDropOverlay } from './components/ui/ChromeDropOverlay';
import { ModuleLoadProgress } from './components/ui/ModuleLoadProgress';
import { EditInspectorProvider } from './components/editInspector/EditInspectorProvider';
import { installBuiltinExamples } from './utils/builtinExamples/install';
import { afterNextPaint, waitForAnimation } from './utils/ui/animationTiming';
import { dismissWorkspaceTransients } from './utils/ui/workspaceTransientDismiss';

type ProjectEnterMode = 'from-home' | 'project-switch' | 'steady';

// These workspaces have independent, sizeable dependency trees (Leaflet, Cytoscape,
// Matter.js, editors, and export helpers). Loading them only when their surface is
// opened keeps the initial shell responsive, especially on the project home screen.
const MapView = lazy(() =>
  import('./components/MapView').then(({ MapView }) => ({ default: MapView }))
);
const BoardView = lazy(() =>
  import('./components/BoardView').then(({ BoardView }) => ({ default: BoardView }))
);
const TableView = lazy(() =>
  import('./components/TableView').then(({ TableView }) => ({ default: TableView }))
);
const GraphView = lazy(() =>
  import('./components/GraphView').then(({ GraphView }) => ({ default: GraphView }))
);
const ProjectManager = lazy(() =>
  import('./components/ProjectManager').then(({ ProjectManager }) => ({ default: ProjectManager }))
);
const HomePhysicsPlayground = lazy(() =>
  import('./components/HomePhysicsPlayground').then(({ HomePhysicsPlayground }) => ({
    default: HomePhysicsPlayground
  }))
);

export default function App() {
  const emptyNotes = useMemo(() => [], []);
  const emptyFrames = useMemo(() => [], []);

  // Use custom hooks for state management
  const projectState = useProjectState();

  const [sidebarExpandingToHome, setSidebarExpandingToHome] = useState(false);
  /** 回主页：先取消选中当前项目卡，完成后再展开侧栏。 */
  const [returnHomeClearingSelection, setReturnHomeClearingSelection] = useState(false);
  /** 在项目内切换到另一项目时：先全宽展开再给关闭动画，避免「直接收起」难以感知是否切换成功 */
  const [sidebarExpandForProjectSwitch, setSidebarExpandForProjectSwitch] = useState(false);
  /** 进入项目收束段：宽度先收到抽屉，全屏壳布局延后到宽度动画结束再卸，避免生硬同切 */
  const [projectEnterCollapsing, setProjectEnterCollapsing] = useState(false);
  /** 从主页点进项目：先进入工作区壳层，左侧由全宽收束为侧栏（非从屏幕外滑入） */
  const [pendingEnterWorkspaceFromHome, setPendingEnterWorkspaceFromHome] = useState(false);
  const [sidebarDockedInline, setSidebarDockedInline] = useState(false);
  /** 彩蛋模式：仅稳定主页生效 */
  const [homeEasterEggMode, setHomeEasterEggMode] = useState(false);
  const [homeEasterEggGravityY, setHomeEasterEggGravityY] = useState(1.35);
  const [homeEasterEggMouseConstraintStiffness, setHomeEasterEggMouseConstraintStiffness] = useState(0.18);
  /** 仅开发者维护内置示例项目（增删/列表显示等）；默认对普通用户隐藏 */
  const [exampleDevMaintenanceMode, setExampleDevMaintenanceMode] = useState(false);
  const expandToHomeProjectIdRef = useRef<string | null>(null);
  /**
   * 窄屏主页→项目：进入/收束全程留在 docked，结束后再交接 overlay。
   * 用 ref 避免额外 state；与 projectEnterCollapsing 同帧读取即可。
   */
  const enterFromHomeKeepDockedRef = useRef(false);
  /**
   * overlay↔docked 无缝交接：下一帧挂载/卸载的壳跳过 width:0 / x:-100% 入退场，
   * 避免窄屏「先闪回收起再拉开」。
   */
  const sidebarShellHandoffRef = useRef(false);

  const viewState = useViewState();
  const appState = useAppState();

  // Extract commonly used values for easier access
  const {
    projects,
    projectSummaries,
    activeProject,
    currentProjectId,
    setCurrentProjectId,
    setActiveProject,
    duplicateProject,
    isLoading,
    setIsLoading,
    isLoadingProject,
    setIsLoadingProject,
    loadingProgress,
    setLoadingProgress,
    isDeletingProject
  } = projectState;

  const {
    viewMode,
    isEditorOpen,
    mappingWorkspaceEditMode,
    navigateToMapCoords,
    navigateToBoardCoords,
    navigateToGraphNoteId,
    setViewMode,
    setIsEditorOpen,
    setMappingWorkspaceEditMode,
    navigateToMap,
    navigateToBoard,
    navigateToGraphNote,
    clearMapNavigation,
    clearBoardNavigation,
    clearGraphNavigation,
    saveMapPosition,
    saveBoardPosition
  } = viewState;

  const projectKind = resolveProjectKind(activeProject);
  const [kindPromptProject, setKindPromptProject] = useState<Project | null>(null);

  /**
   * selectProject 会先 setCurrentProjectId(新 id)、异步 load 完成后再 setActiveProject。
   * 窗口期内 MapView 等会收到「project=旧数据 + currentProjectId=新 id」：地图缓存按新项目、
   * 笔记坐标仍属旧项目，表现为上一项目的视图或首次进入布局错乱。
   * 仅依赖 id 对齐，不依赖 isLoadingProject，避免与 setState 批处理竞态导致一帧错图。
   */
  const isWorkspaceProjectDataStale =
    !!activeProject &&
    !!currentProjectId &&
    activeProject.id !== currentProjectId;

  /** 打开已加载项目：未分型则询问；已分型则校正默认/非法视图 */
  useEffect(() => {
    if (!activeProject || !currentProjectId) {
      setKindPromptProject(null);
      return;
    }
    if (activeProject.id !== currentProjectId) return;
    if (isLoadingProject) return;

    if (needsProjectKindPrompt(activeProject)) {
      setKindPromptProject((prev) => (prev?.id === activeProject.id ? prev : activeProject));
      return;
    }

    setKindPromptProject(null);
    const kind = resolveProjectKind(activeProject);
    if (!kind) return;
    if (!isViewModeAllowedForKind(kind, viewMode)) {
      setViewMode(defaultViewModeForKind(kind));
    }
  }, [activeProject, currentProjectId, isLoadingProject, viewMode, setViewMode]);

  const handleConfirmProjectKind = useCallback(
    async (kind: ProjectKind) => {
      const target = kindPromptProject;
      if (!target) return;
      const next = { ...target, projectKind: kind };
      await projectState.updateProject(next);
      setKindPromptProject(null);
      setViewMode(defaultViewModeForKind(kind));
    },
    [kindPromptProject, projectState, setViewMode]
  );

  const handleCancelProjectKind = useCallback(() => {
    setKindPromptProject(null);
    setCurrentProjectId(null);
    setActiveProject(null);
    setPendingEnterWorkspaceFromHome(false);
    setSidebarDockedInline(false);
    setIsSidebarOpen(false);
    setSidebarExpandForProjectSwitch(false);
    setProjectEnterCollapsing(false);
  }, [setCurrentProjectId, setActiveProject]);

  // 安装内置示例项目。正常已安装场景只读本地标记，不会阻塞项目列表加载。
  useEffect(() => {
    let disposed = false;
    void installBuiltinExamples()
      .then((changed) => {
        if (!disposed && changed) void projectState.loadProjects();
      })
      .catch(() => {
        // 示例项目是增强功能，不阻塞主流程。
      });
    return () => {
      disposed = true;
    };
  }, [projectState.loadProjects]);

  // 保存board位置（现在只在拖拽结束时调用，类似MapPositionTracker的moveend事件）
  const saveBoardPositionDirect = useCallback((projectId: string, x: number, y: number, scale: number) => {
    saveBoardPosition(projectId, x, y, scale);
  }, [saveBoardPosition]);

  const {
    themeColor,
    setThemeColor,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarButtonY,
    setSidebarButtonY,
    showMapImportMenu,
    setShowMapImportMenu,
    showBorderPanel,
    setShowBorderPanel,
    borderGeoJSON,
    setBorderGeoJSON,
    mapViewFileInputRef,
    sidebarButtonDragRef,
    isRouteMode,
    setIsRouteMode,
    waypoints,
    setWaypoints
  } = appState;

  const [projectSidebarLargeViewport, setProjectSidebarLargeViewport] = useState(() =>
    typeof window !== 'undefined' &&
      window.matchMedia(`(min-width: ${PROJECT_SIDEBAR_FIXED_WIDTH_MIN_VIEWPORT_PX}px)`).matches
  );
  const projectSidebarLargeViewportRef = useRef(projectSidebarLargeViewport);
  projectSidebarLargeViewportRef.current = projectSidebarLargeViewport;
  const [viewportWidthPx, setViewportWidthPx] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : PROJECT_LIST_MAX_WIDTH_PX
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${PROJECT_SIDEBAR_FIXED_WIDTH_MIN_VIEWPORT_PX}px)`);
    const onMq = () => setProjectSidebarLargeViewport(mq.matches);
    const onResize = () => setViewportWidthPx(window.innerWidth);
    onMq();
    onResize();
    mq.addEventListener('change', onMq);
    window.addEventListener('resize', onResize);
    return () => {
      mq.removeEventListener('change', onMq);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const inProjectHomeTransition =
    pendingEnterWorkspaceFromHome ||
    returnHomeClearingSelection ||
    sidebarExpandingToHome ||
    sidebarExpandForProjectSwitch ||
    projectEnterCollapsing;

  /** 点击项目进入/切换：含展开、加载、收束整段中间态 */
  const isProjectEnterTransition =
    pendingEnterWorkspaceFromHome ||
    sidebarExpandForProjectSwitch ||
    projectEnterCollapsing;

  /** 仅「保持全宽」：展开+加载；收束时改为抽屉宽以驱动宽度动画 */
  const isProjectEnterFullWidth =
    (pendingEnterWorkspaceFromHome || sidebarExpandForProjectSwitch) &&
    !projectEnterCollapsing;

  const projectEnterExpandMs = useMemo(
    () => Math.round(PROJECT_OPEN_SLIDE_DURATION_S * 1000),
    []
  );

  /**
   * 项目进入前半段：维持原有的全宽展开与两帧绘制等待。
   * 各入口仅决定来源模式与是否需要展开，避免把同一节奏复制到新建/导入路径。
   */
  const beginProjectEnter = useCallback(
    async ({
      projectId,
      mode,
      waitForExpand,
      setCurrentId
    }: {
      projectId: string;
      mode: ProjectEnterMode;
      waitForExpand: boolean;
      setCurrentId: boolean;
    }) => {
      setSidebarExpandingToHome(false);
      setProjectEnterCollapsing(false);
      enterFromHomeKeepDockedRef.current = mode === 'from-home';
      setSidebarDockedInline(true);
      setIsSidebarOpen(true);
      setPendingEnterWorkspaceFromHome(mode === 'from-home');
      setSidebarExpandForProjectSwitch(mode === 'project-switch');

      if (setCurrentId) setCurrentProjectId(projectId);
      if (!waitForExpand) return;

      await afterNextPaint();
      await waitForAnimation(projectEnterExpandMs);
    },
    [projectEnterExpandMs, setCurrentProjectId, setIsSidebarOpen]
  );

  /** 项目进入后半段：全宽短暂停留后收束为侧栏。 */
  const completeProjectEnter = useCallback(async () => {
    await waitForAnimation(projectEnterExpandMs + PROJECT_ENTER_SETTLE_MS);
    setIsSidebarOpen(true);
    setSidebarDockedInline(true);
    setProjectEnterCollapsing(true);
    setPendingEnterWorkspaceFromHome(false);
    setSidebarExpandForProjectSwitch(false);

    await afterNextPaint();
    await waitForAnimation(projectEnterExpandMs);
    // 窄屏：主页进入后的收束在 docked 上完成，结束后无缝交接 overlay（跳过 width:0 / 滑入）
    if (enterFromHomeKeepDockedRef.current && !projectSidebarLargeViewportRef.current) {
      sidebarShellHandoffRef.current = true;
    }
    enterFromHomeKeepDockedRef.current = false;
    setProjectEnterCollapsing(false);
  }, [projectEnterExpandMs, setIsSidebarOpen]);

  /** 加载条：全宽段内显示；一开始收束即隐藏 */
  const projectEnterLoadBarVisible =
    isProjectEnterFullWidth &&
    !isDeletingProject &&
    (isLoadingProject ||
      (!!activeProject &&
        !!currentProjectId &&
        activeProject.id === currentProjectId));
  const projectEnterLoadProgress = isLoadingProject
    ? Math.max(5, loadingProgress)
    : 100;

  const atSteadyProjectHome = !activeProject && !inProjectHomeTransition;

  // 离开稳定主页时自动退出彩蛋模式，避免把 UI/物理效果带到其他状态
  useEffect(() => {
    if (!atSteadyProjectHome && homeEasterEggMode) setHomeEasterEggMode(false);
  }, [atSteadyProjectHome, homeEasterEggMode]);

  const projectSidebarDrawerWidthPx = useMemo(() => {
    // 用数值 px，避免 '100%' ↔ 'min(62vw, Npx)' 无法插值导致收束瞬切
    if (atSteadyProjectHome || sidebarExpandingToHome || isProjectEnterFullWidth) {
      return viewportWidthPx;
    }
    return projectSidebarLargeViewport
      ? PROJECT_SIDEBAR_DOCKED_WIDTH_PX
      : Math.min(PROJECT_SIDEBAR_DRAWER_WIDTH_PX, Math.max(0, viewportWidthPx - 48));
  }, [
    isProjectEnterFullWidth,
    sidebarExpandingToHome,
    atSteadyProjectHome,
    projectSidebarLargeViewport,
    viewportWidthPx
  ]);

  const projectSidebarIsFullWidth =
    atSteadyProjectHome || isProjectEnterFullWidth || sidebarExpandingToHome;
  /**
   * 宽屏始终 docked；窄屏稳定主页 docked，项目内 overlay。
   * 过渡期不换壳：回主页/项目切换留在 overlay 上改 width；仅「主页进项目」全程 docked（含收束）。
   */
  const projectSidebarIsDocked =
    sidebarDockedInline &&
    (projectSidebarLargeViewport ||
      atSteadyProjectHome ||
      pendingEnterWorkspaceFromHome ||
      (projectEnterCollapsing && enterFromHomeKeepDockedRef.current));

  const { handleDataImport: handleProjectDataImport } = useDataImport({
    project: activeProject as Project,
    onUpdateProject: async (p) => {
      await projectState.updateProject(p);
    }
  });
  const { handleCsvImport: handleProjectCsvImport } = useCsvImport({
    project: activeProject as Project,
    onUpdateProject: async (p) => {
      await projectState.updateProject(p);
    }
  });
  const tableGraphDataFileDrop = useFileDrop({
    isEditorOpen,
    handleImageImport: () => {},
    handleDataImport: handleProjectDataImport,
    handleCsvImport: handleProjectCsvImport,
    dataOnly: true
  });



  // Load complete project data with progress

  // Convert ProjectSummary to basic Project for display
  const summariesToProjects = useCallback((summaries: ProjectSummary[]): Project[] => {
    return summaries.map(summary => ({
      id: summary.id,
      name: summary.name,
      type: summary.type,
      createdAt: summary.createdAt,
      backgroundImage: undefined,
      notes: [], // Empty for now, will be loaded when selected
      frames: [],
      connections: [],
      backgroundOpacity: 1,
      themeColor: themeColor
    }));
  }, []);
  
  // Check and repair project data
  const handleCheckData = useCallback(async () => {
    try {
      console.log('Starting data check and repair...');

      // Show loading state
      setIsLoadingProject(true);
      setLoadingProgress(0);

      // Step 1: Attempt to recover missing images (25%)
      setLoadingProgress(25);
      const recoveryResult = await attemptImageRecovery();
      if (recoveryResult.imagesRecovered > 0 || recoveryResult.sketchesRecovered > 0) {
        console.log(`Recovered ${recoveryResult.imagesRecovered} images and ${recoveryResult.sketchesRecovered} sketches`);
      }

      // Step 2: Clean up corrupted data (30%)
      setLoadingProgress(30);
      const cleanupResult = await cleanupCorruptedImages();
      if (cleanupResult.imagesCleaned > 0 || cleanupResult.sketchesCleaned > 0) {
        console.log(`Cleaned ${cleanupResult.imagesCleaned} corrupted images and ${cleanupResult.sketchesCleaned} corrupted sketches`);
      }

      // Step 3: Analyze and clean up duplicate images (50%)
      setLoadingProgress(50);
      const duplicateCleanupResult = await cleanupDuplicateImages(true); // autoDelete = true
      if (duplicateCleanupResult) {
        if (duplicateCleanupResult.suspiciousGroups.length > 0) {
          console.warn(`⚠️ Found ${duplicateCleanupResult.suspiciousGroups.length} suspicious duplicate groups that were NOT deleted:`);
          duplicateCleanupResult.suspiciousGroups.forEach(group => {
            console.warn(`  ${group.count} duplicates (${group.reason}): ${group.ids.join(', ')}`);
          });
        }
        if (duplicateCleanupResult.imagesCleaned > 0) {
          console.log(`✅ Cleaned ${duplicateCleanupResult.imagesCleaned} normal duplicate images, freed ${duplicateCleanupResult.spaceFreed.toFixed(2)}MB`);
        }
      }

      // Step 4: Clean up large images (>2MB) (70%)
      setLoadingProgress(70);
      const largeCleanupResult = await cleanupLargeImages(2);
      if (largeCleanupResult.imagesCleaned > 0) {
        console.log(`Cleaned ${largeCleanupResult.imagesCleaned} large images, freed ${largeCleanupResult.spaceFreed.toFixed(2)}MB`);
      }

      // Step 5: Detailed duplicate analysis (90%)
      setLoadingProgress(90);
      const detailedAnalysis = await analyzeDuplicateImages();
      if (detailedAnalysis) {
        console.log('📊 Detailed duplicate analysis:');
        console.log(`   Total duplicate groups: ${detailedAnalysis.duplicateGroups.length}`);
        console.log(`   Suspicious groups: ${detailedAnalysis.suspiciousGroups.length}`);

        if (detailedAnalysis.suspiciousGroups.length > 0) {
          console.log('🚨 Suspicious duplicate groups (investigate these):');
          detailedAnalysis.suspiciousGroups.forEach((group, index) => {
            console.log(`   ${index + 1}. ${group.reason}`);
            console.log(`      Hash: ${group.hash.substring(0, 16)}`);
            console.log(`      Count: ${group.count}`);
            console.log(`      IDs: ${group.ids.join(', ')}`);
            console.log(`      Timestamps: ${group.timestamps.map(t => new Date(t).toISOString()).join(', ')}`);
          });
        }
      }

      // Step 6: Refresh projects (95%)
      setLoadingProgress(95);
      await projectState.loadProjects();

      // Step 7: Complete (100%)
      setLoadingProgress(100);

      console.log('Data check and repair completed');
    } catch (error) {
      console.error('Data check failed:', error);
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, []);

  // Clean broken resource references in a project
  const handleCleanupBrokenReferences = useCallback(async (project: Project) => {
    try {
      console.log(`Cleaning broken resource references for project: ${project.name}`);

      // Show loading state
      setIsLoadingProject(true);
      setLoadingProgress(0);

      // Clean broken references
      setLoadingProgress(50);
      const cleanedNotes = await cleanBrokenReferences(project.notes);

      // Update project with cleaned notes
      setLoadingProgress(80);
      const cleanedProject = {
        ...project,
        notes: cleanedNotes
      };

      await projectState.updateProject(cleanedProject);
      setLoadingProgress(100);

      console.log(`Successfully cleaned broken references for project: ${project.name}`);
      alert(`已清理项目 "${project.name}" 中的断链资源引用`);
    } catch (error) {
      console.error('Failed to clean broken references:', error);
      alert('清理断链引用时出错，请查看控制台日志');
    } finally {
      setIsLoadingProject(false);
      setLoadingProgress(0);
    }
  }, [projectState]);

  const closeProjectSidebar = useCallback(() => {
    setSidebarExpandForProjectSwitch(false);
    setPendingEnterWorkspaceFromHome(false);
    setProjectEnterCollapsing(false);
    if (!activeProject) {
      // 无项目时侧栏即启动页：保持全宽 docked，不收到「空工作区」
      setIsSidebarOpen(true);
      setSidebarDockedInline(true);
      return;
    }
    setSidebarDockedInline(false);
    setIsSidebarOpen(false);
  }, [activeProject]);

  /**
   * 非 Table 工作区的空白操作统一释放瞬时窗口；工具栏与窗口内部自行处理 toggle，
   * 避免点击同一个按钮时先关闭又立即重新打开。
   */
  const handleWorkspaceTransientDismiss = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (viewMode === 'table') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '[data-allow-context-menu], [data-workspace-transient], [data-graph-top-left-panel], [data-workspace-modal], [data-map-search-chrome-panel], [data-tag-add-panel], [data-note-time-range-panel], [data-note-emoji-picker]'
        )
      ) {
        return;
      }
      dismissWorkspaceTransients();
      if (isSidebarOpen) closeProjectSidebar();
    },
    [closeProjectSidebar, isSidebarOpen, viewMode]
  );

  /**
   * 进入项目节奏：动画（切全屏）→ 加载 → 动画（收束进项目）
   * 收束时先只改宽度，全屏壳布局等宽度动画结束后再卸，避免与宽度动画同帧硬切。
   */
  const handleSelectProject = useCallback(async (id: string) => {
    if (currentProjectId === id) {
      closeProjectSidebar();
      return;
    }
    if (
      pendingEnterWorkspaceFromHome ||
      sidebarExpandForProjectSwitch ||
      projectEnterCollapsing
    ) {
      return;
    }

    const fromHome = !currentProjectId;
    const switchingProject = !!currentProjectId && currentProjectId !== id;
    const previousProjectId = currentProjectId;

    clearMapNavigation();
    clearBoardNavigation();
    clearGraphNavigation();

    // —— 1) 先切到全屏中间态（此时还不加载）——
    await beginProjectEnter({
      projectId: id,
      mode: fromHome ? 'from-home' : switchingProject ? 'project-switch' : 'steady',
      waitForExpand: true,
      setCurrentId: true
    });

    // —— 2) 全屏已就位，开始加载 ——
    const loaded = await projectState.selectProject(id);
    if (!loaded) {
      if (fromHome) {
        setCurrentProjectId(null);
        setPendingEnterWorkspaceFromHome(false);
        enterFromHomeKeepDockedRef.current = false;
      } else {
        setCurrentProjectId(previousProjectId);
        setSidebarExpandForProjectSwitch(false);
      }
      setProjectEnterCollapsing(false);
      return;
    }

    // —— 3) 加载完成后先停在全屏一拍，再收束 ——
    await completeProjectEnter();
  }, [
    currentProjectId,
    pendingEnterWorkspaceFromHome,
    sidebarExpandForProjectSwitch,
    projectEnterCollapsing,
    projectState,
    clearMapNavigation,
    clearBoardNavigation,
    clearGraphNavigation,
    closeProjectSidebar,
    beginProjectEnter,
    completeProjectEnter
  ]);

  const handleBackToHome = useCallback(() => {
    if (sidebarExpandingToHome || returnHomeClearingSelection) return;
    // 窄屏留在 overlay、宽屏留在 docked：只改 width 拉到全屏，不换壳（避免先收到 0 再展开）。
    setSidebarExpandForProjectSwitch(false);
    setPendingEnterWorkspaceFromHome(false);
    setProjectEnterCollapsing(false);
    setIsSidebarOpen(true);
    if (projectSidebarLargeViewport) {
      setSidebarDockedInline(true);
    }
    expandToHomeProjectIdRef.current = currentProjectId;
    setReturnHomeClearingSelection(true);
  }, [
    sidebarExpandingToHome,
    returnHomeClearingSelection,
    currentProjectId,
    projectSidebarLargeViewport,
    setIsSidebarOpen
  ]);

  useEffect(() => {
    if (!returnHomeClearingSelection || sidebarExpandingToHome) return;
    const id = window.setTimeout(() => {
      setSidebarExpandingToHome(true);
    }, Math.round(PROJECT_RETURN_HOME_SELECTION_DURATION_S * 1000));
    return () => window.clearTimeout(id);
  }, [returnHomeClearingSelection, sidebarExpandingToHome]);

  useEffect(() => {
    if (!sidebarExpandingToHome) return;
    const expandMs = Math.round(PROJECT_OPEN_SLIDE_DURATION_S * 1000);
    const verticalMoveMs = Math.round(PROJECT_RETURN_HOME_LIST_MOVE_DURATION_S * 1000);
    // 选中态已在展开前播完；这里等侧栏宽度与 Hero/列表落位走完再切主页数据。
    const ms = Math.max(expandMs * 2 + 80, verticalMoveMs + 80);
    const id = window.setTimeout(() => {
      const pid = expandToHomeProjectIdRef.current;
      expandToHomeProjectIdRef.current = null;
      if (pid) clearViewPositionCache(pid);
      clearMapNavigation();
      clearBoardNavigation();
      setCurrentProjectId(null);
      setActiveProject(null);
      setIsSidebarOpen(true);
      setSidebarDockedInline(true);
      // 窄屏：overlay 已在全宽，交接 docked 时跳过 width:0 入场
      if (!projectSidebarLargeViewportRef.current) {
        sidebarShellHandoffRef.current = true;
      }
      /** 先保留 sidebarExpandingToHome，下一帧再关 transitionListOnly：列表与主页共用 expand 壳与同一套 scroll 区，避免整块列表瞬切 */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSidebarExpandingToHome(false);
          setReturnHomeClearingSelection(false);
          setSidebarExpandForProjectSwitch(false);
          setPendingEnterWorkspaceFromHome(false);
          setProjectEnterCollapsing(false);
        });
      });
    }, ms);
    return () => window.clearTimeout(id);
  }, [
    sidebarExpandingToHome,
    clearMapNavigation,
    clearBoardNavigation,
    setCurrentProjectId,
    setActiveProject,
    setIsSidebarOpen
  ]);

  /** 稳定无项目：全宽 docked 侧栏即启动页 */
  useEffect(() => {
    if (isLoading) return;
    if (
      !activeProject &&
      !pendingEnterWorkspaceFromHome &&
      !sidebarExpandingToHome &&
      !sidebarExpandForProjectSwitch
    ) {
      setSidebarDockedInline(true);
      setIsSidebarOpen(true);
    }
  }, [
    isLoading,
    activeProject,
    pendingEnterWorkspaceFromHome,
    sidebarExpandingToHome,
    sidebarExpandForProjectSwitch
  ]);

  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);


  // UI Visibility State (Tab key toggle)
  const [isUIVisible, setIsUIVisible] = useState(true);
  /** 手机端视图切换器：切换后展开名称，点到其它区域后收回为图标。 */
  const [isMobileViewSwitcherExpanded, setIsMobileViewSwitcherExpanded] = useState(true);
  const mobileViewSwitcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const collapseMobileViewSwitcher = (event: PointerEvent) => {
      if (!mobileViewSwitcherRef.current?.contains(event.target as Node)) {
        setIsMobileViewSwitcherExpanded(false);
      }
    };
    document.addEventListener('pointerdown', collapseMobileViewSwitcher);
    return () => document.removeEventListener('pointerdown', collapseMobileViewSwitcher);
  }, []);

  const handleWorkspaceViewTabClick = useCallback(
    (nextViewMode: ViewMode) => {
      if (isImportDialogOpen) return;
      setViewMode(nextViewMode);
      setIsMobileViewSwitcherExpanded(true);
    },
    [isImportDialogOpen, setViewMode]
  );

  /** 侧栏打开且非全宽时，工作区 UI 以侧栏右缘为左界（CSS --workspace-ui-left-inset） */
  useEffect(() => {
    const root = document.documentElement;
    const computeInsetPx = () => {
      const sidebarVisible =
        isUIVisible && isSidebarOpen && projectSidebarIsDocked && !projectSidebarIsFullWidth;
      if (!sidebarVisible) return 0;
      return PROJECT_SIDEBAR_DOCKED_WIDTH_PX;
    };
    const apply = () => {
      root.style.setProperty('--workspace-ui-left-inset', `${Math.round(computeInsetPx())}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      root.style.setProperty('--workspace-ui-left-inset', '0px');
    };
  }, [
    isUIVisible,
    isSidebarOpen,
    projectSidebarIsDocked,
    projectSidebarIsFullWidth,
    projectSidebarLargeViewport
  ]);

  /** 侧栏 docked：全宽启动页与项目内联共用同一壳，不再切换到单独「全屏 ProjectManager」 */
  const showDockedProjectSidebar =
    isUIVisible && isSidebarOpen && projectSidebarIsDocked;

  /** handoff 消费后清掉，避免下次打开误跳过入场动画 */
  useEffect(() => {
    if (!sidebarShellHandoffRef.current) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        sidebarShellHandoffRef.current = false;
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [showDockedProjectSidebar, projectSidebarIsDocked]);

  /**
   * 进入项目时工作区占位：中间态内不再单独展示「加载项目」屏（进度并入侧栏顶条），
   * 仅在非中间态的兜底加载才显示转圈文案。
   */
  const workspaceProjectPendingPlaceholder = (
    <div
      className={`flex h-full w-full min-h-0 flex-1 flex-col items-center justify-center gap-3 ${
        isProjectEnterTransition ? '' : 'bg-gray-100 text-gray-600'
      }`}
      style={isProjectEnterTransition ? { backgroundColor: themeColor } : undefined}
      aria-hidden={isProjectEnterTransition || undefined}
      aria-busy={!isProjectEnterTransition || undefined}
    >
      {isProjectEnterTransition ? null : (
        <>
          <Loader2 size={32} className="animate-spin shrink-0" aria-hidden />
          <span className="text-sm font-medium">加载项目…</span>
        </>
      )}
    </div>
  );

  const projectManagerLazyFallback = (
    <ModuleLoadProgress
      title="正在加载项目模块"
      description="正在准备项目列表与工作区"
      icon={<Grid size={22} aria-hidden />}
      themeColor={themeColor}
    />
  );

  const workspaceModuleMeta = useMemo(() => {
    if (viewMode === 'map' && projectKind === 'mapping') {
      return { title: '正在加载地图模块', icon: <MapIcon size={22} aria-hidden /> };
    }
    if (viewMode === 'board' && (projectKind === 'mapping' || projectKind === 'graph')) {
      return { title: '正在加载画布模块', icon: <Grid size={22} aria-hidden /> };
    }
    if (viewMode === 'graph' && projectKind === 'graph') {
      return { title: '正在加载图谱模块', icon: <GitBranch size={22} aria-hidden /> };
    }
    return { title: '正在加载表格模块', icon: <Table2 size={22} aria-hidden /> };
  }, [projectKind, viewMode]);

  const workspaceModuleLoadingFallback = (
    <ModuleLoadProgress
      key={`${projectKind ?? 'unknown'}-${viewMode}`}
      title={workspaceModuleMeta.title}
      icon={workspaceModuleMeta.icon}
      themeColor={themeColor}
    />
  );

  /** 进入/回主页中间态：列表收束与全屏壳动画（加载前后都保持，不把加载插在布局切换之间） */
  const projectManagerTransitionListOnly =
    isProjectEnterTransition || sidebarExpandingToHome;

  // Map Style State
  const [mapStyle, setMapStyle] = useState<string>('carto-light-nolabels');

  const [mapUiChromeOpacity, setMapUiChromeOpacity] = useState(DEFAULT_MAP_UI_CHROME_OPACITY);
  const [mapUiChromeOpacityBottom, setMapUiChromeOpacityBottom] = useState(
    DEFAULT_MAP_UI_CHROME_OPACITY_BOTTOM
  );
  const [mapUiChromeBlurPx, setMapUiChromeBlurPx] = useState(DEFAULT_MAP_UI_CHROME_BLUR_PX);
  const [uiDarkMode, setUiDarkMode] = useState(false);

  const forceSatelliteDark = projectKind === 'mapping' && viewMode === 'map';
  const chromeAppearance = useMemo(
    () =>
      resolveChromeAppearance({
        darkMode: uiDarkMode,
        mapStyleId: mapStyle,
        forceSatelliteDark
      }),
    [uiDarkMode, mapStyle, forceSatelliteDark]
  );

  const panelChromeStyle = useMemo(
    () => mapChromeSurfaceStyle(mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance),
    [mapUiChromeOpacity, mapUiChromeBlurPx, chromeAppearance]
  );

  const mapChromeHoverBg = useMemo(
    () => mapChromeHoverBackground(mapUiChromeOpacity, chromeAppearance),
    [mapUiChromeOpacity, chromeAppearance]
  );

  const mapViewSwitcherChromeStyle = mapChromeControlStyle(
    mapUiChromeOpacity,
    mapUiChromeBlurPx,
    chromeAppearance
  );
  const mapViewSwitcherInactiveStyle = { color: mapViewSwitcherChromeStyle.color };
  const mapViewSwitcherInactiveClass = 'ui-map-chrome-view-switcher-tab';
  const mapViewSwitcherStyle = {
    ...mapViewSwitcherChromeStyle,
    '--map-chrome-tab-hover-bg': mapChromeControlHoverBackground(
      mapUiChromeOpacity,
      chromeAppearance
    )
  };

  useEffect(() => {
    applyThemeChromeCssVars(document.documentElement, themeColor);
  }, [themeColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--map-ui-chrome-opacity', String(mapUiChromeOpacity));
    root.style.setProperty('--map-ui-chrome-opacity-top', String(mapUiChromeOpacity));
    root.style.setProperty('--map-ui-chrome-opacity-bottom', String(mapUiChromeOpacityBottom));
    const b = Math.min(48, Math.max(0, Math.round(mapUiChromeBlurPx)));
    root.style.setProperty('--map-ui-chrome-blur-px', b === 0 ? '0px' : `${b}px`);
  }, [mapUiChromeOpacity, mapUiChromeOpacityBottom, mapUiChromeBlurPx]);

  // Load Theme Color from IndexedDB
  useEffect(() => {
    const loadThemeColor = async () => {
      try {
        const savedColor = await get<string>('mapp-theme-color');
        if (savedColor) {
          setThemeColor(savedColor);
          // Update CSS variables
          const darkR = Math.max(0, Math.floor(parseInt(savedColor.slice(1, 3), 16) * 0.9));
          const darkG = Math.max(0, Math.floor(parseInt(savedColor.slice(3, 5), 16) * 0.9));
          const darkB = Math.max(0, Math.floor(parseInt(savedColor.slice(5, 7), 16) * 0.9));
          const darkHex = '#' + [darkR, darkG, darkB].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
          }).join('').toUpperCase();
          
          document.documentElement.style.setProperty('--theme-color', savedColor);
          document.documentElement.style.setProperty('--theme-color-dark', darkHex);
          
          // Update meta theme-color
          const metaThemeColor = document.querySelector('meta[name="theme-color"]');
          if (metaThemeColor) {
            metaThemeColor.setAttribute('content', savedColor);
          }
        }
      } catch (err) {
        console.error("Failed to load theme color", err);
      }
    };
    loadThemeColor();
  }, []);

  // Load Map Style from IndexedDB
  useEffect(() => {
    const loadMapStyle = async () => {
      try {
        const savedStyle = await get<string>('mapp-map-style');
        if (savedStyle) {
          setMapStyle(savedStyle);
        }
      } catch (err) {
        console.error("Failed to load map style", err);
      }
    };
    loadMapStyle();
  }, []);

  useEffect(() => {
    const loadMapUiChrome = async () => {
      try {
        const savedOpacity = await get<number>('mapp-map-ui-chrome-opacity');
        if (typeof savedOpacity === 'number' && !Number.isNaN(savedOpacity)) {
          setMapUiChromeOpacity(Math.min(1, Math.max(0.15, savedOpacity)));
        }
        const savedOpacityBottom = await get<number>('mapp-map-ui-chrome-opacity-bottom');
        if (typeof savedOpacityBottom === 'number' && !Number.isNaN(savedOpacityBottom)) {
          setMapUiChromeOpacityBottom(Math.min(1, Math.max(0.15, savedOpacityBottom)));
        } else if (typeof savedOpacity === 'number' && !Number.isNaN(savedOpacity)) {
          // 旧版本只有一个透明度；首次升级保持上下相同，避免材质突然变化。
          setMapUiChromeOpacityBottom(Math.min(1, Math.max(0.15, savedOpacity)));
        }
        const savedBlur = await get<number>('mapp-map-ui-chrome-blur-px');
        if (typeof savedBlur === 'number' && !Number.isNaN(savedBlur)) {
          setMapUiChromeBlurPx(Math.min(48, Math.max(0, Math.round(savedBlur))));
        }
        const savedDark = await get<boolean>('mapp-ui-dark-mode');
        if (typeof savedDark === 'boolean') {
          setUiDarkMode(savedDark);
        }
      } catch (err) {
        console.error('Failed to load map UI chrome settings', err);
      }
    };
    loadMapUiChrome();
  }, []);

  useEffect(() => {
    const loadHomeEasterEggSettings = async () => {
      try {
        const g = await get<number>('mapp-home-easter-egg-gravity-y');
        if (typeof g === 'number' && !Number.isNaN(g)) {
          setHomeEasterEggGravityY(Math.min(3, Math.max(0, g)));
        }
        const s = await get<number>('mapp-home-easter-egg-mouse-stiffness');
        if (typeof s === 'number' && !Number.isNaN(s)) {
          setHomeEasterEggMouseConstraintStiffness(Math.min(0.5, Math.max(0.02, s)));
        }
      } catch (err) {
        console.error('Failed to load home easter egg settings', err);
      }
    };
    loadHomeEasterEggSettings();
  }, []);

  // Load Projects from IndexedDB and Cloud
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 1. 快速加载项目（只显示项目列表）
        await projectState.loadProjects();
        
        // 2. 后台执行所有维护和同步任务（不阻塞UI）
        setTimeout(async () => {
          try {
            // 检查存储使用情况和详情
            const storageUsage = await checkStorageUsage();
            if (storageUsage) {
              console.log(`Storage usage: ${storageUsage.used.toFixed(2)}MB used, ${storageUsage.available.toFixed(2)}MB available (${storageUsage.percentage.toFixed(1)}%)`);
              if (storageUsage.percentage > 80) {
                console.warn('Storage usage is high, images may be automatically cleaned up by browser');
              }
            }

            // 检查存储详情
            const storageDetails = await checkStorageDetails();
            if (storageDetails) {
              console.log('Storage details:', {
                totalKeys: storageDetails.totalKeys,
                images: storageDetails.imageKeys,
                sketches: storageDetails.sketchKeys,
                projects: storageDetails.projectKeys,
                totalImageSize: `${storageDetails.totalImageSize.toFixed(2)}MB`,
                largestImages: storageDetails.largestImages.slice(0, 5).map(img =>
                  `${img.key.split('-').pop()}: ${img.size.toFixed(2)}MB`
                )
              });
            }

            // 分析存储冗余
            const redundancyAnalysis = await analyzeStorageRedundancy();
            if (redundancyAnalysis) {
              console.log('Storage redundancy analysis:', {
                uniqueImages: redundancyAnalysis.uniqueImages,
                duplicateImages: redundancyAnalysis.duplicateImages,
                uniqueSketches: redundancyAnalysis.uniqueSketches,
                duplicateSketches: redundancyAnalysis.duplicateSketches,
                redundantSpace: `${redundancyAnalysis.redundantSpace.toFixed(2)}MB`,
                topDuplicateGroups: redundancyAnalysis.duplicateGroups.slice(0, 3).map(group => ({
                  hash: group.hash.substring(0, 8),
                  count: group.count,
                  totalSize: `${group.size.toFixed(2)}MB`,
                  ids: group.ids.slice(0, 3).join(', ') + (group.ids.length > 3 ? '...' : '')
                }))
              });
        }
        
            // 数据迁移（后台执行）
            await migrateFromOldFormat();

            // 保守清理明显损坏的数据（后台执行）
            const cleanupResult = await cleanupCorruptedImages();
            if (cleanupResult.imagesCleaned > 0 || cleanupResult.sketchesCleaned > 0) {
              console.log(`Cleaned ${cleanupResult.imagesCleaned} corrupted images and ${cleanupResult.sketchesCleaned} corrupted sketches`);
            }
        
            // 云端同步（后台执行）
        // 检查 Supabase 是否配置，避免不必要的尝试
        const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (hasSupabaseConfig) {
          try {
            setSyncStatus('syncing');
            const cloudResult = await loadProjectsFromCloud();
            
            if (cloudResult.success && cloudResult.projects) {
                  // 获取完整的本地项目数据用于合并
                  const fullLocalProjects = await loadAllProjects(true);
              // 合并本地和云端数据
                  const merged = mergeProjects(fullLocalProjects, cloudResult.projects);
              
              // 如果合并后的数据与本地不同，更新本地
                  const localIds = new Set(fullLocalProjects.map(p => p.id));
              const mergedIds = new Set(merged.map(p => p.id));
                  const hasChanges = fullLocalProjects.length !== merged.length ||
                [...localIds].some(id => !mergedIds.has(id)) ||
                merged.some(p => {
                      const local = fullLocalProjects.find(lp => lp.id === p.id);
                  return !local || (local.version || 0) < (p.version || 0);
                });
        
              if (hasChanges) {
                // Note: Projects are now managed by useProjectState hook
                // Update project summaries
                await projectState.loadProjects();
              }
              
              // 如果云端有更新，同步到云端
              if (!cloudResult.isNewDevice) {
                await syncProjectsToCloud(merged);
              }
              
              setSyncStatus('success');
              setTimeout(() => setSyncStatus('idle'), 2000);
            } else if (cloudResult.error) {
              console.warn('Cloud load failed, using local data:', cloudResult.error);
              setSyncStatus('error');
              setSyncError(cloudResult.error);
              setTimeout(() => {
                setSyncStatus('idle');
                setSyncError(null);
              }, 3000);
        } else {
              // 新设备，上传本地数据到云端
                  const fullLocalProjects = await loadAllProjects(true);
                  if (fullLocalProjects.length > 0) {
                    await syncProjectsToCloud(fullLocalProjects);
              }
              setSyncStatus('success');
              setTimeout(() => setSyncStatus('idle'), 2000);
            }
          } catch (err) {
            console.error("云端同步失败:", err);
            setSyncStatus('error');
            setSyncError(err instanceof Error ? err.message : '同步失败');
            setTimeout(() => {
              setSyncStatus('idle');
              setSyncError(null);
            }, 3000);
             }
        }
          } catch (error) {
            console.warn('Background tasks failed:', error);
          }
        }, 200);
      } catch (err) {
        console.error("Failed to load projects", err);
        setIsLoading(false);
      }
    };
    loadProjects();
  }, []);


  // 禁止浏览器页面双指/捏合缩放；画布（地图/看板/图谱）自行处理 pinch。
  useEffect(() => {
    const CANVAS_PINCH_SELECTOR = [
      '.leaflet-container',
      '#board-view-container',
      '#graph-view-container',
      '.workspace-canvas--graph',
      '[data-mapp-canvas-pinch]'
    ].join(',');

    const CHROME_UI_SELECTOR = [
      '[data-chrome-window-surface]',
      '[data-compact-window-backdrop]',
      '[data-mapp-chrome-ui]',
      '[data-mapp-export-ui]',
      '.ui-workspace-bottom-bar'
    ].join(',');

    const asElement = (target: EventTarget | null): Element | null => {
      if (target instanceof Element) return target;
      if (target instanceof Text) return target.parentElement;
      return null;
    };

    const isChromeUi = (el: Element | null): boolean =>
      !!el?.closest(CHROME_UI_SELECTOR);

    const isCanvasPinchZone = (el: Element | null): boolean => {
      if (!el) return false;
      // 叠在画布上的 Chrome 窗口/工具条：手指落在 UI 上时一律拦页面缩放
      if (isChromeUi(el)) return false;
      return !!el.closest(CANVAS_PINCH_SELECTOR);
    };

    const touchHitsChromeUi = (touches: TouchList): boolean => {
      for (let i = 0; i < touches.length; i++) {
        const t = touches.item(i);
        if (!t) continue;
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (isChromeUi(el)) return true;
      }
      return false;
    };

    const allTouchesOnCanvas = (touches: TouchList): boolean => {
      if (touches.length < 2) return false;
      for (let i = 0; i < touches.length; i++) {
        const t = touches.item(i);
        if (!t) return false;
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (!isCanvasPinchZone(el)) return false;
      }
      return true;
    };

    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      const targetEl = asElement(e.target);
      // 窗口 / 工具条上的双指：一律禁止浏览器整页缩放
      if (isChromeUi(targetEl) || touchHitsChromeUi(e.touches)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      // 画布内双指：交给 Leaflet / Board / Graph，不要在这里 preventDefault
      if (isCanvasPinchZone(targetEl) || allTouchesOnCanvas(e.touches)) {
        return;
      }
      if (e.cancelable) e.preventDefault();
    };

    const preventGesture = (e: Event) => {
      // Safari 页面捏合走 gesture*；即便落在画布上也不要浏览器缩放（画布自管）
      if (e.cancelable) e.preventDefault();
    };

    const preventCtrlWheelPageZoom = (e: WheelEvent) => {
      // 触控板捏合在桌面表现为 ctrl/meta + wheel，会缩放整页
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isCanvasPinchZone(asElement(e.target))) return;
      if (e.cancelable) e.preventDefault();
    };

    const preventContextMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      // 允许在 UI 上使用右键：输入框、按钮、或带 data-allow-context-menu 的容器内
      if (
        target.closest('[data-allow-context-menu]') ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON'
      ) {
        return;
      }
      e.preventDefault();
    };

    // Tab key to toggle UI visibility
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Tab' &&
        !isEditorOpen &&
        (!mappingWorkspaceEditMode || viewMode === 'board')
      ) {
        e.preventDefault();
        setIsUIVisible(prev => !prev);
      }
    };

    document.addEventListener('touchstart', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });

    document.addEventListener('gesturestart', preventGesture, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gesturechange', preventGesture, { passive: false } as AddEventListenerOptions);
    document.addEventListener('gestureend', preventGesture, { passive: false } as AddEventListenerOptions);

    document.addEventListener('wheel', preventCtrlWheelPageZoom, { passive: false });

    document.addEventListener('contextmenu', preventContextMenu);

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('touchstart', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', preventCtrlWheelPageZoom);
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Save to IndexedDB and Cloud
  useEffect(() => {
    if (!isLoading && projects.length > 0) {
      // Note: Projects are now automatically saved by useProjectState hook
      
      // 2. 延迟同步到云端（防抖，避免频繁同步，仅在 Supabase 配置时执行）
      const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (hasSupabaseConfig) {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        
        syncTimeoutRef.current = setTimeout(async () => {
          if (shouldSync()) {
            try {
              setSyncStatus('syncing');
              const result = await syncProjectsToCloud(projects);
              
              if (result.success) {
                setSyncStatus('success');
                setTimeout(() => setSyncStatus('idle'), 2000);
              } else {
                setSyncStatus('error');
                setSyncError(result.error || '同步失败');
                setTimeout(() => {
                  setSyncStatus('idle');
                  setSyncError(null);
                }, 3000);
              }
            } catch (err) {
              console.error("云端同步失败:", err);
              setSyncStatus('error');
              setSyncError(err instanceof Error ? err.message : '同步失败');
              setTimeout(() => {
                setSyncStatus('idle');
                setSyncError(null);
              }, 3000);
            }
          }
        }, 2000); // 2秒后同步
      }
    }
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [projects, isLoading]);




  const addNote = async (note: Note) => {
    if (!currentProjectId) return;
    await projectState.addNoteToProject(currentProjectId, note);
  };

  const updateNote = async (updatedNote: Note) => {
    if (!currentProjectId) return;
    await projectState.updateNoteInProject(currentProjectId, updatedNote.id, updatedNote);
  };

  const deleteNote = async (noteId: string) => {
    if (!currentProjectId) return;
    
    // Find the note to delete (to get its images)
    const noteToDelete = activeProject?.notes.find(n => n.id === noteId);
    
    // Delete note's images if they are stored separately
    if (noteToDelete) {
      // Delete images
      if (noteToDelete.images && noteToDelete.images.length > 0) {
        for (const imageData of noteToDelete.images) {
          if (imageData.startsWith('img-')) {
            // It's an image ID, delete it
            try {
              await deleteImage(imageData);
            } catch (error) {
              console.error('Failed to delete image:', error);
            }
          }
          // If it's Base64 (legacy), no need to delete
        }
      }
      
      // Delete sketch
      if (noteToDelete.sketch && noteToDelete.sketch.startsWith('img-')) {
        try {
          await deleteSketch(noteToDelete.sketch);
        } catch (error) {
          console.error('Failed to delete sketch:', error);
        }
      }
    }
    
    // Delete note from project (this will also update connections)
    await projectState.deleteNoteFromProject(currentProjectId, noteId);
  };

  // 批量删除便签 - 优化版本，一次性处理多个便签
  const deleteNotesBatch = async (noteIds: string[]) => {
    if (!currentProjectId || noteIds.length === 0) return;

    console.log('Batch deleting notes:', noteIds);

    // 收集所有要删除的便签
    const notesToDelete = activeProject?.notes.filter(n => noteIds.includes(n.id)) || [];

    // 批量删除资源
    for (const noteToDelete of notesToDelete) {
      // Delete images
      if (noteToDelete.images && noteToDelete.images.length > 0) {
        for (const imageData of noteToDelete.images) {
          if (imageData.startsWith('img-')) {
            try {
              await deleteImage(imageData);
            } catch (error) {
              console.error('Failed to delete image:', error);
            }
          }
        }
      }

      // Delete sketch
      if (noteToDelete.sketch && noteToDelete.sketch.startsWith('img-')) {
        try {
          await deleteSketch(noteToDelete.sketch);
        } catch (error) {
          console.error('Failed to delete sketch:', error);
        }
      }
    }

    // 清理相关的连接
    const remainingConnections = activeProject.connections?.filter(conn =>
      !noteIds.includes(conn.fromNoteId) && !noteIds.includes(conn.toNoteId)
    ) || [];

    // 一次性更新项目，删除所有便签并清理连接
    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.filter(note => !noteIds.includes(note.id)),
      connections: remainingConnections
    };

    await projectState.updateProject(updatedProject);
  };

  const handleExportCSV = (project: Project) => {
    // 只导出标准便签（不包括小便签和纯文本）
    const standardNotes = project.notes;
    
    if (standardNotes.length === 0) {
      alert("该项目没有标准便签数据可导出。");
      return;
    }
    
    // 创建CSV内容
    // 支持多个分组：分组1、分组2、分组3
    const headers = ['文本内容', 'Tag1', 'Tag2', 'Tag3', '分组1', '分组2', '分组3'];
    const rows = standardNotes.map(note => {
      // 文本内容
      const text = note.text || '';
      
      // 标签
      const tags = note.tags || [];
      const tag1 = tags[0]?.label || '';
      const tag2 = tags[1]?.label || '';
      const tag3 = tags[2]?.label || '';
      
      // 分组（支持多个分组）
      const groupNames = note.groupNames || [];
      // 如果没有 groupNames，使用 groupName（向后兼容）
      const allGroups = groupNames.length > 0 
        ? groupNames 
        : (note.groupName ? [note.groupName] : []);
      
      const group1 = allGroups[0] || '';
      const group2 = allGroups[1] || '';
      const group3 = allGroups[2] || '';
      
      return [text, tag1, tag2, tag3, group1, group2, group3];
    });

    // 生成CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // 下载文件
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-数据.csv`;
    link.click();
  };

  const handleCreateProject = async (project: Project) => {
    const enteringFromHome = !currentProjectId;
    const hasImportedPayload =
      (project.notes?.length ?? 0) > 0 ||
      (project.frames?.length ?? 0) > 0 ||
      (project.connections?.length ?? 0) > 0;

    const runEnterRhythm = async (projectId: string) => {
      await beginProjectEnter({
        projectId,
        mode: enteringFromHome ? 'from-home' : 'steady',
        waitForExpand: enteringFromHome,
        setCurrentId: enteringFromHome
      });
      await projectState.selectProject(projectId);
      if (enteringFromHome) {
        await completeProjectEnter();
      }
    };

    if (hasImportedPayload) {
      await projectState.loadProjects();
      await runEnterRhythm(project.id);
      return;
    }

    const kind: ProjectKind = isProjectKind(project.projectKind) ? project.projectKind : 'mapping';
    const projectId = await projectState.createProject({
      name: project.name,
      projectKind: kind
    });

    setViewMode(defaultViewModeForKind(kind));
    await runEnterRhythm(projectId);
  };

  const handleDeleteProject = async (id: string) => {
    await projectState.deleteProject(id);
  };

  const handleDuplicateProject = async (project: Project) => {
    await duplicateProject(project);
  };

  const handleUpdateProject = async (projectOrId: Project | string, updates?: Partial<Project>) => {
    if (typeof projectOrId === 'string') {
      // Update by id and updates
      const currentProject = activeProject;
      if (currentProject && updates) {
        await projectState.updateProject({ ...currentProject, ...updates });
      }
    } else {
      // Update by full project object (optionally with updates patch)
      if (updates) {
        await projectState.updateProject({ ...projectOrId, ...updates });
      } else {
        await projectState.updateProject(projectOrId);
      }
    }
  };

  const handleThemeColorChange = async (color: string) => {
    // Update React state first
    setThemeColor(color);

    // Calculate dark variant
    const darkR = Math.max(0, Math.floor(parseInt(color.slice(1, 3), 16) * 0.9));
    const darkG = Math.max(0, Math.floor(parseInt(color.slice(3, 5), 16) * 0.9));
    const darkB = Math.max(0, Math.floor(parseInt(color.slice(5, 7), 16) * 0.9));
    const darkHex = '#' + [darkR, darkG, darkB].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();

    // Update CSS variables for immediate visual feedback
    document.documentElement.style.setProperty('--theme-color', color);
    document.documentElement.style.setProperty('--theme-color-dark', darkHex);

    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    }

    // Save to IndexedDB
    await set('mapp-theme-color', color);
    await set('mapp-theme-color-dark', darkHex);
  };

  const handleMapUiChromeOpacityChange = async (opacity: number) => {
    const o = Math.min(1, Math.max(0.15, opacity));
    setMapUiChromeOpacity(o);
    await set('mapp-map-ui-chrome-opacity', o);
  };

  const handleMapUiChromeOpacityBottomChange = async (opacity: number) => {
    const o = Math.min(1, Math.max(0.15, opacity));
    setMapUiChromeOpacityBottom(o);
    await set('mapp-map-ui-chrome-opacity-bottom', o);
  };

  const handleMapUiChromeBlurPxChange = async (blurPx: number) => {
    const b = Math.min(48, Math.max(0, Math.round(blurPx)));
    setMapUiChromeBlurPx(b);
    await set('mapp-map-ui-chrome-blur-px', b);
  };

  const handleUiDarkModeChange = async (dark: boolean) => {
    setUiDarkMode(dark);
    await set('mapp-ui-dark-mode', dark);
  };

  if (isLoading) {
    return (
      <>
        <div
          className="w-full min-h-dvh flex flex-col items-center justify-center text-theme-chrome-fg"
          style={{ backgroundColor: themeColor }}
        >
          <Loader2 size={48} className="animate-spin mb-4" />
          <div className="font-bold text-xl">Loading your maps...</div>
        </div>
      </>
    );
  }

  return (
    <EditInspectorProvider>
      <ChromeAppearanceContext.Provider value={chromeAppearance}>
      {kindPromptProject ? (
        <ProjectKindPromptDialog
          projectName={kindPromptProject.name}
          themeColor={themeColor}
          chromeSurfaceStyle={panelChromeStyle}
          onConfirm={(kind) => void handleConfirmProjectKind(kind)}
          onCancel={handleCancelProjectKind}
        />
      ) : null}
    <div
      className={`app-root w-full h-dvh max-h-dvh flex flex-col overflow-hidden relative ${
        uiDarkMode ? 'bg-zinc-800' : 'bg-gray-50'
      }`}
      style={{
        touchAction: 'manipulation'
      }}
    >
      {atSteadyProjectHome && homeEasterEggMode ? (
        <Suspense fallback={null}>
          <HomePhysicsPlayground
            enabled
            easterEggMode
            gravityY={homeEasterEggGravityY}
            mouseConstraintStiffness={homeEasterEggMouseConstraintStiffness}
            projectNames={projectSummaries.map((p) => p.name)}
            themeColor={themeColor}
          />
        </Suspense>
      ) : null}
      {/* 删除项目：保留简短阻断提示（加载项目改由 ProjectManager 顶部分条） */}
      {isDeletingProject && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div
            className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-gray-100/80 p-8 shadow-2xl"
            style={panelChromeStyle}
          >
            <Loader2 size={28} className="animate-spin shrink-0 text-gray-700" aria-hidden />
            <p className="text-center text-sm font-medium text-gray-700">正在删除项目文件…</p>
          </div>
        </div>
      )}

      <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${uiDarkMode ? 'bg-zinc-800' : 'bg-gray-50'}`}>
        <div className={`flex h-full min-h-0 min-w-0 w-full flex-1 flex-row ${uiDarkMode ? 'bg-zinc-800' : 'bg-gray-50'}`}>
          <AnimatePresence initial={false}>
            {showDockedProjectSidebar && (
              <MotionDiv
                key="docked-project-sidebar"
                className="relative z-[1990] h-full min-h-0 shrink-0 overflow-hidden shadow-2xl"
                style={{
                  borderRightWidth: projectSidebarIsFullWidth ? 0 : 1,
                  borderRightStyle: 'solid',
                  borderRightColor: themeColor,
                  backgroundColor: themeColor,
                  willChange: 'width',
                  boxShadow: projectSidebarIsFullWidth ? 'none' : undefined
                }}
                // Docked sidebar only changes its occupied width. Combining a
                // width animation with a second translate made its transparent
                // outer shell expose the workspace behind it like a second panel.
                // 窄屏从全宽 overlay 交接时跳过 width:0，避免先闪收再展开。
                initial={sidebarShellHandoffRef.current ? false : { width: 0 }}
                animate={{ width: projectSidebarDrawerWidthPx }}
                exit={
                  sidebarShellHandoffRef.current
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { width: 0 }
                }
                transition={{
                  width: {
                    type: 'tween',
                    duration: PROJECT_OPEN_SLIDE_DURATION_S,
                    ease: PROJECT_OPEN_SLIDE_EASE
                  }
                }}
                onAnimationStart={() => {
                  if (sidebarShellHandoffRef.current) sidebarShellHandoffRef.current = false;
                }}
              >
                <Suspense fallback={projectManagerLazyFallback}>
                  <ProjectManager
                  isSidebar
                  expandToHomeLayout={
                    !activeProject || isProjectEnterTransition || sidebarExpandingToHome
                  }
                  transitionListOnly={projectManagerTransitionListOnly}
                  showHomeHeroInTransition={pendingEnterWorkspaceFromHome}
                  sidebarExpandingToHome={sidebarExpandingToHome}
                  clearSelectionInTransition={
                    returnHomeClearingSelection || sidebarExpandingToHome
                  }
                  easterEggMode={atSteadyProjectHome && homeEasterEggMode}
                  onToggleEasterEggMode={() => {
                    setHomeEasterEggMode((v) => !v);
                  }}
                  easterEggGravityY={homeEasterEggGravityY}
                  onEasterEggGravityYChange={async (v) => {
                    const next = Math.min(3, Math.max(0, v));
                    setHomeEasterEggGravityY(next);
                    await set('mapp-home-easter-egg-gravity-y', next);
                  }}
                  easterEggMouseConstraintStiffness={homeEasterEggMouseConstraintStiffness}
                  onEasterEggMouseConstraintStiffnessChange={async (v) => {
                    const next = Math.min(0.5, Math.max(0.02, v));
                    setHomeEasterEggMouseConstraintStiffness(next);
                    await set('mapp-home-easter-egg-mouse-stiffness', next);
                  }}
                  showProjectLoadBar={projectEnterLoadBarVisible}
                  projectLoadProgress={projectEnterLoadProgress}
                  projects={summariesToProjects(projectSummaries)}
                  currentProjectId={currentProjectId}
                  onCreateProject={handleCreateProject}
                  onSelectProject={handleSelectProject}
                  onDeleteProject={handleDeleteProject}
                  onUpdateProject={handleUpdateProject}
                  onDuplicateProject={handleDuplicateProject}
                  onCloseSidebar={closeProjectSidebar}
                  onBackToHome={handleBackToHome}
                  viewMode={viewMode}
                  activeProject={activeProject}
                  onExportCSV={handleExportCSV}
                  syncStatus={syncStatus}
                  onCleanupBrokenReferences={handleCleanupBrokenReferences}
                  onCheckData={handleCheckData}
                  themeColor={themeColor}
                  onThemeColorChange={handleThemeColorChange}
                  mapUiChromeOpacity={mapUiChromeOpacity}
                  onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
                  mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
                  onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
                  mapUiChromeBlurPx={mapUiChromeBlurPx}
                  onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
                  uiDarkMode={uiDarkMode}
                  onUiDarkModeChange={handleUiDarkModeChange}
                  currentMapStyle={mapStyle}
                  onMapStyleChange={(styleId) => {
                    setMapStyle(styleId);
                    set('mapp-map-style', styleId);
                  }}
                  exampleDevMaintenanceMode={exampleDevMaintenanceMode}
                  onExampleDevMaintenanceModeToggle={() =>
                    setExampleDevMaintenanceMode((v) => !v)
                  }
                  />
                </Suspense>
              </MotionDiv>
            )}
          </AnimatePresence>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence>
      {isSidebarOpen && isUIVisible && !projectSidebarIsDocked && (
          <div className="fixed inset-0 z-[2000] flex overflow-hidden">
             <MotionDiv
               className="fixed inset-0 bg-black/20"
               onClick={() => {
                 if (sidebarExpandingToHome || sidebarExpandForProjectSwitch || returnHomeClearingSelection) return;
                 closeProjectSidebar();
               }}
               initial={{ opacity: 0 }}
               animate={{ opacity: sidebarExpandingToHome || sidebarExpandForProjectSwitch ? 0 : 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: PROJECT_OPEN_OVERLAY_FADE_S }}
               style={{
                 willChange: 'opacity',
                 pointerEvents:
                   sidebarExpandingToHome || sidebarExpandForProjectSwitch ? 'none' : 'auto'
               }}
             />
             <MotionDiv
               className="relative h-full z-[2001] overflow-hidden shrink-0 shadow-2xl"
               initial={
                 sidebarShellHandoffRef.current
                   ? { x: 0, width: projectSidebarDrawerWidthPx }
                   : { x: '-100%', width: projectSidebarDrawerWidthPx }
               }
               animate={{
                 x: 0,
                 width: projectSidebarDrawerWidthPx
               }}
               exit={
                 sidebarShellHandoffRef.current
                   ? { opacity: 0, transition: { duration: 0 } }
                   : { x: '-100%' }
               }
               transition={{
                 x: {
                   type: 'tween',
                   duration: PROJECT_OPEN_SLIDE_DURATION_S,
                   ease: PROJECT_OPEN_SLIDE_EASE
                 },
                 width: {
                   type: 'tween',
                   duration: PROJECT_OPEN_SLIDE_DURATION_S,
                   ease: PROJECT_OPEN_SLIDE_EASE
                 }
               }}
               style={{ willChange: 'transform, width' }}
               onAnimationStart={() => {
                 if (sidebarShellHandoffRef.current) sidebarShellHandoffRef.current = false;
               }}
             >
              <Suspense fallback={projectManagerLazyFallback}>
                <ProjectManager
                 isSidebar
                 expandToHomeLayout={
                   sidebarExpandingToHome || isProjectEnterTransition
                 }
                 transitionListOnly={projectManagerTransitionListOnly}
                 showHomeHeroInTransition={pendingEnterWorkspaceFromHome}
                 sidebarExpandingToHome={sidebarExpandingToHome}
                clearSelectionInTransition={
                  returnHomeClearingSelection || sidebarExpandingToHome
                }
                 easterEggMode={atSteadyProjectHome && homeEasterEggMode}
                 onToggleEasterEggMode={() => {
                   setHomeEasterEggMode((v) => !v);
                 }}
                 easterEggGravityY={homeEasterEggGravityY}
                 onEasterEggGravityYChange={async (v) => {
                   const next = Math.min(3, Math.max(0, v));
                   setHomeEasterEggGravityY(next);
                   await set('mapp-home-easter-egg-gravity-y', next);
                 }}
                 easterEggMouseConstraintStiffness={homeEasterEggMouseConstraintStiffness}
                 onEasterEggMouseConstraintStiffnessChange={async (v) => {
                   const next = Math.min(0.5, Math.max(0.02, v));
                   setHomeEasterEggMouseConstraintStiffness(next);
                   await set('mapp-home-easter-egg-mouse-stiffness', next);
                 }}
                 showProjectLoadBar={projectEnterLoadBarVisible}
                 projectLoadProgress={projectEnterLoadProgress}
                 projects={summariesToProjects(projectSummaries)}
                 currentProjectId={currentProjectId}
                 onCreateProject={handleCreateProject}
                 onSelectProject={handleSelectProject}
                 onDeleteProject={handleDeleteProject}
         onUpdateProject={handleUpdateProject}
                  onDuplicateProject={handleDuplicateProject}
                  onCloseSidebar={closeProjectSidebar}
                  onBackToHome={handleBackToHome}
                  viewMode={viewMode}
                  activeProject={activeProject}
                  onExportCSV={handleExportCSV}
                  syncStatus={syncStatus}
                  onCleanupBrokenReferences={handleCleanupBrokenReferences}
                  onCheckData={handleCheckData}
                  themeColor={themeColor}
                  onThemeColorChange={handleThemeColorChange}
                  mapUiChromeOpacity={mapUiChromeOpacity}
                  onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
                  mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
                  onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
 mapUiChromeBlurPx={mapUiChromeBlurPx}
                  onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
                  uiDarkMode={uiDarkMode}
                  onUiDarkModeChange={handleUiDarkModeChange}
                  currentMapStyle={mapStyle}
                  onMapStyleChange={(styleId) => {
                    setMapStyle(styleId);
                    set('mapp-map-style', styleId);
                  }}
                 exampleDevMaintenanceMode={exampleDevMaintenanceMode}
                 onExampleDevMaintenanceModeToggle={() =>
                   setExampleDevMaintenanceMode((v) => !v)
                 }
                />
              </Suspense>
             </MotionDiv>
        </div>
      )}
      </AnimatePresence>

      <div
        className={`relative z-0 min-h-0 flex-1 overflow-hidden${viewMode === 'table' || viewMode === 'graph' ? ` ${tableGraphDataFileDrop.rootProps.className}` : ''}`}
        style={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.style : undefined}
        onDragEnter={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.onDragEnter : undefined}
        onDragOver={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.onDragOver : undefined}
        onDragLeave={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.onDragLeave : undefined}
        onDrop={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.onDrop : undefined}
        onDragEnd={viewMode === 'table' || viewMode === 'graph' ? tableGraphDataFileDrop.rootProps.onDragEnd : undefined}
        onPointerDownCapture={handleWorkspaceTransientDismiss}
      >
        <ChromeDropOverlay
          open={
            (viewMode === 'table' || viewMode === 'graph') && tableGraphDataFileDrop.isDragging
          }
          themeColor={themeColor}
          chromeOpacity={mapUiChromeOpacity}
          chromeBlurPx={mapUiChromeBlurPx}
          title="拖入 JSON 或 CSV 以导入"
          description={viewMode === 'graph' ? '数据会导入当前图谱项目' : '数据会导入当前表格项目'}
          onDismiss={tableGraphDataFileDrop.dismissDrag}
        />
        <Suspense fallback={workspaceModuleLoadingFallback}>
        {activeProject ? (
          <>
        {/* 同步状态指示器 - 只在侧边栏打开时显示（在侧边栏内） */}
        {/* 主视图中不再显示云图标，统一在侧边栏显示 */}
        
        {!isEditorOpen &&
          !mappingWorkspaceEditMode &&
          isUIVisible &&
          !isSidebarOpen && (
          <button
             onClick={(e) => {
               // 只有在没有拖动时才触发点击
               if (!sidebarButtonDragRef.current.isDragging) {
                 setSidebarExpandForProjectSwitch(false);
                 // 与主页进入 / 侧栏切换项目同一终态：内联打开
                 setSidebarDockedInline(true);
                 setIsSidebarOpen(true);
               }
             }}
             onMouseDown={(e) => {
               sidebarButtonDragRef.current = {
                 isDragging: false,
                 startY: e.clientY,
                 startButtonY: sidebarButtonY
               };
             }}
             onMouseMove={(e) => {
               const dragState = sidebarButtonDragRef.current;
               if (e.buttons === 1) { // 左键按下
                 const deltaY = e.clientY - dragState.startY;
                 if (Math.abs(deltaY) > 5) {
                   dragState.isDragging = true;
                   const newY = Math.max(0, Math.min(window.innerHeight - 50, dragState.startButtonY + deltaY));
                   setSidebarButtonY(newY);
                 }
               }
             }}
             onMouseUp={() => {
               // 延迟重置isDragging，确保onClick不会触发
               setTimeout(() => {
                 sidebarButtonDragRef.current.isDragging = false;
               }, 10);
             }}
             onTouchStart={(e) => {
               const touch = e.touches[0];
               sidebarButtonDragRef.current = {
                 isDragging: false,
                 startY: touch.clientY,
                 startButtonY: sidebarButtonY
               };
             }}
             onTouchMove={(e) => {
               const touch = e.touches[0];
               const dragState = sidebarButtonDragRef.current;
               const deltaY = touch.clientY - dragState.startY;
               if (Math.abs(deltaY) > 5) {
                 dragState.isDragging = true;
                 const newY = Math.max(0, Math.min(window.innerHeight - 50, dragState.startButtonY + deltaY));
                 setSidebarButtonY(newY);
               }
             }}
             onTouchEnd={() => {
               setTimeout(() => {
                 sidebarButtonDragRef.current.isDragging = false;
               }, 10);
             }}
            className="sidebar-drawer-handle absolute left-0 z-[900] rounded-r-xl shadow-lg text-theme-chrome-fg transition-none cursor-move"
             style={{ 
               backgroundColor: themeColor,
               top: `${sidebarButtonY}px`
             }}
             onMouseEnter={(e) => {
               const darkR = Math.max(0, Math.floor(parseInt(themeColor.slice(1, 3), 16) * 0.9));
               const darkG = Math.max(0, Math.floor(parseInt(themeColor.slice(3, 5), 16) * 0.9));
               const darkB = Math.max(0, Math.floor(parseInt(themeColor.slice(5, 7), 16) * 0.9));
               const darkHex = '#' + [darkR, darkG, darkB].map(x => {
                 const hex = x.toString(16);
                 return hex.length === 1 ? '0' + hex : hex;
               }).join('').toUpperCase();
               e.currentTarget.style.backgroundColor = darkHex;
             }}
             onMouseLeave={(e) => e.currentTarget.style.backgroundColor = themeColor}
          >
             <Menu size={18} />
          </button>
        )}

        {viewMode === 'map' && projectKind === 'mapping' ? (
          isWorkspaceProjectDataStale ? (
          workspaceProjectPendingPlaceholder
          ) : (
          <MapView 
            project={activeProject}
            workspaceEditMode={mappingWorkspaceEditMode}
            onWorkspaceEditModeChange={setMappingWorkspaceEditMode}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onImportDialogChange={setIsImportDialogOpen}
            onUpdateProject={async (project) => {
              await projectState.updateProject(project);
            }}
            fileInputRef={mapViewFileInputRef}
            navigateToCoords={navigateToMapCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              clearMapNavigation();
            }}
            onSwitchToBoardView={(coords, mapInstance) => {
              // PRIORITY 1: Save current map position BEFORE any other operations
              if (mapInstance && currentProjectId) {
                saveMapPosition(currentProjectId, mapInstance);
              }

              // PRIORITY 2: Close editor and prepare navigation
              setIsEditorOpen(false);

              // PRIORITY 3: Set navigation coordinates and switch view
                if (coords) {
                navigateToBoard(coords);
                }
                setViewMode('board');
            }}
            themeColor={themeColor}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            showImportMenu={showMapImportMenu}
            setShowImportMenu={setShowMapImportMenu}
            showBorderPanel={showBorderPanel}
            setShowBorderPanel={setShowBorderPanel}
            borderGeoJSON={borderGeoJSON}
            setBorderGeoJSON={setBorderGeoJSON}
            onMapClick={() => {
              if (isEditorOpen) {
                setIsEditorOpen(false);
              }
            }}
            isUIVisible={isUIVisible}
            isRouteMode={isRouteMode}
            setIsRouteMode={setIsRouteMode}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            onThemeColorChange={handleThemeColorChange}
            uiDarkMode={uiDarkMode}
            onUiDarkModeChange={handleUiDarkModeChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            panelChromeStyle={panelChromeStyle}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
          />
          )
        ) : viewMode === 'board' && (projectKind === 'mapping' || projectKind === 'graph') ? (
          isWorkspaceProjectDataStale ? (
          workspaceProjectPendingPlaceholder
          ) : (
          <BoardView 
            notes={activeProject.notes || emptyNotes}
            workspaceEditMode={mappingWorkspaceEditMode}
            onWorkspaceEditModeChange={setMappingWorkspaceEditMode}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onDeleteNotesBatch={deleteNotesBatch}
            onToggleEditor={setIsEditorOpen}
            frames={activeProject.frames || emptyFrames}
            onUpdateFrames={async (frames) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, frames });
            }}
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            navigateToCoords={navigateToBoardCoords}
            projectId={currentProjectId || ''}
            onNavigateComplete={() => {
              clearBoardNavigation();
            }}
            onTransformChange={(x: number, y: number, scale: number) => {
              if (currentProjectId) {
                saveBoardPositionDirect(currentProjectId, x, y, scale);
              }
            }}
            onSwitchToMapView={
              projectKind === 'mapping'
                ? (coords?: { lat: number; lng: number; zoom?: number }) => {
                    // Close editor first to ensure UI state is correct
                    setIsEditorOpen(false);

                    if (coords) {
                      if (currentProjectId) cancelPendingMapLocate(currentProjectId);
                      navigateToMap(coords);
                      setViewMode('map');
                      return;
                    }

                    // GPS locate still in flight / waiting to apply: don't restore
                    // a stale cached camera over it.
                    if (currentProjectId && isMapLocatePending(currentProjectId)) {
                      navigateToMap(undefined);
                      setViewMode('map');
                      return;
                    }

                    // Prepare navigation coordinates
                    let navigationCoords = coords;
                    if (!navigationCoords && currentProjectId) {
                      // Read cached position from previous map session
                      const cached = getViewPositionCache(currentProjectId, 'map');
                      if (cached?.center && cached.zoom) {
                        navigationCoords = {
                          lat: cached.center[0],
                          lng: cached.center[1],
                          zoom: cached.zoom
                        };
                      }
                    }

                    // Set navigation coordinates and switch view
                    navigateToMap(navigationCoords || undefined);
                    setViewMode('map');
                  }
                : undefined
            }
            onSwitchToGraphView={
              projectKind === 'graph'
                ? (noteId: string) => {
                    setIsEditorOpen(false);
                    navigateToGraphNote(noteId);
                    setViewMode('graph');
                  }
                : undefined
            }
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            uiDarkMode={uiDarkMode}
            onUiDarkModeChange={handleUiDarkModeChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
            onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            connections={activeProject.connections ?? []}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
          />
          )
        ) : viewMode === 'graph' && projectKind === 'graph' ? (
          isWorkspaceProjectDataStale ? (
          workspaceProjectPendingPlaceholder
          ) : (
          <GraphView
            projectId={currentProjectId ?? ''}
            project={activeProject}
            workspaceEditMode={mappingWorkspaceEditMode}
            onWorkspaceEditModeChange={setMappingWorkspaceEditMode}
            themeColor={themeColor}
            isUIVisible={isUIVisible}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              setIsEditorOpen(false);
              if (coords) {
                navigateToBoard(coords);
              }
              setViewMode('board');
            }}
            onSwitchToMapView={undefined}
            navigateToGraphNoteId={navigateToGraphNoteId}
            onClearGraphNavigation={clearGraphNavigation}
            panelChromeStyle={panelChromeStyle}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            uiDarkMode={uiDarkMode}
            onUiDarkModeChange={handleUiDarkModeChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
            onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            onUpdateProject={handleUpdateProject}
          />
          )
        ) : (
          isWorkspaceProjectDataStale ? (
          workspaceProjectPendingPlaceholder
          ) : projectKind ? (
          <TableView 
            project={activeProject}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onToggleEditor={setIsEditorOpen}
            onUpdateFrames={async (frames) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, frames });
            }}
            onUpdateConnections={async (connections) => {
              if (!currentProjectId || !activeProject) return;
              await projectState.updateProject({ ...activeProject, connections });
            }}
            onSwitchToBoardView={(coords?: { x: number; y: number }) => {
              setIsEditorOpen(false);
              if (coords) {
                navigateToBoard(coords);
              }
              setViewMode('board');
            }}
            onSwitchToMapView={
              projectKind === 'mapping'
                ? (coords?: { lat: number; lng: number; zoom?: number }) => {
                    setIsEditorOpen(false);
                    if (coords && currentProjectId) cancelPendingMapLocate(currentProjectId);
                    navigateToMap(coords);
                    setViewMode('map');
                  }
                : undefined
            }
            onSwitchToGraphView={
              projectKind === 'graph'
                ? (noteId: string) => {
                    setIsEditorOpen(false);
                    navigateToGraphNote(noteId);
                    setViewMode('graph');
                  }
                : undefined
            }
            themeColor={themeColor}
            panelChromeStyle={panelChromeStyle}
            isUIVisible={isUIVisible}
            chromeHoverBackground={mapChromeHoverBg}
            onThemeColorChange={handleThemeColorChange}
            uiDarkMode={uiDarkMode}
            onUiDarkModeChange={handleUiDarkModeChange}
            mapUiChromeOpacity={mapUiChromeOpacity}
            onMapUiChromeOpacityChange={handleMapUiChromeOpacityChange}
            mapUiChromeOpacityBottom={mapUiChromeOpacityBottom}
            onMapUiChromeOpacityBottomChange={handleMapUiChromeOpacityBottomChange}
            mapUiChromeBlurPx={mapUiChromeBlurPx}
            onMapUiChromeBlurPxChange={handleMapUiChromeBlurPxChange}
            mapStyleId={mapStyle}
            onMapStyleChange={setMapStyle}
            projectId={currentProjectId ?? ''}
            onUpdateProject={handleUpdateProject}
          />
          ) : (
            <div className="flex h-full w-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-gray-100 text-gray-600">
              <span className="text-sm font-medium">请选择项目类型…</span>
            </div>
          )
        )}
          </>
        ) : isProjectEnterTransition || isLoadingProject ? (
          workspaceProjectPendingPlaceholder
        ) : (
          <div className="h-full min-h-0 flex-1 bg-gray-100" aria-hidden />
        )}
        </Suspense>
      </div>

      {!isEditorOpen &&
        activeProject &&
        !mappingWorkspaceEditMode &&
        isUIVisible && projectKind && (
        <div
          ref={mobileViewSwitcherRef}
          data-allow-context-menu
          data-mobile-expanded={isMobileViewSwitcherExpanded ? 'true' : 'false'}
          data-mapp-chrome-ui=""
          className={`fixed bottom-4 ui-workspace-center-x ui-workspace-bottom-bar -translate-x-1/2 z-[var(--z-workspace-tabs)] p-1.5 rounded-2xl shadow-xl border flex flex-nowrap justify-center gap-1 animate-in slide-in-from-bottom-4 fade-in ${
            panelChromeStyle ? 'border-gray-100/80' : 'border-white/50 map-chrome-surface-fallback'
          }`}
          style={mapViewSwitcherStyle}
        >
          {projectKind === 'mapping' ? (
            <button
              onClick={() => handleWorkspaceViewTabClick('map')}
              disabled={isImportDialogOpen}
              data-active={viewMode === 'map' ? 'true' : 'false'}
              className={`
              flex items-center gap-2 ${viewMode === 'map' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'map' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : `${mapViewSwitcherInactiveClass} text-gray-500`}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
              style={viewMode === 'map' ? { backgroundColor: themeColor } : mapViewSwitcherInactiveStyle}
            >
              <MapIcon size={20} />
              <span className="ui-workspace-view-tab-label">Mapping</span>
            </button>
          ) : null}
          {projectKind === 'graph' ? (
          <button
            onClick={() => handleWorkspaceViewTabClick('graph')}
            disabled={isImportDialogOpen}
            data-active={viewMode === 'graph' ? 'true' : 'false'}
            className={`
              flex items-center gap-2 ${viewMode === 'graph' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'graph' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : `${mapViewSwitcherInactiveClass} text-gray-500`}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'graph' ? { backgroundColor: themeColor } : mapViewSwitcherInactiveStyle}
          >
            <GitBranch size={20} />
            <span className="ui-workspace-view-tab-label">Graph</span>
          </button>
          ) : null}
          <button
            onClick={() => handleWorkspaceViewTabClick('board')}
            disabled={isImportDialogOpen}
            data-active={viewMode === 'board' ? 'true' : 'false'}
            className={`
              flex items-center gap-2 ${viewMode === 'board' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'board' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : `${mapViewSwitcherInactiveClass} text-gray-500`}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'board' ? { backgroundColor: themeColor } : mapViewSwitcherInactiveStyle}
          >
            <Grid size={20} />
            <span className="ui-workspace-view-tab-label">Board</span>
          </button>
          <button
            onClick={() => handleWorkspaceViewTabClick('table')}
            disabled={isImportDialogOpen}
            data-active={viewMode === 'table' ? 'true' : 'false'}
            className={`
              flex items-center gap-2 ${viewMode === 'table' ? 'px-4' : 'px-3'} py-2 rounded-xl transition-all font-bold text-sm
              ${viewMode === 'table' 
                ? 'text-theme-chrome-fg shadow-md scale-105' 
                : `${mapViewSwitcherInactiveClass} text-gray-500`}
              ${isImportDialogOpen ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            style={viewMode === 'table' ? { backgroundColor: themeColor } : mapViewSwitcherInactiveStyle}
          >
            <Table2 size={20} />
            <span className="ui-workspace-view-tab-label">Table</span>
          </button>
        </div>
      )}
            </div>
        </div>
      </div>

    </div>
      </ChromeAppearanceContext.Provider>
    </EditInspectorProvider>
  );
}
