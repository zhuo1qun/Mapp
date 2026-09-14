/** 标签层级分隔符（规范写法）：`领域 · 可持续产品` → 一级「领域」，二级「可持续产品」 */

export const TAG_HIERARCHY_SEP = ' · ';

/** 兼容 ` · ` / `·` / 两侧空白不一的间隔号 */
const HIERARCHY_SEP_RE = /\s*·\s*/;

export function splitTagHierarchy(label: string): { prefix: string; suffix: string | null } {
  const raw = String(label ?? '').trim();
  if (!raw) return { prefix: '', suffix: null };
  const m = HIERARCHY_SEP_RE.exec(raw);
  if (!m || m.index == null || m.index < 0) return { prefix: raw, suffix: null };
  const prefix = raw.slice(0, m.index).trim();
  const suffix = raw.slice(m.index + m[0].length).trim();
  if (!prefix || !suffix) return { prefix: raw, suffix: null };
  return { prefix, suffix };
}

export function tagHierarchyPrefix(label: string): string {
  const { prefix, suffix } = splitTagHierarchy(label);
  return suffix != null ? prefix : String(label ?? '').trim();
}

/** 层级标签的二级展示文案：`领域 · 可持续产品` → `可持续产品`；无分隔符则返回全文 */
export function tagHierarchySuffix(label: string): string {
  const { suffix } = splitTagHierarchy(label);
  return suffix != null ? suffix : String(label ?? '').trim();
}

export function tagHasHierarchySep(label: string): boolean {
  return splitTagHierarchy(label).suffix != null;
}

/** 重命名时输入框展示/编辑的部分：有「 · 」则只编辑后缀，否则全文 */
export function tagRenameEditablePart(full: string): string {
  const raw = String(full ?? '').trim();
  if (!raw) return raw;
  if (tagHasHierarchySep(raw)) return tagHierarchySuffix(raw);
  return raw;
}

/** 用编辑后的部分拼回完整标签（保留「 · 」前前缀，写入规范分隔符） */
export function composeRenamedTagLabel(oldFull: string, editedPart: string): string {
  const part = String(editedPart ?? '').trim();
  const old = String(oldFull ?? '').trim();
  if (!part) return old;
  if (tagHasHierarchySep(old)) {
    return `${tagHierarchyPrefix(old)}${TAG_HIERARCHY_SEP}${part}`;
  }
  return part;
}

/**
 * 将扁平标签 order 收成一级前缀 → 完整标签列表。
 * 前缀顺序与组内完整标签均保持传入 order 的相对顺序（首次出现为准；字母序仅作新键默认插入）。
 */
export function groupTagsByHierarchyPrefix(
  order: string[],
  untaggedKey: string
): Array<{ prefix: string; tags: string[] }> {
  const map = new Map<string, string[]>();
  for (const raw of order) {
    const tag = String(raw).trim();
    if (!tag) continue;
    const prefix = tag === untaggedKey ? untaggedKey : tagHierarchyPrefix(tag);
    if (!map.has(prefix)) map.set(prefix, []);
    map.get(prefix)!.push(tag);
  }
  return [...map.keys()].map((prefix) => ({ prefix, tags: map.get(prefix)! }));
}

/** 在 order 中把 fromKey 插到 toKey 前/后（图层拖拽共用） */
export function insertLayerOrderRelative(
  order: string[],
  fromKey: string,
  toKey: string,
  place: 'before' | 'after'
): string[] {
  const next = [...order];
  const fromIdx = next.indexOf(fromKey);
  let toIdx = next.indexOf(toKey);
  if (fromIdx < 0 || toIdx < 0 || fromKey === toKey) return order;
  next.splice(fromIdx, 1);
  toIdx = next.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = place === 'after' ? toIdx + 1 : toIdx;
  next.splice(insertAt, 0, fromKey);
  return next;
}

/** 把 fromKeys 整块移到 toKey 前/后（前缀组拖拽） */
export function insertLayerOrderBlockRelative(
  order: string[],
  fromKeys: string[],
  toKey: string,
  place: 'before' | 'after'
): string[] {
  const block = fromKeys.map((k) => String(k).trim()).filter(Boolean);
  if (block.length === 0) return order;
  if (block.includes(toKey)) return order;
  const next = order.filter((k) => !block.includes(k));
  const toIdx = next.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = place === 'after' ? toIdx + 1 : toIdx;
  next.splice(insertAt, 0, ...block);
  return next;
}

/**
 * 按聚类依据同步标签图层一级显隐：保留 selectedPrefix 下全部标签可见，其余一级（含无标签）全部隐藏。
 * 用于设置里切换「聚类依据」为某一级前缀时。
 */
export function tagLayerHiddenForSelectedPrefix(
  order: string[],
  selectedPrefix: string,
  untaggedKey: string
): string[] {
  const prefix = String(selectedPrefix ?? '').trim();
  if (!prefix) return [];
  const hierarchy = groupTagsByHierarchyPrefix(order, untaggedKey);
  const hidden: string[] = [];
  for (const g of hierarchy) {
    if (g.prefix === prefix) continue;
    for (const t of g.tags) {
      const k = String(t).trim();
      if (k) hidden.push(k);
    }
  }
  return hidden;
}
