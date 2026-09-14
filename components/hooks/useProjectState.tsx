import { useState, useEffect, useCallback } from 'react';
import { Note, Project, ProjectKind } from '../../types';
import {
  loadAllProjects,
  loadProjectSummaries,
  saveProject,
  deleteProject as deleteProjectStorage,
  loadProject,
  cleanBrokenReferences,
  flushPendingConnectionMigrationSave,
  ProjectSummary
} from '../../utils/persistence/storage';
import { syncNoteImageRefs } from '../../utils/persistence/imageAssetStore';

interface UseProjectStateReturn {
  // Project state
  projects: Project[];
  projectSummaries: ProjectSummary[];
  activeProject: Project | null;
  currentProjectId: string | null;
  isLoading: boolean;
  isLoadingProject: boolean;
  loadingProgress: number;
  isDeletingProject: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (projectData: { name: string; projectKind?: ProjectKind }) => Promise<string>;
  selectProject: (projectId: string) => Promise<Project | null>;

  updateProject: (project: Project) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  duplicateProject: (project: Project) => Promise<void>;
  addNoteToProject: (projectId: string, note: Note) => Promise<void>;
  updateNoteInProject: (projectId: string, noteId: string, updates: Partial<Note>) => Promise<void>;
  deleteNoteFromProject: (projectId: string, noteId: string) => Promise<void>;
  setCurrentProjectId: (id: string | null) => void;
  setActiveProject: (project: Project | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsLoadingProject: (loading: boolean) => void;
  setLoadingProgress: (progress: number) => void;
}

export const useProjectState = (): UseProjectStateReturn => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  // Convert ProjectSummary to basic Project for display
  const summariesToProjects = useCallback((summaries: ProjectSummary[]): Project[] => {
    return summaries.map(summary => ({
      id: summary.id,
      name: summary.name,
      type: summary.type,
      projectKind: summary.projectKind,
      createdAt: summary.createdAt,
      backgroundImage: undefined,
      notes: [], // Empty for now, will be loaded when selected
      frames: [],
      connections: [],
      backgroundOpacity: 1,
      themeColor: '#3B82F6' // Default theme color
    }));
  }, []);

  // Load complete project data with progress
  const loadCompleteProject = useCallback(async (projectId: string): Promise<Project | null> => {
    setLoadingProgress(0);

    try {
      // Step 1: Load project without images（含 ensureProjectCompatibility 内连线规范化）
      setLoadingProgress(10);
      const project = await loadProject(projectId, false);
      if (!project) return null;

      // Step 2: 校验引用完整性（不再把像素 hydrate 进 project.notes）
      if (project.notes.length > 0) {
        const totalNotes = project.notes.length;
        let loadedNotes = 0;

        const batchSize = 5;
        for (let i = 0; i < totalNotes; i += batchSize) {
          const batch = project.notes.slice(i, i + batchSize);
          const syncedBatch = batch.map((note) => syncNoteImageRefs(note));
          for (let j = 0; j < batch.length; j++) {
            project.notes[i + j] = syncedBatch[j];
          }
          loadedNotes += batch.length;
          const progress = 10 + (loadedNotes / totalNotes) * 90;
          setLoadingProgress(Math.min(100, Math.round(progress)));
        }
      } else {
        setLoadingProgress(100);
      }

      setLoadingProgress(95);
      project.notes = await cleanBrokenReferences(project.notes);
      setLoadingProgress(100);

      await flushPendingConnectionMigrationSave(project);

      return project;
    } catch (error) {
      console.error('Failed to load complete project:', error);
      return null;
    }
  }, []);

  // Load projects on mount
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const summaries = await loadProjectSummaries();
      setProjectSummaries(summaries);
      setProjects(summariesToProjects(summaries));
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  }, [summariesToProjects]);

  // Create new project
  const createProject = useCallback(async (projectData: {
    name: string;
    projectKind?: ProjectKind;
  }): Promise<string> => {
    const newProject: Project = {
      id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: projectData.name,
      type: 'map',
      projectKind: projectData.projectKind ?? 'mapping',
      createdAt: Date.now(),
      notes: [],
      frames: [],
      connections: [],
      version: Date.now(),
      storageVersion: 3
    };

    await saveProject(newProject);

    // Update state
    setProjects(prev => [...prev, newProject]);
    setProjectSummaries(prev => [...prev, {
      id: newProject.id,
      name: newProject.name,
      type: newProject.type,
      projectKind: newProject.projectKind,
      createdAt: newProject.createdAt,
      notesCount: 0,
      hasImages: false,
      hasSketches: false
    }]);

    return newProject.id;
  }, []);

  const selectProject = useCallback(
    async (projectId: string): Promise<Project | null> => {
      setCurrentProjectId(projectId);
      setIsLoadingProject(true);
      setLoadingProgress(0);
      try {
        const project = await loadCompleteProject(projectId);
        if (!project) return null;
        setActiveProject(project);
        return project;
      } catch {
        return null;
      } finally {
        setIsLoadingProject(false);
        setLoadingProgress(0);
      }
    },
    [loadCompleteProject]
  );

  // Update project
  const updateProject = useCallback(async (updatedProject: Project) => {
    await saveProject(updatedProject);
    setActiveProject(updatedProject);
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));

    // Also update projectSummaries to reflect name / kind changes
    setProjectSummaries(prev => prev.map(summary =>
      summary.id === updatedProject.id
        ? {
            ...summary,
            name: updatedProject.name,
            projectKind: updatedProject.projectKind
          }
        : summary
    ));
  }, []);

  // Delete project
  const deleteProject = useCallback(async (projectId: string) => {
    setIsDeletingProject(true);
    try {
      await deleteProjectStorage(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setProjectSummaries(prev => prev.filter(p => p.id !== projectId));
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setActiveProject(null);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeletingProject(false);
    }
  }, [currentProjectId]);

  // Duplicate project
  const duplicateProject = useCallback(async (project: Project) => {
    // Generate new IDs for all entities
    const newProjectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const duplicatedProject: Project = {
      id: newProjectId,
      name: `${project.name} (Copy)`,
      type: 'map',
      projectKind: project.projectKind,
      createdAt: Date.now(),
      notes: project.notes.map(note => ({
        ...note,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now()
      })),
      frames: project.frames?.map(frame => ({
        ...frame,
        id: `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })),
      connections: project.connections?.map(conn => ({
        ...conn,
        id: `connection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })),
      backgroundOpacity: project.backgroundOpacity,
      themeColor: project.themeColor,
      graphLayers: project.graphLayers,
      graphLayerStandard: project.graphLayerStandard,
      graphClusterBasis: project.graphClusterBasis,
      graphFrameLayers: project.graphFrameLayers,
      graphEmojiLayers: project.graphEmojiLayers,
      graphNodeSize: project.graphNodeSize,
      graphLabelFontPx: project.graphLabelFontPx,
      graphEdgeWeight: project.graphEdgeWeight,
      graphEdgeLabelFontPx: project.graphEdgeLabelFontPx,
      graphEdgeCurve: project.graphEdgeCurve,
      graphDefaultLayoutMode: project.graphDefaultLayoutMode
    };

    await saveProject(duplicatedProject);

    // Update state
    setProjects(prev => [...prev, duplicatedProject]);
    setProjectSummaries(prev => [...prev, {
      id: duplicatedProject.id,
      name: duplicatedProject.name,
      type: duplicatedProject.type,
      projectKind: duplicatedProject.projectKind,
      createdAt: duplicatedProject.createdAt,
      notesCount: duplicatedProject.notes.length,
      hasImages: duplicatedProject.notes.some(note => note.images && note.images.length > 0),
      hasSketches: duplicatedProject.notes.some(note => !!note.sketch)
    }]);
  }, []);

  // Add note to project
  const addNoteToProject = useCallback(async (projectId: string, note: Note) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: [...activeProject.notes, note]
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Update note in project
  const updateNoteInProject = useCallback(async (projectId: string, noteId: string, updates: Partial<Note>) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.map(note =>
        note.id === noteId ? { ...note, ...updates } : note
      )
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Delete note from project
  const deleteNoteFromProject = useCallback(async (projectId: string, noteId: string) => {
    if (!activeProject || activeProject.id !== projectId) return;

    const updatedProject = {
      ...activeProject,
      notes: activeProject.notes.filter((note) => note.id !== noteId),
      // 同步去掉端点已不存在的连线（打开项目时 normalizeProjectConnections 也会兜底）
      connections: (activeProject.connections || []).filter(
        (c) => c.fromNoteId !== noteId && c.toNoteId !== noteId
      )
    };

    await updateProject(updatedProject);
  }, [activeProject, updateProject]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return {
    projects,
    projectSummaries,
    activeProject,
    currentProjectId,
    isLoading,
    isLoadingProject,
    loadingProgress,
    isDeletingProject,
    loadProjects,
    createProject,
    selectProject,
    updateProject,
    deleteProject,
    duplicateProject,
    addNoteToProject,
    updateNoteInProject,
    deleteNoteFromProject,
    setCurrentProjectId,
    setActiveProject,
    setIsLoading,
    setIsLoadingProject,
    setLoadingProgress
  };
};

