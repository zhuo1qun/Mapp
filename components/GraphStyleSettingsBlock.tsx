import React, { useEffect, useMemo, useState } from 'react';
import type { Project } from '../types';
import {
  DEFAULT_GRAPH_COSE_TIME_X_BIAS,
  DEFAULT_GRAPH_EDGE_ELASTICITY,
  DEFAULT_GRAPH_STYLESHEET_SIZING,
  DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS
} from '../utils/graph/graphData';
import {
  GRAPH_CLUSTER_BASIS_FRAME,
  isFrameClusterBasis,
  normalizeGraphClusterBasis
} from '../utils/graph/graphClusterBasis';
import { GRAPH_UNTAGGED_TAG_GROUP, mergeGraphLayerState } from '../utils/graph/graphRuntimeCore';
import {
  groupTagsByHierarchyPrefix,
  tagLayerHiddenForSelectedPrefix
} from '../utils/layer/tagHierarchy';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';
import { SettingsToggleSwitch } from './ui/SettingsToggleSwitch';

export interface GraphStyleSettingsBlockProps {
  themeColor: string;
  project: Project;
  onPatch: (patch: Partial<Project>) => void;
}

/** 设置面板「Graph Style」：节点/边视觉、时间线聚类分层、力导时间分布 */
export const GraphStyleSettingsBlock: React.FC<GraphStyleSettingsBlockProps> = ({
  themeColor,
  project,
  onPatch
}) => {
  const nodeSize = project.graphNodeSize ?? DEFAULT_GRAPH_STYLESHEET_SIZING.nodeSize;
  const labelPx = project.graphLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.labelFontPx;
  const edgeW = project.graphEdgeWeight ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeWeight;
  const edgeLabelPx = project.graphEdgeLabelFontPx ?? DEFAULT_GRAPH_STYLESHEET_SIZING.edgeLabelFontPx;
  const timeBias = project.graphTimeAxisWeightBias ?? DEFAULT_GRAPH_TIME_AXIS_WEIGHT_BIAS;
  const coseTimeXBias = project.graphCoseTimeXBias ?? DEFAULT_GRAPH_COSE_TIME_X_BIAS;
  const edgeElasticity = project.graphEdgeElasticity ?? DEFAULT_GRAPH_EDGE_ELASTICITY;
  const edgeCurve = project.graphEdgeCurve !== false;

  const tagPrefixes = useMemo(() => {
    const merged = mergeGraphLayerState(project.notes ?? [], project.graphLayers ?? null, 'tag');
    return groupTagsByHierarchyPrefix(merged.order ?? [], GRAPH_UNTAGGED_TAG_GROUP)
      .map((g) => g.prefix)
      .filter((p) => p && p !== GRAPH_UNTAGGED_TAG_GROUP);
  }, [project.notes, project.graphLayers]);

  const mergedTagLayers = useMemo(
    () => mergeGraphLayerState(project.notes ?? [], project.graphLayers ?? null, 'tag'),
    [project.notes, project.graphLayers]
  );

  const clusterBasisRaw = normalizeGraphClusterBasis(project.graphClusterBasis);
  const clusterBasis =
    clusterBasisRaw === GRAPH_CLUSTER_BASIS_FRAME || tagPrefixes.includes(clusterBasisRaw)
      ? clusterBasisRaw
      : GRAPH_CLUSTER_BASIS_FRAME;

  const applyClusterBasis = (raw: string) => {
    const next = normalizeGraphClusterBasis(raw);
    if (isFrameClusterBasis(next)) {
      onPatch({ graphClusterBasis: next });
      return;
    }
    // 选某一级标签前缀：打开该一级眼睛，关闭其他一级
    const hidden = tagLayerHiddenForSelectedPrefix(
      mergedTagLayers.order ?? [],
      next,
      GRAPH_UNTAGGED_TAG_GROUP
    );
    onPatch({
      graphClusterBasis: next,
      graphLayers: {
        order: mergedTagLayers.order ?? [],
        hidden,
        weights: mergedTagLayers.weights,
        tagVisibilityLogic: mergedTagLayers.tagVisibilityLogic
      }
    });
  };

  // 力导相关：拖动只改本地显示，抬起再写回项目（避免拖动过程中反复重算布局）
  const [coseTimeXDraft, setCoseTimeXDraft] = useState(coseTimeXBias);
  const [edgeElasticityDraft, setEdgeElasticityDraft] = useState(edgeElasticity);
  useEffect(() => {
    setCoseTimeXDraft(coseTimeXBias);
  }, [coseTimeXBias]);
  useEffect(() => {
    setEdgeElasticityDraft(edgeElasticity);
  }, [edgeElasticity]);

  return (
    <div className="space-y-3">
      <div className="settings-detail-heading">细节设置</div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
      <SettingsCompactSlider
        label="节点最小尺寸"
        themeColor={themeColor}
        value={nodeSize}
        min={1}
        max={36}
        step={1}
        onChange={(v) => onPatch({ graphNodeSize: Math.round(Math.min(36, Math.max(1, v))) })}
        formatValue={(v) => `${Math.round(v)}px`}
        minCaption="小"
        maxCaption="大"
      />
      <SettingsCompactSlider
        label="节点标签字号"
        themeColor={themeColor}
        value={labelPx}
        min={4}
        max={16}
        step={1}
        onChange={(v) => onPatch({ graphLabelFontPx: Math.round(Math.min(16, Math.max(4, v))) })}
        formatValue={(v) => `${Math.round(v)}px`}
        minCaption="小"
        maxCaption="大"
      />
      <div className="min-w-0">
        <SettingsCompactSlider
          label="连线粗细"
          themeColor={themeColor}
          value={edgeW}
          min={0.1}
          max={2}
          step={0.1}
          onChange={(v) => onPatch({ graphEdgeWeight: Math.min(2, Math.max(0.1, Math.round(v * 10) / 10)) })}
          formatValue={(v) => v.toFixed(1)}
          minCaption="细"
          maxCaption="粗"
        />
        <p className="mt-1 text-[10px] leading-snug text-gray-400">线宽上限（权重决定相对粗细）</p>
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="边标签字号"
          themeColor={themeColor}
          value={edgeLabelPx}
          min={3}
          max={16}
          step={1}
          onChange={(v) => onPatch({ graphEdgeLabelFontPx: Math.round(Math.min(16, Math.max(3, v))) })}
          formatValue={(v) => `${Math.round(v)}px`}
          minCaption="小"
          maxCaption="大"
        />
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="按聚类分层"
          themeColor={themeColor}
          value={timeBias}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onPatch({ graphTimeAxisWeightBias: Math.max(0, Math.min(1, v)) })}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          minCaption="弱"
          maxCaption="强"
        />
        <p className="mt-1 text-[10px] leading-snug text-gray-400">时间线 · Y 轴</p>
      </div>
      <div className="min-w-0">
        <label className="mb-1 block text-xs font-medium text-gray-600">聚类依据</label>
        <select
          className="w-full rounded-lg border border-gray-200/90 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-gray-300"
          style={{ accentColor: themeColor }}
          value={clusterBasis}
          onChange={(e) => applyClusterBasis(e.target.value)}
        >
          <option value={GRAPH_CLUSTER_BASIS_FRAME}>簇图层</option>
          {tagPrefixes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-gray-400">
          时间线分层 · 图例 · 节点色；选一级标签时同步图层眼睛
        </p>
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="按时间分布"
          themeColor={themeColor}
          value={coseTimeXDraft}
          min={0}
          max={1}
          step={0.05}
          onChange={setCoseTimeXDraft}
          onCommit={(v) => onPatch({ graphCoseTimeXBias: Math.max(0, Math.min(1, v)) })}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          minCaption="弱"
          maxCaption="强"
        />
        <p className="mt-1 text-[10px] leading-snug text-gray-400">力导 · X 轴</p>
      </div>
      <div className="min-w-0">
        <SettingsCompactSlider
          label="边弹性"
          themeColor={themeColor}
          value={edgeElasticityDraft}
          min={0.05}
          max={2}
          step={0.05}
          onChange={setEdgeElasticityDraft}
          onCommit={(v) =>
            onPatch({
              graphEdgeElasticity: Math.max(0.05, Math.min(2, Math.round(v * 100) / 100))
            })
          }
          formatValue={(v) => v.toFixed(2)}
          minCaption="硬"
          maxCaption="软"
        />
        <p className="mt-1 text-[10px] leading-snug text-gray-400">力导 · edgeElasticity</p>
      </div>

      <SettingsToggleSwitch
        className="sm:col-span-2"
        label="曲线相连"
        checked={edgeCurve}
        onChange={(next) => onPatch({ graphEdgeCurve: next })}
        themeColor={themeColor}
      />
      </div>
    </div>
  );
};
