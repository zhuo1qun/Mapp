import { useCallback, useState } from 'react';
import type { Connection, Project } from '../../types';
import { generateId } from '../../utils';
import {
  clampConnectionWeight,
  DEFAULT_CONNECTION_WEIGHT
} from '../../utils/connections/connectionData';
import { connectionToPanelDraft, type ConnectionDraft } from '../graph/GraphConnectionPanel';

function emptyConnectionDraft(): ConnectionDraft {
  return {
    fromNoteId: '',
    toNoteId: '',
    label: '',
    fromArrow: 'none',
    toArrow: 'arrow',
    weight: DEFAULT_CONNECTION_WEIGHT
  };
}

function draftFromProjectDefaults(
  p?: Pick<Project, 'graphNewConnectionFromArrow' | 'graphNewConnectionToArrow'>
): Pick<ConnectionDraft, 'fromArrow' | 'toArrow'> {
  const fa = p?.graphNewConnectionFromArrow;
  const ta = p?.graphNewConnectionToArrow;
  return {
    fromArrow: fa === 'arrow' ? 'arrow' : 'none',
    toArrow: ta === 'none' ? 'none' : 'arrow'
  };
}

/**
 * 地图 / 看板 / 表格等与 GraphConnectionPanel 的「检索选点」模式共用：
 * 避免在多个视图里复制 commit / 清空 / 从属性面板预填起点 等逻辑。
 * 图谱视图因点选节点、保存动效、nonce 等与画布强耦合，仍用本地 state。
 */
export function useSimpleConnectionPanel({
  connections,
  onUpdateConnections,
  projectDefaults,
  anchorNoteIdForNew
}: {
  connections: Connection[];
  onUpdateConnections?: (connections: Connection[]) => void | Promise<void>;
  projectDefaults?: Pick<Project, 'graphNewConnectionFromArrow' | 'graphNewConnectionToArrow'>;
  /** 属性面板「新建关联」时作为起点的当前选中便签 id */
  anchorNoteIdForNew: string | null;
}) {
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [panelEditingKey, setPanelEditingKey] = useState<string | 'new'>('new');
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(() => emptyConnectionDraft());
  const [pickTarget, setPickTarget] = useState<'from' | 'to' | null>(null);

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

  const deleteConnectionByPanel = useCallback(() => {
    if (!onUpdateConnections || panelEditingKey === 'new') return;
    void onUpdateConnections(connections.filter((c) => c.id !== panelEditingKey));
    setShowConnectionPanel(false);
    setPickTarget(null);
    setPanelEditingKey('new');
  }, [connections, onUpdateConnections, panelEditingKey]);

  const resetNewConnectionDraft = useCallback(() => {
    setPanelEditingKey('new');
    setConnectionDraft(emptyConnectionDraft());
    setPickTarget(null);
  }, []);

  const openNewFromInspectorAnchor = useCallback(() => {
    if (!anchorNoteIdForNew) return;
    const ends = draftFromProjectDefaults(projectDefaults);
    setPanelEditingKey('new');
    setConnectionDraft({
      fromNoteId: anchorNoteIdForNew,
      toNoteId: '',
      label: '',
      fromArrow: ends.fromArrow,
      toArrow: ends.toArrow,
      weight: DEFAULT_CONNECTION_WEIGHT
    });
    setPickTarget('to');
    setShowConnectionPanel(true);
  }, [anchorNoteIdForNew, projectDefaults]);

  const openEditConnection = useCallback((c: Connection) => {
    setPanelEditingKey(c.id);
    setConnectionDraft(connectionToPanelDraft(c));
    setPickTarget(null);
    setShowConnectionPanel(true);
  }, []);

  const clearPanelDraft = useCallback(() => {
    setPickTarget(null);
    if (panelEditingKey === 'new') {
      setConnectionDraft((d) => ({ ...d, fromNoteId: '', toNoteId: '' }));
    } else {
      setPanelEditingKey('new');
      setConnectionDraft(emptyConnectionDraft());
    }
  }, [panelEditingKey]);

  const clearFromOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, fromNoteId: '' }));
  }, []);

  const clearToOnly = useCallback(() => {
    setPickTarget(null);
    setPanelEditingKey('new');
    setConnectionDraft((d) => ({ ...d, toNoteId: '' }));
  }, []);

  return {
    showConnectionPanel,
    setShowConnectionPanel,
    panelEditingKey,
    setPanelEditingKey,
    connectionDraft,
    setConnectionDraft,
    pickTarget,
    setPickTarget,
    commitConnectionDraft,
    deleteConnectionByPanel,
    resetNewConnectionDraft,
    openNewFromInspectorAnchor,
    openEditConnection,
    clearPanelDraft,
    clearFromOnly,
    clearToOnly
  };
}
