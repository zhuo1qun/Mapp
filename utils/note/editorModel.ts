/**
 * Note 编辑器 ViewModel：仅映射，不含业务方法。
 * 存储仍为 Note 平铺字段；本层只服务 NoteEditor。
 */

import type { Note, NoteImageRef, Tag } from '../../types';
import { parseNoteContent } from '../../utils';
import { isMediaRefId } from '../persistence/imageAssetStore';
import { resolveNoteEmoji } from './textEmoji';

export type AttachmentKind = 'image' | 'sketch';

export interface AttachmentRef {
  type: AttachmentKind;
  /** img-xxx 或 base64（与 Note.images / sketch 一致） */
  id: string;
}

export type PropertyKey = 'emoji' | 'tags' | 'time';

export type PropertyValue =
  | { key: 'emoji'; value: string }
  | { key: 'tags'; value: Tag[] }
  | { key: 'time'; value: { startYear?: number; endYear?: number } };

export interface EditorModel {
  content: {
    text: string;
    /** 派生展示名；勿与 Frame.title / Connection.label 混称 title */
    displayTitle?: string;
    detail?: string;
  };
  properties: PropertyValue[];
  media: {
    attachments: AttachmentRef[];
  };
  metadata: {
    id?: string;
    createdAt?: number;
  };
}

function attachmentsFromNote(note: Partial<Note>): AttachmentRef[] {
  const list: AttachmentRef[] = [];
  for (const id of note.images || []) {
    list.push({ type: 'image', id });
  }
  if (note.sketch && note.sketch !== '') {
    list.push({ type: 'sketch', id: note.sketch });
  }
  return list;
}

function imagesFromAttachments(attachments: AttachmentRef[]): string[] {
  return attachments.filter((a) => a.type === 'image').map((a) => a.id);
}

function sketchFromAttachments(attachments: AttachmentRef[]): string | undefined {
  const s = attachments.find((a) => a.type === 'sketch');
  return s?.id && s.id !== '' ? s.id : undefined;
}

function imageRefsFromNote(note: Partial<Note>, imageIds: string[]): NoteImageRef[] | undefined {
  if (note.imageRefs && note.imageRefs.length > 0) {
    return note.imageRefs;
  }
  const refs = imageIds.filter(isMediaRefId).map((assetId) => ({ assetId }));
  return refs.length > 0 ? refs : undefined;
}

function getEmoji(properties: PropertyValue[]): string {
  const found = properties.find((p) => p.key === 'emoji');
  return found && found.key === 'emoji' ? found.value : '';
}

function getTags(properties: PropertyValue[]): Tag[] {
  const found = properties.find((p) => p.key === 'tags');
  return found && found.key === 'tags' ? found.value : [];
}

function getTime(properties: PropertyValue[]): { startYear?: number; endYear?: number } {
  const found = properties.find((p) => p.key === 'time');
  return found && found.key === 'time' ? found.value : {};
}

/** Note → EditorModel（只读映射） */
export function toEditorModel(note: Partial<Note>): EditorModel {
  const text = note.text || '';
  const { title: displayTitle, detail } = parseNoteContent(text);

  return {
    content: {
      text,
      displayTitle: displayTitle || undefined,
      detail: detail || undefined
    },
    properties: [
      { key: 'emoji', value: resolveNoteEmoji(text, note.emoji || '') },
      { key: 'tags', value: note.tags || [] },
      {
        key: 'time',
        value: { startYear: note.startYear, endYear: note.endYear }
      }
    ],
    media: {
      attachments: attachmentsFromNote(note)
    },
    metadata: {
      id: note.id,
      createdAt: note.createdAt
    }
  };
}

/**
 * EditorModel → Note patch。
 * `base` 提供透传字段（coords、board、group…）；适配器不解析 Graph。
 */
export function fromEditorModel(model: EditorModel, base: Partial<Note> = {}): Partial<Note> {
  const emoji = getEmoji(model.properties);
  const tags = getTags(model.properties);
  const time = getTime(model.properties);

  return {
    id: model.metadata.id ?? base.id,
    createdAt: model.metadata.createdAt ?? base.createdAt,
    coords: base.coords,
    boardX: base.boardX,
    boardY: base.boardY,
    // Board 暂存状态与坐标同属跨视图位置数据。编辑内容不能让已暂存的
    // Mapping 导入点意外回到 Board 原点。
    isInitialPosition: base.isInitialPosition,
    unplacedOrder: base.unplacedOrder,
    groupId: base.groupId,
    groupName: base.groupName,
    groupIds: base.groupIds,
    groupNames: base.groupNames,
    variant: base.variant,
    imageWidth: base.imageWidth,
    imageHeight: base.imageHeight,
    noteGroupId: base.noteGroupId,
    isFavorite: base.isFavorite,
    text: model.content.text,
    emoji,
    tags,
    startYear: time.startYear,
    endYear: time.endYear,
    images: imagesFromAttachments(model.media.attachments),
    imageRefs: base.imageRefs ?? imageRefsFromNote(base, imagesFromAttachments(model.media.attachments)),
    sketch: base.sketch !== undefined ? base.sketch : sketchFromAttachments(model.media.attachments),
    media: base.media,
    fontSize: base.fontSize ?? 3,
    isBold: base.isBold ?? false,
    color: base.color ?? '#FFFFFF'
  };
}

/** 从当前编辑会话状态组装 EditorModel（供保存路径使用） */
export function buildEditorModel(input: {
  text: string;
  emoji: string;
  tags: Tag[];
  startYear?: number;
  endYear?: number;
  images: string[];
  imageRefs?: NoteImageRef[];
  sketch?: string;
  id?: string;
  createdAt?: number;
}): EditorModel {
  return toEditorModel({
    id: input.id,
    createdAt: input.createdAt,
    text: input.text,
    emoji: input.emoji,
    tags: input.tags,
    startYear: input.startYear,
    endYear: input.endYear,
    images: input.images,
    imageRefs: input.imageRefs,
    sketch: input.sketch
  });
}
