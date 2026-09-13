import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Note, Project, Frame, Connection, type GraphLayerState } from '../types';
import { Trash2 } from 'lucide-react';
import {
  clampConnectionWeight,
  connectionToGraphDirection,
  DEFAULT_CONNECTION_WEIGHT
} from '../utils/graph/graphData';
import { generateId, parseNoteContent } from '../utils';
import { mergeGraphLayerState, type GraphLayerGroupStandard } from '../utils/graph/graphRuntimeCore';
import { groupDisplayLabel, noteBelongsToLayerGroupKey } from '../utils/layer/unifiedNoteLayer';
import { NoteEditor } from './NoteEditor';
import { ProjectNotesLayerPanel } from './layer/ProjectNotesLayerPanel';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { SettingsPanel } from './SettingsPanel';
import { TableTopLeftSettingsButton } from './table/TableTopLeftSettingsButton';
import { TableTopRightDownloadButton } from './table/TableTopRightDownloadButton';
import { TableBottomSubViewBar } from './table/TableBottomSubViewBar';
import { GraphTopCenterConnectionButton } from './graph/GraphTopCenterConnectionButton';
import { GraphConnectionPanel, connectionToPanelDraft, type ConnectionDraft } from './graph/GraphConnectionPanel';
import { resolveProjectKind } from '../utils/projectKind';

interface TableViewProps {
  project: Project;
  /** 写入 Graph Style 等到项目 */
  projectId?: string;
  onUpdateProject?: (projectOrId: Project | string, updates?: Partial<Project>) => void | Promise<void>;
  onUpdateNote: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void | Promise<void>;
  onUpdateFrames?: (frames: Frame[]) => void;
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
  onSwitchToBoardView?: (coords?: { x: number; y: number }) => void;
  onSwitchToMapView?: (coords?: { lat: number; lng: number; zoom?: number }) => void;
  onSwitchToGraphView?: (noteId: string) => void;
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  isUIVisible?: boolean;
  chromeHoverBackground?: string;
  onThemeColorChange?: (color: string) => void;
  mapUiChromeOpacity?: number;
  onMapUiChromeOpacityChange?: (opacity: number) => void;
  mapUiChromeBlurPx?: number;
  onMapUiChromeBlurPxChange?: (blurPx: number) => void;
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

type PendingTableDelete =
  | { kind: 'note'; noteId: string; titleHint: string }
  | { kind: 'connection'; connectionId: string };

type TableSubView = 'points' | 'edges';

function noteRowTitle(note: Note | undefined): string {
  if (!note) return '（便签已删除）';
  return parseNoteContent(note.text || '').title || '无标题';
}

function edgeDirectionHint(c: Connection): string {
  const d = connectionToGraphDirection(c);
  if (d === 'forward') return '→';
  if (d === 'backward') return '←';
  if (d === 'both') return '↔';
  return '—';
}

function sanitizeFilenamePart(s: string): string {
  const t = s.trim().replace(/[/\\?%*:|"<>]/g, '_');
  return t.slice(0, 80) || 'table';
}

function csvEscapeCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: (string | number | undefined | null)[][]): string {
  const lines = rows.map((row) => row.map(csvEscapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

function triggerDownloadCsv(filename: string, csvBody: string) {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatNoteYearRange(note: Note): string {
  const { startYear, endYear } = note;
  if (startYear != null && endYear != null) return `${startYear}-${endYear}`;
  if (startYear != null) return String(startYear);
  if (endYear != null) return String(endYear);
  return '';
}

export const TableView: React.FC<TableViewProps> = ({
  project,
  projectId = '',
  onUpdateProject,
  onUpdateNote,
  onDeleteNote,
  onUpdateFrames: _onUpdateFrames,
  onUpdateConnections,
  onSwitchToBoardView,
  onSwitchToMapView,
  onSwitchToGraphView,
  themeColor,
  panelChromeStyle,
  isUIVisible = true,
  chromeHoverBackground,
  onThemeColorChange,
  mapUiChromeOpacity = 0.9,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx = 8,
  onMapUiChromeBlurPxChange,
  mapStyleId = 'carto-light-nolabels',
  onMapStyleChange,
}) => {
  const ch = panelChromeStyle;
  const chHover = chromeHoverBackground;
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [subView, setSubView] = useState<TableSubView>('points');
  const [pendingDelete, setPendingDelete] = useState<PendingTableDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [editorNoteId, setEditorNoteId] = useState<string | null>(null);
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>({
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow',
    weight: DEFAULT_CONNECTION_WEIGHT
  });
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);

  /** Mapping 项目表视图仅节点表；关联表仅 Graph 项目 */
  const edgesTableEnabled = resolveProjectKind(project) === 'graph';
  const activeSubView: TableSubView = edgesTableEnabled ? subView : 'points';

  useEffect(() => {
    if (!edgesTableEnabled && subView !== 'points') setSubView('points');
    if (!edgesTableEnabled) {
      setShowConnectionPanel(false);
      setPickTarget(null);
    }
  }, [edgesTableEnabled, subView]);

  const textNotes = useMemo(
    () => project.notes.filter(note => note.variant !== 'image'),
    [project.notes]
  );

  const connections = project.connections ?? [];
  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    project.notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [project.notes]);

  const tableGraphLayerStandard = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;
  const mergedTagTableLayers = useMemo(
    () => mergeGraphLayerState(textNotes, project.graphLayers ?? null, 'tag'),
    [textNotes, project.graphLayers]
  );
  const mergedFrameTableLayers = useMemo(
    () => mergeGraphLayerState(textNotes, project.graphFrameLayers ?? null, 'frame'),
    [textNotes, project.graphFrameLayers]
  );
  const mergedTableLayers =
    tableGraphLayerStandard === 'frame' ? mergedFrameTableLayers : mergedTagTableLayers;

  const handleTableGraphLayersChange = useCallback(
    (next: GraphLayerState) => {
      if (!onUpdateProject) return;
      if (tableGraphLayerStandard === 'frame') {
        void onUpdateProject(project, { graphFrameLayers: next });
      } else {
        void onUpdateProject(project, { graphLayers: next });
      }
    },
    [onUpdateProject, project, tableGraphLayerStandard]
  );

  const handleTableLayerStandardChange = useCallback(
    (standard: GraphLayerGroupStandard) => {
      if (!onUpdateProject) return;
      void onUpdateProject(project, { graphLayerStandard: standard });
    },
    [onUpdateProject, project]
  );

  const handleTableBatchNotes = useCallback(
    async (nextSubset: Note[]) => {
      if (!onUpdateProject) return;
      const map = new Map(nextSubset.map((n) => [n.id, n]));
      const mergedAll = project.notes.map((n) => map.get(n.id) ?? n);
      await onUpdateProject(project, { notes: mergedAll });
    },
    [onUpdateProject, project]
  );

  const handleUpdateFrameTitle = useCallback(
    async (frameId: string, nextTitle: string) => {
      if (!onUpdateProject) return;
      const nextFrames = (project.frames ?? []).map((f) => (f.id === frameId ? { ...f, title: nextTitle } : f));
      await onUpdateProject(project, { frames: nextFrames });
    },
    [onUpdateProject, project]
  );

  const confirmPendingDelete = async () => {
    if (!pendingDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === 'note' && onDeleteNote) {
        await onDeleteNote(pendingDelete.noteId);
      } else if (pendingDelete.kind === 'connection' && onUpdateConnections) {
        await onUpdateConnections(connections.filter((c) => c.id !== pendingDelete.connectionId));
      }
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const downloadCurrentTable = useCallback(() => {
    const base = sanitizeFilenamePart(project.name);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
    if (activeSubView === 'points') {
      const header = ['分组', '节点ID', '标题', '正文', '时间段', '标签'];
      const rows: (string | number | undefined | null)[][] = [header];
      const std = (project.graphLayerStandard ?? 'tag') as GraphLayerGroupStandard;
      const merged =
        std === 'frame'
          ? mergeGraphLayerState(textNotes, project.graphFrameLayers ?? null, 'frame')
          : mergeGraphLayerState(textNotes, project.graphLayers ?? null, 'tag');
      const fm = new Map((project.frames ?? []).map((f) => [String(f.id).trim(), f]));
      for (const key of merged.order) {
        const gl = groupDisplayLabel(String(key).trim(), std, fm);
        const inGroup = textNotes.filter((n) => noteBelongsToLayerGroupKey(n, String(key).trim(), std));
        for (const note of inGroup) {
          rows.push([
            gl,
            note.id,
            noteRowTitle(note),
            note.text || '',
            formatNoteYearRange(note),
            note.tags.map((t) => t.label).join('; '),
          ]);
        }
      }
      triggerDownloadCsv(`${base}_节点表_${ts}.csv`, buildCsv(rows));
      return;
    }
    const header = ['起点ID', '起点标题', '方向', '终点ID', '终点标题', '关系说明', '连接ID'];
    const rows: (string | number | undefined | null)[][] = [header];
    for (const c of connections) {
      const fromNote = noteById.get(c.fromNoteId);
      const toNote = noteById.get(c.toNoteId);
      rows.push([
        c.fromNoteId,
        noteRowTitle(fromNote),
        edgeDirectionHint(c),
        c.toNoteId,
        noteRowTitle(toNote),
        c.label || '',
        c.id,
      ]);
    }
    triggerDownloadCsv(`${base}_关联表_${ts}.csv`, buildCsv(rows));
  }, [activeSubView, textNotes, connections, noteById, project.name, project.graphLayerStandard, project.graphLayers, project.graphFrameLayers, project.frames]);

  const rowTrashBtn =
    'opacity-0 pointer-events-none transition-all group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50';

  const toggleConnectionPanel = useCallback(() => {
    setShowConnectionPanel((open) => !open);
  }, []);

  const handleNewConnection = useCallback(() => {
    setPanelEditingKey('new');
    setConnectionDraft({
      fromNoteId: '',
      toNoteId: '',
      label: '',
      fromArrow: 'none',
      toArrow: 'arrow',
      weight: DEFAULT_CONNECTION_WEIGHT
    });
    setPickTarget(null);
  }, []);

  const openConnectionEditor = useCallback((connection: Connection) => {
    setPanelEditingKey(connection.id);
    setConnectionDraft(connectionToPanelDraft(connection));
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const commitConnectionDraft = useCallback(() => {
    if (!onUpdateConnections) return;
    const { fromNoteId, toNoteId, label, fromArrow, toArrow, weight } = connectionDraft;
    if (!fromNoteId || !toNoteId) {
      window.alert('请选择起点和终点后再保存。');
      return;
    }
    if (fromNoteId === toNoteId) {
      window.alert('起点与终点不能是同一便签。');
      return;
    }
    const trimmedLabel = label.trim();
    const connWeight = clampConnectionWeight(weight);
    const arrow: Connection['arrow'] =
      toArrow === 'arrow' && fromArrow === 'none'
        ? 'forward'
        : fromArrow === 'arrow' && toArrow === 'none'
          ? 'reverse'
          : 'none';
    if (panelEditingKey === 'new') {
      const newConn: Connection = {
        id: generateId(),
        fromNoteId,
        toNoteId,
        fromSide: 'bottom',
        toSide: 'top',
        label: trimmedLabel || undefined,
        fromArrow,
        toArrow,
        arrow,
        weight: connWeight
      };
      void onUpdateConnections([...connections, newConn]);
    } else {
      const existing = connections.find((c) => c.id === panelEditingKey);
      if (!existing) {
        window.alert('当前编辑的连线已不存在，请关闭面板后重试。');
        return;
      }
      void onUpdateConnections(
        connections.map((c) =>
          c.id === panelEditingKey
            ? {
                ...c,
                fromNoteId,
                toNoteId,
                label: trimmedLabel || undefined,
                fromArrow,
                toArrow,
                arrow,
                weight: connWeight
              }
            : c
        )
      );
    }
    setShowConnectionPanel(false);
    setPickTarget(null);
  }, [connectionDraft, connections, onUpdateConnections, panelEditingKey]);

  const handleDeleteConnectionByPanel = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    void onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [connections, onUpdateConnections, panelEditingKey]);

  /** 与 GraphView 关联面板一致：行末减号需可清草稿并退出点选（无画布时仅改 state） */
  const clearTableConnectionPanelGraphAndDraft = useCallback(() => {
    setPickTarget(null);
    if (panelEditingKey === 'new') {
      setConnectionDraft((d) => ({ ...d, fromNoteId: '', toNoteId: '' }));
    } else {
      setPanelEditingKey('new');
      setConnectionDraft({
        fromNoteId: '',
        toNoteId: '',
        label: '',
        fromArrow: 'none',
        toArrow: 'arrow',
        weight: DEFAULT_CONNECTION_WEIGHT
      });
    }
  }, [panelEditingKey]);

  const clearTableConnectionFromOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, []);

  const clearTableConnectionToOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, []);

  /** 与左上角设置、系统状态栏错开，避免分组标题紧贴视口顶 */
  const tableScrollTopPad =
    'max(5.5rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))';

  return (
    <div className="relative h-full bg-gray-50 flex flex-col min-h-0">
      <TableTopLeftSettingsButton
        isUIVisible={isUIVisible}
        themeColor={themeColor}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        settingsOpen={showSettingsPanel}
        settingsButtonRef={settingsButtonRef}
        onOpenSettings={() => setShowSettingsPanel((v) => !v)}
      />
      <TableTopRightDownloadButton
        isUIVisible={isUIVisible}
        chromeSurfaceStyle={ch}
        chromeHoverBackground={chHover}
        onDownload={downloadCurrentTable}
        subView={activeSubView}
      />
      {edgesTableEnabled ? (
        <GraphTopCenterConnectionButton
          visible={isUIVisible && activeSubView === 'edges' && !!onUpdateConnections}
          chromeSurfaceStyle={ch}
          chromeHoverBackground={chHover}
          showConnectionPanel={showConnectionPanel}
          onToggleConnectionPanel={toggleConnectionPanel}
        />
      ) : null}
      <div
        className={`flex-1 min-h-0 overflow-auto px-4 sm:px-6 box-border ${
          edgesTableEnabled ? 'pb-28' : 'pb-8'
        }`}
        style={{ paddingTop: tableScrollTopPad }}
      >
        {activeSubView === 'points' ? (
          <>
            {onUpdateProject ? (
              <div className="relative mb-6 w-full max-w-xl mx-auto">
                <ProjectNotesLayerPanel
                  embed
                  themeColor={themeColor}
                  panelChromeStyle={panelChromeStyle}
                  variant="dock"
                  dockAlign="start"
                  projectId={projectId || project.id}
                  merged={mergedTableLayers}
                  layerGroupStandard={tableGraphLayerStandard}
                  onLayerGroupStandardChange={handleTableLayerStandardChange}
                  onStateChange={handleTableGraphLayersChange}
                  notes={textNotes}
                  onUpdateNote={onUpdateNote}
                  onBatchUpdateNotes={handleTableBatchNotes}
                  frames={project.frames ?? []}
                  onActivateNote={(n) => setEditorNoteId(n.id)}
                  tableMode
                  onUpdateFrameTitle={handleUpdateFrameTitle}
                />
              </div>
            ) : (
              <p className="mb-4 text-sm text-gray-500">只读模式：图层面板需要项目写入权限。</p>
            )}
            {textNotes.length === 0 ? (
              <div className="py-12 text-center italic text-gray-400">暂无便签数据</div>
            ) : null}
          </>
        ) : (
          <div className="mb-8">
            <h3 className="text-base font-bold text-gray-700 mb-3">关联表</h3>
            <div className="bg-white rounded-2xl shadow-sm w-full overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[36rem]">
                  <div className="flex gap-2 px-3 sm:px-4 py-2 bg-gray-100 font-bold text-sm text-gray-600 border-b border-gray-200">
                    <div className="flex-1 min-w-[7rem]">起点（节点）</div>
                    <div className="w-8 flex-shrink-0 text-center text-gray-400" title="方向">
                      向
                    </div>
                    <div className="flex-1 min-w-[7rem]">终点（节点）</div>
                    <div className="w-[min(12rem,30%)] flex-shrink-0">标签</div>
                    <div className="w-10 flex-shrink-0 text-right"> </div>
                  </div>
                  {connections.map((c) => {
                    const fromNote = noteById.get(c.fromNoteId);
                    const toNote = noteById.get(c.toNoteId);
                    return (
                      <div
                        key={c.id}
                        className="group flex gap-2 items-center px-3 sm:px-4 py-2.5 border-b border-gray-100 text-sm cursor-pointer hover:bg-gray-50"
                        onClick={() => openConnectionEditor(c)}
                      >
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(fromNote)}>
                          {noteRowTitle(fromNote)}
                        </div>
                        <div className="w-8 flex-shrink-0 text-center text-gray-500 font-mono" title="与关系图一致的箭头方向">
                          {edgeDirectionHint(c)}
                        </div>
                        <div className="flex-1 min-w-[7rem] text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis" title={noteRowTitle(toNote)}>
                          {noteRowTitle(toNote)}
                        </div>
                        <div className="w-[min(12rem,30%)] flex-shrink-0">
                          {onUpdateConnections ? (
                            <input
                              key={`${c.id}-${c.label ?? ''}`}
                              defaultValue={c.label || ''}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v === (c.label || '')) return;
                                onUpdateConnections(
                                  connections.map((x) => (x.id === c.id ? { ...x, label: v } : x))
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 rounded-lg border border-gray-200/80 bg-white text-xs outline-none focus:ring-2 focus:ring-offset-0"
                              style={{ ['--tw-ring-color' as string]: themeColor }}
                            />
                          ) : (
                            <span className="text-gray-600 text-xs">{c.label || '—'}</span>
                          )}
                        </div>
                        <div className="w-10 flex-shrink-0 flex justify-end">
                          {onUpdateConnections ? (
                            <button
                              type="button"
                              title="删除关联"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDelete({ kind: 'connection', connectionId: c.id });
                              }}
                              className={rowTrashBtn}
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {connections.length === 0 && (
                    <div className="p-8 text-center text-gray-400 italic">暂无关联，可在看板连接便签后在此查看</div>
                  )}
                </div>
              </div>
            </div>
            {!onUpdateConnections && connections.length > 0 ? (
              <p className="mt-2 text-xs text-gray-500">当前为只读列表；完整编辑请在看板或图谱中操作。</p>
            ) : null}
          </div>
        )}

      {edgesTableEnabled && showConnectionPanel && onUpdateConnections && isUIVisible && (
        <GraphConnectionPanel
          isOpen
          themeColor={themeColor}
          panelChromeStyle={panelChromeStyle}
          notes={project.notes}
          draft={connectionDraft}
          onDraftChange={(patch) => setConnectionDraft((d) => ({ ...d, ...patch }))}
          panelEditingKey={panelEditingKey}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          onCommit={commitConnectionDraft}
          onDelete={handleDeleteConnectionByPanel}
          onNewConnection={handleNewConnection}
          onBeginEndpointEdit={handleNewConnection}
          disableGraphPick
          graphPickDisabledHint="请到 GraphView 选点"
          onClearGraphAndDraftSelection={clearTableConnectionPanelGraphAndDraft}
          onClearFromSelection={clearTableConnectionFromOnly}
          onClearToSelection={clearTableConnectionToOnly}
          showClearSelection={
            !!pickTarget || !!connectionDraft.fromNoteId || !!connectionDraft.toNoteId
          }
          onClose={() => {
            setShowConnectionPanel(false);
            setPickTarget(null);
          }}
        />
      )}

      {
        <NoteEditor
          initialNote={project.notes.find(n => n.id === editorNoteId)}
          isOpen={!!editorNoteId}
          onClose={() => setEditorNoteId(null)}
          onSave={(updatedNote) => {
            if (editorNoteId) {
              const existingNote = project.notes.find(n => n.id === editorNoteId);
              if (existingNote) {
                onUpdateNote({ ...existingNote, ...updatedNote });
              }
            }
            setEditorNoteId(null);
          }}
          onSwitchToBoardView={onSwitchToBoardView}
          onSwitchToMapView={onSwitchToMapView}
          onSwitchToGraphView={onSwitchToGraphView}
          themeColor={themeColor}
          mapUiChromeOpacity={mapUiChromeOpacity}
          mapUiChromeBlurPx={mapUiChromeBlurPx}
        />
      }
      </div>

      {edgesTableEnabled ? (
        <TableBottomSubViewBar
          panelChromeStyle={panelChromeStyle}
          themeColor={themeColor}
          subView={subView}
          onChangeSubView={setSubView}
        />
      ) : null}

      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        anchorRef={settingsButtonRef}
        settingsContextView="table"
        themeColor={themeColor}
        onThemeColorChange={onThemeColorChange ?? (() => {})}
        mapUiChromeOpacity={mapUiChromeOpacity}
        onMapUiChromeOpacityChange={onMapUiChromeOpacityChange ?? (() => {})}
        mapUiChromeBlurPx={mapUiChromeBlurPx}
        onMapUiChromeBlurPxChange={onMapUiChromeBlurPxChange ?? (() => {})}
        currentMapStyle={mapStyleId}
        onMapStyleChange={onMapStyleChange ?? (() => {})}
        graphProject={project}
        onGraphProjectPatch={
          onUpdateProject && projectId
            ? (patch) => void onUpdateProject(projectId, patch)
            : undefined
        }
      />

      <DeleteConfirmDialog
        open={!!pendingDelete}
        variant={pendingDelete?.kind === 'connection' ? 'connection' : 'note'}
        titleHint={pendingDelete?.kind === 'note' ? pendingDelete.titleHint : undefined}
        confirming={deleteSubmitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
        themeColor={themeColor}
        panelChromeStyle={panelChromeStyle}
      />
    </div>
  );
};
