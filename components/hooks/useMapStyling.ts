import { useState, useMemo } from 'react';
import {
  MAP_STYLE_OPTIONS,
  MAP_SATELLITE_URL,
  MAP_SATELLITE_ATTRIBUTION,
  MAP_SATELLITE_MAX_NATIVE_ZOOM,
  MAP_MAX_ZOOM
} from '../../constants';

interface UseMapStylingProps {
  mapStyleId?: string;
  onMapStyleChange?: (styleId: string) => void;
}

export const useMapStyling = ({ mapStyleId, onMapStyleChange }: UseMapStylingProps) => {
  // Map style state - satellite toggle is independent from mapStyleId
  // mapStyleId is for base map style (from settings), localMapStyle is for satellite toggle
  const [localMapStyle, setLocalMapStyle] = useState<'standard' | 'satellite'>('standard');

  // If satellite is active, use satellite; otherwise use mapStyleId or default
  const effectiveMapStyle = useMemo(() => {
    return localMapStyle === 'satellite' ? 'satellite' : (mapStyleId || 'carto-light-nolabels');
  }, [localMapStyle, mapStyleId]);

  // For the toggle button - returns the local style state
  const mapStyle = localMapStyle;

  // Handle local style change (satellite/standard toggle)
  const handleLocalMapStyleChange = (style: 'standard' | 'satellite') => {
    setLocalMapStyle(style);
  };

  // Handle base map style change (from settings)
  const handleMapStyleChange = (styleId: string) => {
    onMapStyleChange?.(styleId);
  };

  // Get tile layer configuration
  const tileLayerConfig = useMemo(() => {
    if (effectiveMapStyle === 'satellite') {
      return {
        url: MAP_SATELLITE_URL,
        attribution: MAP_SATELLITE_ATTRIBUTION,
        // 高缩放下请求原生瓦片易得到 Esri 空占位图；限制原生级别并拉伸较低清晰度瓦片
        maxNativeZoom: MAP_SATELLITE_MAX_NATIVE_ZOOM,
        maxZoom: MAP_MAX_ZOOM
      };
    } else {
      const styleOption = MAP_STYLE_OPTIONS.find(s => s.id === effectiveMapStyle) || MAP_STYLE_OPTIONS[0];
      return {
        url: styleOption.url,
        attribution: styleOption.attribution,
        maxNativeZoom: styleOption.maxNativeZoom ?? MAP_MAX_ZOOM,
        maxZoom: MAP_MAX_ZOOM
      };
    }
  }, [effectiveMapStyle]);

  return {
    mapStyle,
    effectiveMapStyle,
    localMapStyle,
    setLocalMapStyle,
    handleLocalMapStyleChange,
    handleMapStyleChange,
    tileLayerConfig
  };
};
