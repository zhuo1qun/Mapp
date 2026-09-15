# Supabase Edge Functions（OSM 代理）使用说明

本项目新增了两个 Supabase Edge Function，用来把浏览器直连的 Nominatim / Overpass 收口到你自己的 `/functions/v1/*`，以便做更稳定的请求策略（同域 API、统一 header、fallback、缓存等）。

## 已新增的函数

- `geocode`：代理 Nominatim 搜索
  - 路径：`GET /functions/v1/geocode?q=...&limit=15&mode=region|place`
- `overpass`：代理 Overpass 几何查询（带多节点 fallback）
  - 路径：`GET /functions/v1/overpass?osmId=...&osmType=relation|way|node`

函数源码位置：

- `supabase/functions/geocode/index.ts`
- `supabase/functions/overpass/index.ts`

## 前端如何接入

前端 `utils/map/overpass.ts`：

- **优先**使用 Supabase Edge Functions（要求配置 `VITE_SUPABASE_URL` + 可公开密钥：`VITE_SUPABASE_PUBLISHABLE_KEY`（`sb_publishable_...`）或旧版 `VITE_SUPABASE_ANON_KEY`（`eyJ...`））
- 若未配置或 Edge 失败，则**自动回退**到浏览器直连（Nominatim / 多节点 Overpass）
- **画边界**：先走 Nominatim `lookup?polygon_geojson=1`（经 `geocode` Edge 或直连），失败再 Overpass
- **搜索**：region 使用合法单一 `featuretype=settlement`；可带地图 `viewbox` 偏置

### geocode 查询参数

- 搜索：`GET /functions/v1/geocode?q=...&limit=15&mode=region|place&viewbox=west,north,east,south&bounded=0|1`
- 详情/多边形：`GET /functions/v1/geocode?osmId=...&osmType=relation|way|node&polygon=1`

## 你需要准备什么

### 1) Supabase 项目（已用于云同步的话可复用）

如果你已经在用 Supabase 做云同步（`VITE_SUPABASE_URL` + publishable 或 anon），可以直接复用同一个项目。

### 2) 安装并登录 Supabase CLI

参考 Supabase 官方文档安装 `supabase` CLI 并登录，然后在本仓库根目录执行（示例）：

```bash
supabase init
supabase login
```

> 说明：本仓库之前没有 `supabase/` 项目配置目录（`supabase/config.toml`），你可以用 `supabase init` 生成并按需提交或本地保留。

### 3) 部署函数

```bash
supabase functions deploy geocode
supabase functions deploy overpass
```

### 4)（推荐）配置函数环境变量

在 Supabase Dashboard（项目设置）里为 Edge Functions 配置以下变量（名称与代码一致）：

- `NOMINATIM_ENDPOINT`（可选）：默认 `https://nominatim.openstreetmap.org`
- `NOMINATIM_USER_AGENT`（可选）：建议填一个可识别你应用的 UA
- `NOMINATIM_EMAIL`（可选）：如果没填 `NOMINATIM_USER_AGENT`，会用于拼出更友好的 UA
- `OVERPASS_ENDPOINTS`（可选）：逗号分隔的 Overpass base URL 列表  
  默认值：`https://overpass-api.de,https://overpass.kumi.systems,https://overpass.nchc.org.tw`

## 常见问题

### 为什么前端还需要可公开密钥？

因为调用 Supabase Functions 需要带 `apikey` 头。请使用 **Publishable key**（`sb_publishable_...`）或旧版 **anon JWT**；**不要**使用 secret / service_role。

### Publishable / anon 会不会泄露？

设计上是可放进前端的；真正敏感的是 **secret** / **service_role**（严禁放前端、不要发到聊天里）。

### 使用新版 publishable key 时，本地跑 Functions 要注意什么？

Supabase 文档说明：Edge Functions 的 JWT 校验主要针对旧版 JWT key；使用 publishable key 时，本地可用：

`supabase functions serve --no-verify-jwt`

部署后若遇 401，请在 Dashboard 中查看该函数是否要求 JWT，并按文档配置。

