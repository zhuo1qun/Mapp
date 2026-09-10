
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Tag {
  id: string;
  label: string;
  color: string;
}

/** 原始图片资产元数据；像素在 IndexedDB Blob（`mapp-image-{id}`） */
export interface ImageAsset {
  id: string;
  mime: string;
  width: number;
  height: number;
  size: number;
  createdAt: number;
  filename?: string;
  /** 内容指纹，用于去重 */
  contentHash?: string;
}

/**
 * 归一化坐标点（相对原图像素宽高，范围 0～1）。
 * 换 display 分辨率后套索/遮罩仍有效。
 */
export type NormPoint = [number, number];

/**
 * 贴纸/抠图遮罩：优先非破坏保存；导出时再 rasterize。
 * - polygon：套索等矢量路径
 * - bitmap：AI / 笔刷产生的 alpha
 * - ai：带模型信息的 bitmap
 */
export type ImageMask =
  | {
      type: 'polygon';
      /** 闭合路径，归一化 0～1 */
      points: NormPoint[];
    }
  | {
      type: 'bitmap';
      maskBlobKey: string;
    }
  | {
      type: 'ai';
      maskBlobKey: string;
      model?: string;
    };

/** 非破坏编辑操作（按序叠加） */
export type ImageOperation =
  | {
      type: 'lasso';
      points: NormPoint[];
    }
  | {
      type: 'mask';
      mask: ImageMask;
    }
  | {
      type: 'outline';
      width: number;
      color?: string;
    }
  | {
      type: 'crop';
      /** 归一化矩形：x,y,w,h ∈ 0～1 */
      rect: [number, number, number, number];
    };

/** 编辑描述：操作序列，不直接存像素结果 */
export interface ImageEdit {
  id: string;
  assetId: string;
  operations: ImageOperation[];
  createdAt: number;
  updatedAt: number;
}

export type ImageVariantKind = 'thumbnail' | 'display' | 'crop' | 'sticker';

/**
 * 派生结果：可由 Edit 描述虚渲染，或缓存 raster Blob。
 * sticker 默认可只有 editId + mask，不必立即有 blobKey。
 */
export interface ImageVariant {
  id: string;
  assetId: string;
  kind: ImageVariantKind;
  editId?: string;
  /** 已 rasterize 时的 Blob 键（`mapp-variant-blob-{id}`） */
  blobKey?: string;
  width?: number;
  height?: number;
  /**
   * sticker raster 布局：tight = 已按遮罩包围盒裁切（展示边界用此宽高）。
   * 缺省或 full 时解析会重渲为 tight。
   */
  layout?: 'tight' | 'full';
  createdAt: number;
}

/**
 * 画布上的图片实例（位置/变换）；同一 Variant 可有多份 Placement。
 * 看板图片便签可逐步迁到此结构。
 */
export interface CanvasImagePlacement {
  id: string;
  variantId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  zIndex: number;
}

/** 便签对图片的引用：资产 + 可选派生 Variant（贴纸/裁剪等） */
export interface NoteImageRef {
  assetId: string;
  variantId?: string;
  /**
   * 是否使用 variant 展示。false 时保留裁剪数据但显示原图；缺省视为 true。
   * 关开关不删数据；重画才会生成新 variant 替换。
   */
  variantEnabled?: boolean;
}

/** 媒体栏统一附件（图片 / 涂鸦混排，可拖拽排序） */
export type NoteMediaKind = 'image' | 'sketch';

export interface NoteMediaItem {
  /** 稳定拖拽 key（`mid-…`） */
  id: string;
  kind: NoteMediaKind;
  /** 资产 id（`img-…`）；涂鸦也走资产存储 */
  assetId: string;
  variantId?: string;
  /** false 时保留裁剪数据但显示原图；缺省视为 true */
  variantEnabled?: boolean;
}

export interface Note {
  id: string;
  createdAt: number;
  coords: Coordinates;
  emoji: string;
  text: string;
  fontSize: number; // 1 to 5 scale
  isBold?: boolean;
  isFavorite?: boolean; // 收藏标记
  /**
   * 图谱节点自身的视觉权重；未设置时按 1。
   * 建议范围 0.1～10，越大节点越醒目；与 Connection.weight 相互独立。
   */
  weight?: number;
  color?: string; // Background color
  /**
   * 图片资产 ID 列表（`img-…`）。勿再写入 data URL / Blob。
   * 与 `imageRefs[].assetId` 同步；新代码优先读 `imageRefs`。
   */
  images: string[];
  /**
   * 便签对图片资产的引用（可指向派生 Variant；首期可不设 variantId）。
   * 持久化以本字段为准时仍写回 `images` 以兼容旧路径。
   */
  imageRefs?: NoteImageRef[];
  /**
   * 媒体栏权威顺序（图片+涂鸦混排，可多个涂鸦）。有值时优先；写盘时同步回 images/imageRefs/sketch。
   */
  media?: NoteMediaItem[];
  /** legacy：media 中第一个涂鸦的资产 ID（`img-…`）；多涂鸦以 media[] 为准 */
  sketch?: string;
  tags: Tag[];
  
  // 时间段落（精确到年）
  startYear?: number;
  endYear?: number;
  
  // Board View Position
  boardX: number;
  boardY: number;
  isInitialPosition?: boolean; // 是否处于初始自动分配位置（用于重排）
  
  // Type of note（仅 standard 文本便签与 image 图片便签；旧数据中的 compact 在加载时迁移为 standard）
  variant: 'standard' | 'image';
  imageWidth?: number;
  imageHeight?: number;
  
  // Group/Frame membership（一便签只属于一个 Frame；旧多簇取第一个）
  groupId?: string;
  groupName?: string;
  /** 至多一项；与 groupId 同步 */
  groupIds?: string[];
  groupNames?: string[];
  
  // Layout scale for board view
  layoutScale?: number; // Scale factor for layout (default 1)

  // Lightweight note group (not a visual Frame; used for multi-select auto-group)
  noteGroupId?: string;

  /** 全视图共用：在对应分组未隐藏时仍可单独隐藏该节点（与 graphLayers 组隐为 AND） */
  layerItemHidden?: boolean;
  /** 同组内叠放顺序，越大越靠近上层；未设时回退 createdAt */
  layerStackOrder?: number;
}

export interface Connection {
  id: string;
  fromNoteId: string;
  toNoteId: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toSide: 'top' | 'right' | 'bottom' | 'left';
  arrow?: 'none' | 'forward' | 'reverse'; // 箭头方向：无、正向、反向
  /**
   * 连线标签：挂在整条 Connection 上（与 `id`、两端便签同属一条记录），不是独立于端点的另一条数据。
   * 规范化交换端点时仍保留在同一 `id` 下；若要显式标明标签贴近哪一端可填 `labelAnchorNoteId`。
   */
  label?: string;
  /** 若设置则须等于 `fromNoteId` 或 `toNoteId`；供展示定位与打开项目时的校验 */
  labelAnchorNoteId?: string;
  fromArrow?: 'arrow' | 'none'; // 起点端样式
  toArrow?: 'arrow' | 'none';   // 终点端样式
  /**
   * 连线权重（力导边弹性等）；未设置的旧数据按 1 处理。
   * 建议范围 0.1～10，越大表示关联越强。
   */
  weight?: number;
}

export interface Frame {
  id: string;
  title: string;
  description?: string; // 图层描述
  x: number;
  y: number;
  width: number;
  height: number;
  color: string; // 背景色
}

/** 图谱「标签分组」图层的顺序与显隐（tagGroup 与节点首标签一致；空串表示无标签组） */
export type TagVisibilityLogic = 'and' | 'or';

export interface GraphLayerState {
  order: string[];
  hidden: string[];
  /** 各分组环形/时间轴纵轴权重，范围 0.1～1，越大越靠近圆心、时间线纵轴越靠上 */
  weights?: Record<string, number>;
  /**
   * 多标签便签的显隐逻辑（仅标签层）：
   * - `and`：任一标签隐藏 → 隐藏节点
   * - `or`：任一标签显示 → 显示节点（默认）
   */
  tagVisibilityLogic?: TagVisibilityLogic;
}

export interface Project {
  id: string;
  name: string;
  /** 历史字段：图片背景模式已移除，固定为 map；业务类型见 projectKind */
  type: 'map';
  /**
   * 项目工作流类型：mapping=地图+看板；graph=关系图谱+看板。
   * 缺失时视为旧项目，打开时询问归类。
   */
  projectKind?: ProjectKind;
  backgroundImage?: string; // Deprecated, no longer used
  createdAt: number;
  notes: Note[];
  connections?: Connection[]; // Connections between notes in board view
  frames?: Frame[]; // Frames for grouping notes in board view
  standardSizeScale?: number; // Global scale factor for standard note sizes (default 1)
  version?: number; // Version number for incremental sync
  storageVersion?: number; // Storage format version
  backgroundOpacity?: number; // Background opacity for board view
  themeColor?: string; // Theme color for project
  /** 图谱视图：标签组排序与隐藏 / 权重（标签图层面板） */
  graphLayers?: GraphLayerState;
  /**
   * 历史字段：地图/看板图层面板仍可切换 tag|frame。
   * 图谱时间线聚类依据见 graphClusterBasis。
   */
  graphLayerStandard?: 'tag' | 'frame';
  /**
   * 图谱时间线「按聚类分层」的依据：
   * - `'frame'`（默认）：簇图层
   * - 其它字符串：标签图层中的一级标签前缀（节点取 tags[0]）
   */
  graphClusterBasis?: 'frame' | string;
  /** 图谱视图：簇组排序与显隐 / 半径权重 */
  graphFrameLayers?: GraphLayerState;
  /** 图谱节点圆直径下限（px，1～36）；实际大小按关联节点数放大，上限 36 */
  graphNodeSize?: number;
  /** 图谱节点下方标题字号（px，4～16） */
  graphLabelFontPx?: number;
  /** 图谱连线粗细上限（设置项 0.1～2，映射为线宽 px 上限）；实际粗细由 Connection.weight 决定并夹在此上限内 */
  graphEdgeWeight?: number;
  /** 图谱边标签字号（px，3～16）；未设置时由样式默认值决定，不再与连线粗细联动 */
  graphEdgeLabelFontPx?: number;
  /**
   * 时间线布局：纵轴（Y）按聚类依据分层的聚拢强度，0～1。
   * 0 为均匀随机；越大则同层越靠齐、纵向散布越小。
   * 未设置时默认 0.8（80%）。
   */
  graphTimeAxisWeightBias?: number;
  /**
   * 力导布局：横轴（X）按 timeSort 时间分布的强度，0～1。
   * 0 保留纯力导 X；1 完全按时间目标排开（早左晚右）。
   * 未设置时默认 0.8（80%）。
   */
  graphCoseTimeXBias?: number;
  /**
   * 力导布局全局边弹性（fCoSE `edgeElasticity` 基数）。
   * 越大边越「软」；单条连线再按 `Connection.weight` 缩放（权重越大越硬）。
   * 未设置时默认 0.45。
   */
  graphEdgeElasticity?: number;
  /**
   * 历史：圆环布局力导向微调。圆环布局已移除，字段仅兼容旧项目。
   */
  graphCircleRefineOrderWithForce?: boolean;
  /**
   * 历史：力传导布局拖动时实时重算。功能已移除，字段仅兼容旧项目。
   */
  graphCoseDragRealtime?: boolean;
  /**
   * 图谱连线是否弯曲。
   * 开启时用 Cytoscape `unbundled-bezier`（bundled `bezier` 单边会画成直线）；
   * 关闭时为 `straight`。未设置时视为开启。
   */
  graphEdgeCurve?: boolean;
  /**
   * 无会话内布局缓存时，打开图谱使用的默认布局（时间线 / 力导）。
   */
  graphDefaultLayoutMode?: 'time' | 'cose';
  /** 关联面板「新建」时起点侧默认是否带箭头 */
  graphNewConnectionFromArrow?: 'arrow' | 'none';
  /** 关联面板「新建」时终点侧默认是否带箭头 */
  graphNewConnectionToArrow?: 'arrow' | 'none';
}

/** 项目工作流：mapping=地图+看板；graph=关系图谱+看板 */
export type ProjectKind = 'mapping' | 'graph';

export type ViewMode = 'map' | 'board' | 'table' | 'graph';
