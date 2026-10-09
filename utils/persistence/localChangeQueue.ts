import { get, set } from 'idb-keyval';

/**
 * 将本地编辑记录为可重放的实体变更，而不是把完整 Project 当成同步单元。
 * 它暂时只在 IndexedDB 中积累；云端接入后由同步 worker 读取并确认这些记录。
 */
export type LocalChangeEntity = 'project' | 'note' | 'frame' | 'connection';
export type LocalChangeOperation = 'upsert' | 'delete';

export interface LocalChange {
  id: string;
  projectId: string;
  entity: LocalChangeEntity;
  entityId: string;
  operation: LocalChangeOperation;
  revision: number;
  occurredAt: number;
  /** 删除实体在确认前保留 tombstone 时间，供跨设备同步时阻止旧版本复活。 */
  deletedAt?: number;
  /** delete 是 tombstone，故没有 payload；媒体只保存 asset id，不嵌入 Blob。 */
  payload?: Record<string, unknown>;
}

const OUTBOX_KEY = 'mapp-local-change-outbox-v1';

function createChangeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `change-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadLocalChangeOutbox(): Promise<LocalChange[]> {
  return (await get<LocalChange[]>(OUTBOX_KEY)) || [];
}

/** 同一实体在未同步前只保留最后一次状态；删除始终保留 tombstone，防止旧版本在远端复活。 */
export async function enqueueLocalChanges(changes: Omit<LocalChange, 'id'>[]): Promise<void> {
  if (!changes.length) return;

  const outbox = await loadLocalChangeOutbox();
  for (const change of changes) {
    // 项目删除会由远端级联处理其内容，因此清掉尚未发送的子实体更新；但项目 tombstone 本身必须留下。
    if (change.entity === 'project' && change.operation === 'delete') {
      for (let i = outbox.length - 1; i >= 0; i--) {
        if (outbox[i].projectId === change.projectId && outbox[i].entity !== 'project') {
          outbox.splice(i, 1);
        }
      }
    }

    const index = outbox.findIndex(
      (queued) =>
        queued.projectId === change.projectId &&
        queued.entity === change.entity &&
        queued.entityId === change.entityId
    );

    const next: LocalChange = { ...change, id: createChangeId() };
    if (index >= 0) outbox[index] = next;
    else outbox.push(next);
  }
  await set(OUTBOX_KEY, outbox);
}

/** 云端确认后移除对应变更；目前留给后续同步 worker 调用。 */
export async function acknowledgeLocalChanges(changeIds: string[]): Promise<void> {
  if (!changeIds.length) return;
  const confirmed = new Set(changeIds);
  const outbox = await loadLocalChangeOutbox();
  await set(OUTBOX_KEY, outbox.filter((change) => !confirmed.has(change.id)));
}
