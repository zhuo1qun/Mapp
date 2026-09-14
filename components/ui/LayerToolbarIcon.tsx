import React from 'react';
import { Frame as FrameIcon, Smile, Tag as TagIcon } from 'lucide-react';
import type { GraphLayerGroupStandard } from '../../utils/graph/graphRuntimeCore';

/** 各视图「图层」工具栏按钮：按当前分组标准显示标签 / Emoji / 簇图标。 */
export function LayerToolbarIcon({
  layerGroupStandard
}: {
  layerGroupStandard: GraphLayerGroupStandard;
}) {
  if (layerGroupStandard === 'frame') {
    return <FrameIcon size={18} className="sm:w-5 sm:h-5" aria-hidden />;
  }
  if (layerGroupStandard === 'emoji') {
    return <Smile size={18} className="sm:w-5 sm:h-5" aria-hidden />;
  }
  return <TagIcon size={18} className="sm:w-5 sm:h-5" aria-hidden />;
}
