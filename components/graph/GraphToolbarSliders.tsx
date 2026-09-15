import React from 'react';
import { ChromeLabeledSlider } from '../ui/ChromeLabeledSlider';
import { CustomHorizontalSlider } from '../ui/CustomHorizontalSlider';

interface GraphToolbarSlidersProps {
  nodeSize: number;
  setNodeSize: (value: number) => void;
  labelSize: number;
  setLabelSize: (value: number) => void;
  edgeWeight: number;
  setEdgeWeight: (value: number) => void;
  edgeLabelSize: number;
  setEdgeLabelSize: (value: number) => void;
  chainLength: number;
  setChainLength: (value: number) => void;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
}

/** 图谱编辑模式：左上角快捷视觉参数滑块（与 Mapping 顶部滑块同风格） */
export function GraphToolbarSliders({
  nodeSize,
  setNodeSize,
  labelSize,
  setLabelSize,
  edgeWeight,
  setEdgeWeight,
  edgeLabelSize,
  setEdgeLabelSize,
  chainLength,
  setChainLength,
  themeColor,
  chromeSurfaceStyle
}: GraphToolbarSlidersProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5 sm:gap-2 pointer-events-auto"
      onPointerDown={(e) => {
        const target = e.target as Element;
        if (target.closest('.custom-horizontal-slider')) return;
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const target = e.target as Element;
        if (target.closest('.custom-horizontal-slider')) return;
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        const target = e.target as Element;
        if (target.closest('.custom-horizontal-slider')) return;
        e.stopPropagation();
      }}
    >
      <ChromeLabeledSlider label="Min Size" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={nodeSize}
          min={4}
          max={36}
          step={1}
          onChange={setNodeSize}
          themeColor={themeColor}
          width={90}
          formatValue={(v) => `${Math.round(v)}px`}
          mapInstance={null}
          aria-label="Min Size"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="Idle Label" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={labelSize}
          min={4}
          max={16}
          step={1}
          onChange={setLabelSize}
          themeColor={themeColor}
          width={90}
          formatValue={(v) => `${Math.round(v)}px`}
          mapInstance={null}
          aria-label="Idle Label"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="Edge Weight" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={edgeWeight}
          min={0.1}
          max={2}
          step={0.1}
          onChange={setEdgeWeight}
          themeColor={themeColor}
          width={90}
          formatValue={(v) => v.toFixed(1)}
          mapInstance={null}
          aria-label="Edge Weight"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="Idle Edge Label" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={edgeLabelSize}
          min={3}
          max={16}
          step={1}
          onChange={setEdgeLabelSize}
          themeColor={themeColor}
          width={90}
          formatValue={(v) => `${Math.round(v)}px`}
          mapInstance={null}
          aria-label="Idle Edge Label"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="hop distance" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={chainLength}
          min={1}
          max={3}
          step={1}
          onChange={setChainLength}
          themeColor={themeColor}
          width={90}
          formatValue={(v) => String(Math.round(v))}
          mapInstance={null}
          aria-label="hop distance"
        />
      </ChromeLabeledSlider>
    </div>
  );
}
