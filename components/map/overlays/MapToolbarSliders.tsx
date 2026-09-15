import React from 'react';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { ChromeLabeledSlider } from '../../ui/ChromeLabeledSlider';
import { CustomHorizontalSlider } from '../../ui/CustomHorizontalSlider';

interface MapToolbarSlidersProps {
  pinSize: number;
  setPinSize: (value: number) => void;
  labelSize: number;
  setLabelSize: (value: number) => void;
  clusterThreshold: number;
  setClusterThreshold: (value: number) => void;
  themeColor: string;
  chromeSurfaceStyle: React.CSSProperties;
  mapInstance: LeafletMap | null;
}

export function MapToolbarSliders({
  pinSize,
  setPinSize,
  labelSize,
  setLabelSize,
  clusterThreshold,
  setClusterThreshold,
  themeColor,
  chromeSurfaceStyle,
  mapInstance
}: MapToolbarSlidersProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5 sm:gap-2 pointer-events-auto"
      onPointerDown={(e) => {
        const target = e.target as Element;
        if (target.closest('.custom-horizontal-slider')) return;
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
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
      <ChromeLabeledSlider label="Pin Size" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={pinSize}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={setPinSize}
          themeColor={themeColor}
          width={90}
          formatValue={(val) => `${val.toFixed(1)}x`}
          mapInstance={mapInstance}
          aria-label="Pin Size"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="Label Size" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={labelSize}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={setLabelSize}
          themeColor={themeColor}
          width={90}
          formatValue={(val) => `${val.toFixed(1)}x`}
          mapInstance={mapInstance}
          aria-label="Label Size"
        />
      </ChromeLabeledSlider>

      <ChromeLabeledSlider label="Cluster Threshold" chromeSurfaceStyle={chromeSurfaceStyle}>
        <CustomHorizontalSlider
          value={clusterThreshold}
          min={1}
          max={100}
          step={5}
          onChange={setClusterThreshold}
          themeColor={themeColor}
          width={90}
          formatValue={(val) => `${val}px`}
          mapInstance={mapInstance}
          aria-label="Cluster Threshold"
        />
      </ChromeLabeledSlider>
    </div>
  );
}
