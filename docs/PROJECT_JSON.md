# 项目文件（全量 JSON）导入 / 导出规则

面向：**用外部编辑器或 AI 直接改项目文件**，再导入 App 使用。

实现入口：

- 导出：`ProjectManager.handleExportFullProject` → `{name}-project.json`
- 导入为新项目：`ProjectManager.handleImportProject`（非 merge）
- 合并进当前项目：同函数 `options.merge === true`，或视图内拖入 JSON（便签合并路径）
- 类型定义：[`types.ts`](../types.ts)

相关但**不是**本文档范围：CSV 数据表、Bibliometrics 迁出格式（见根目录 [`IMPORT.md`](../IMPORT.md)）、图谱/地图独立 HTML 导出。

---

## 1. 文件外形

```json
{
  "version": "1.0",
  "project": { ... }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | 推荐 | 导出写 `"1.0"`；导入**不校验**该字段 |
| `project` | **是** | 项目对象 |
| `project.name` | **是** | 字符串；缺失则整文件拒绝 |

编码：UTF-8。扩展名：`.json`。建议缩进便于 diff / AI 编辑。

导入为**新项目**时：

- 项目 `id`、所有 `notes[].id`、`frames[].id`、`connections[].id` **一律重新生成**
- 名称变为 `` `${原名} (Imported)` ``
- `connections` 的 `fromNoteId` / `toNoteId`、便签的 `groupId` / `groupIds` 会按新旧 id 映射改写
- **合法** `projectKind`（`mapping` | `graph`）会保留；**缺失或非法值**视为未分型，首次打开弹窗询问 Mapping / Graph（见 `ProjectKindPromptDialog`）

合并进**已有项目**时：

- 只合并便签 / 簇 / 边；**不覆盖**当前项目的 `projectKind`
- 便签-only JSON、CSV 同理：只追加内容，不改项目类型

---

## 2. `project` 对象

### 2.1 核心字段

| 字段 | 类型 | AI 编辑建议 |
|------|------|-------------|
| `id` | string | 导入会换新 id；可保留导出值作参考 |
| `name` | string | **必填** |
| `type` | `'map'` | 历史字段，固定写 `"map"` |
| `projectKind` | `'mapping' \| 'graph'` | **推荐显式写出**。`mapping`=地图+看板+表；`graph`=图谱+表。导出仅写出合法值；非法或缺省 → 导入后询问 |
| `createdAt` | number | Unix ms；导入时常改成当前时间 |
| `notes` | `Note[]` | 主内容；可 `[]` |
| `frames` | `Frame[]` | 看板 Frame；可 `[]` |
| `connections` | `Connection[]` | 关联边；可 `[]` |
| `themeColor` | string | 如 `"#FFDD00"` |
| `backgroundOpacity` | number | 看板背景透明度 |
| `standardSizeScale` | number | 看板便签全局缩放，约 `0.5`–`1` |

### 2.2 图谱样式（可选）

| 字段 | 说明 |
|------|------|
| `graphLayers` / `graphFrameLayers` | 标签 / 簇图层面板状态。标签层可用 `tagVisibilityLogic`: `'and'\|'or'`（多标签显隐）。时间线纵轴与簇布局主分区 **按 frame** |
| `graphLayerStandard` | 地图/看板面板切换用；图谱布局不再依赖 |
| `graphDefaultLayoutMode` | `'time' \| 'cose' \| 'frameCluster'`（力传导模式使用 **fcose**） |
| `graphNodeSize` | 节点直径 px，约 1–36 |
| `graphLabelFontPx` | 空闲标签字号 4–16 |
| `graphEdgeWeight` | 线粗 0.1–2 |
| `graphEdgeLabelFontPx` | 边标签字号 3–16 |
| `graphEdgeCurve` | 连线曲线；`true`/缺省 → unbundled-bezier，`false` → straight |
| `graphTimeAxisWeightBias` 等 | 见 `types.ts` |

导出当前会带上部分图谱字段；未列出的字段若手写进 JSON，导入时只要落在 `project` 上且后续 `saveProject` 能存，一般会保留（以当前导入代码拷贝的字段为准）。

---

## 3. `Note`（便签）

### 3.1 必填 / 强建议

| 字段 | 类型 | AI 编辑建议 |
|------|------|-------------|
| `id` | string | 导入会换新 id；可保留导出值作参考 |
| `text` | string | **必填**语义；首行=标题，其后=详情 |
| `coords` | `{ lat, lng }` | 地图点；**`{0,0}` = 无地理点** |
| `boardX`, `boardY` | number | 看板坐标；缺则合并导入自动排槽 |
| `variant` | `'standard' \| 'image'` | |
| `images` | `string[]` | 全量导出多为 Base64；结构编辑可清空 |
| `tags` | `{ id, label, color }[]` | **图谱分层键**：用**首个**标签的 `label`（见 §3.5） |
| `emoji` | string | 可 `""` |
| `fontSize` | 1–5 | 缺省常按 3 |
| `createdAt` | number | Unix ms |
| `weight` | number | 图谱节点视觉权重，建议 `0.1`–`10`，缺省为 `1`；与连线权重独立 |

### 3.2 常用可选

`color`, `isFavorite`, `isBold`, `startYear`, `endYear`, `sketch`, `imageWidth`, `imageHeight`, `layoutScale`, `groupId` / `groupIds`（Frame id）, `groupName` / `groupNames`, `noteGroupId`, `layerItemHidden`, `layerStackOrder`

### 3.3 文本约定（给 AI 改内容）

```text
标题写在第一行
这里开始是详情 Markdown

- 列表
- **加粗**

[链接](https://example.com)
```

不要把标题和详情拆成两个 JSON 字段；只改 `text`。

### 3.4 图片

- **跨设备分享**：用 App「Export Full Project」导出，图片会以内嵌 Base64 进 `images[]` / `sketch`。
- **纯结构 / 文案编辑**：可删掉或置空 `images`，避免巨型 JSON；再导入后无图。
- 手写 `img-xxx` 而没有对应本地 IndexedDB 条目 → 导入后图会丢。

### 3.5 图谱自动分层（`tags`，不要改 `graphLayers.weights`）

图谱标签层（`graphLayers`）用途：

1. 读每个便签的 **`tags[0].label`** 作为层名（无标签 →「无标签」）
2. 网站内 [`LayerRegistry`](../utils/layer/layerRegistry.ts) 为已知层名提供默认 **顺序** 与 **半径权重**（越大越靠近圆心 / 簇心）
3. 项目里的 `graphLayers` 仅作用户面板覆盖；**AI / 外部编辑不要手写 `graphLayers.weights`**
4. **簇布局（`frameCluster`）定位**：Frame 决定主簇区域；簇内由 Tag 排布——
   - **角向**：` · ` 前缀相同的标签落在相邻扇区（同领域聚在一起）
   - **径向**：该标签的 `weights` 越大越靠近该簇中心
   - 另控制节点显隐（与簇层 AND）

**推荐写法（分层）：**

```json
"tags": [{ "id": "t1", "label": "总体战略", "color": "#3B82F6" }]
```

已知注册层（可扩展，改网站常量即可，**不必改项目 JSON Schema**）：国际框架、总体战略、行动计划、治理机制、设计要求、产品生命周期。

未注册的新层名：只要写在 `tags[0].label`，仍会自动成层（默认权重 0.5）。若要固定默认排序/权重，在 `LayerRegistry` 加一行。

**面板层级（` · `）：** 标签文案可用全角间隔号分层，如 `领域 · 可持续产品`。Tag 窗口一级只显示 ` · ` **之前**的前缀（无分隔符则整段为一级）；展开后见完整标签；再展开见节点。簇布局里同前缀也会在角向上相邻。

---

## 4. `Connection`（关联 / 边）

| 字段 | 说明 |
|------|------|
| `id` | 唯一 |
| `fromNoteId`, `toNoteId` | 必须指向**同一文件内**某 `notes[].id` |
| `fromSide`, `toSide` | `'top' \| 'right' \| 'bottom' \| 'left'`（看板锚点；图谱也会用方向语义） |
| `label` | 关系标签字符串 |
| `fromArrow`, `toArrow` | `'arrow' \| 'none'`（推荐） |
| `arrow` | 旧字段 `'none' \| 'forward' \| 'reverse'`，仍可出现 |
| `labelAnchorNoteId` | 可选，须等于 from 或 to |

打开项目时会跑 `normalizeProjectConnections`：删除端点不存在的悬空边、修正箭头等。

---

## 5. `Frame`（看板簇）

| 字段 | 说明 |
|------|------|
| `id`, `title` | |
| `x`, `y`, `width`, `height` | 看板几何 |
| `color` | 背景色 |
| `description` | 可选 |

便签通过 **单个** `groupId` / `groupIds[0]` 挂到 Frame（多簇旧数据加载时取第一个）。`color` 用于看板簇底色与图谱节点着色。

---

## 6. 导入行为对照

| 操作 | 行为 | `projectKind` |
|------|------|----------------|
| 主页 / 侧栏「导入项目」选 JSON | 新建项目 + 全量 id 重映射 + 名称加 `(Imported)` | **保留**合法值；缺失/非法 → 首次打开询问 |
| 已打开项目时拖入 / 合并导入 | 便签 / 簇 / 边合并进当前项目；新实体换 id；**同文案 + 近坐标**视为重复便签会跳过 | **不覆盖**当前项目类型 |
| 地图 / 看板 / 表 / 图谱拖入仅含 `project.notes` 的 JSON | 只合并便签（`utils/import/projectDataImport.ts`），不整项目替换 | **不改** |
| CSV | 另一套表头规则，不是本文档 | **不改** |
| 云同步 / 内置示例 `projectFromExport` | 整项目序列化或按导出 JSON 建新项目 | 与全量导入一致：保留合法值 |

合并重复判定（全量 merge）：`text` 相同且 lat/lng 差 &lt; `0.0001`。

---

## 7. AI 改文件推荐流程

1. 在 App 中 **Export Full Project (JSON)**（需要保留图片时）。
2. 编辑 `project.name`、`projectKind`、`notes[].text` / **`notes[].tags[0].label`（分层）** / `startYear`、`connections` 等；**不要**手写 `graphLayers.weights`。
3. 保持 JSON 合法；引用 id 在文件内自洽。
4. 导入为新项目，或在目标项目中合并。
5. 若未写 `projectKind`（或值非法），打开时选 Mapping 或 Graph；合并进已有项目时不会改当前类型。

### 最小可导入骨架

```json
{
  "version": "1.0",
  "project": {
    "name": "示例",
    "type": "map",
    "projectKind": "graph",
    "createdAt": 0,
    "themeColor": "#FFDD00",
    "notes": [
      {
        "id": "n1",
        "createdAt": 0,
        "coords": { "lat": 0, "lng": 0 },
        "boardX": 100,
        "boardY": 100,
        "emoji": "",
        "text": "节点甲\n说明文字",
        "fontSize": 3,
        "images": [],
        "tags": [{ "id": "t1", "label": "总体战略", "color": "#3B82F6" }],
        "variant": "standard"
      },
      {
        "id": "n2",
        "createdAt": 0,
        "coords": { "lat": 0, "lng": 0 },
        "boardX": 400,
        "boardY": 100,
        "emoji": "",
        "text": "节点乙",
        "fontSize": 3,
        "images": [],
        "tags": [{ "id": "t2", "label": "行动计划", "color": "#10B981" }],
        "variant": "standard"
      }
    ],
    "frames": [],
    "connections": [
      {
        "id": "c1",
        "fromNoteId": "n1",
        "toNoteId": "n2",
        "fromSide": "right",
        "toSide": "left",
        "label": "相关",
        "fromArrow": "none",
        "toArrow": "arrow"
      }
    ]
  }
}
```

---

## 8. 常见坑

1. 只有 `notes` 数组、没有外层 `{ "project": { "name": … } }` → 全量导入失败（合并便签路径另议）。
2. `connections` 引用的 note id 不在 `notes` 里 → 边被规范化删掉或导入后失效。
3. 地图要用真实坐标；占位请用 `0,0`。
4. 改文案只动 `text` 首行 / 后续行，勿臆造 `title` 字段。
5. 巨型 Base64 会让 AI 上下文爆炸；结构编辑可先清空 `images`。
6. 分层写 `tags[0].label`，不要靠改 `graphLayers.weights`；新层名直接用新标签文案即可。

---

## 修订记录

- 2026-07-31 — 初版：全量项目 JSON 导入导出，供 AI / 外部编辑
- 2026-07-31 — 分层改为 `note.tags` + `LayerRegistry`；勿手写 `graphLayers.weights`
- 2026-07-31 — 明确 `projectKind`：导出清洗；新建导入保留合法值；合并/便签-only/CSV 不覆盖；非法或缺省 → 首次打开询问
- 2026-07-31 — 簇布局：Tag 参与簇内定位（前缀扇区 + 权重径向）；权重越大越靠近簇心
