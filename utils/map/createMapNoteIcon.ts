import type { Note } from '../../types';
import {
  isDisplayableImageSrc,
  noteRendersAsBoardSticker
} from '../persistence/mediaDisplay';
import { getThemeChromeForegroundHex } from '../theme/themeChrome';

export type MapNoteIconMotion = 'enter' | 'settle' | 'exit';

export type MapNoteIconModel = {
  html: string;
  /** Leaflet iconSize */
  size: [number, number];
  /** Leaflet iconAnchor — 底边中心 */
  anchor: [number, number];
};

type MapNoteIconSource = Pick<
  Note,
  'text' | 'images' | 'imageRefs' | 'media' | 'sketch' | 'emoji' | 'isFavorite'
>;

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mapPinScale(pinSize: number | undefined, isFavorite: boolean): number {
  const mapped = pinSize
    ? ((pinSize - 0.5) * (1.2 - 0.2)) / (2.0 - 0.5) + 0.2
    : 1;
  return (isFavorite ? 2 : 1) * mapped;
}

/** 仅媒体贴纸边长：与泪滴钉同样跟 pinSize 线性缩放。 */
function photoThumbEdge(scale: number): number {
  return Math.max(24, Math.round(96 * scale));
}

export function firstDisplayableMapPhotoSrc(
  note: Pick<Note, 'images' | 'sketch'>
): string | null {
  const img = note.images?.[0];
  if (isDisplayableImageSrc(img)) return img!;
  if (isDisplayableImageSrc(note.sketch)) return note.sketch!;
  return null;
}

/** 聚合角标：主题色实心圆，数字色走 theme chrome 前景规则。
 * @param hang 为 true 时探出右上角（贴纸钉）；false 时贴齐容器右上，挡住泪滴圆形区。 */
function clusterBadgeHtml(
  clusterCount: number | undefined,
  themeColor: string,
  scale: number,
  hang: boolean
): string {
  if (!clusterCount || clusterCount <= 1) return '';
  const size = 40 * scale;
  const offset = hang ? size * 0.24 : 0;
  const fg = getThemeChromeForegroundHex(themeColor);
  return `<div style="
      position:absolute;top:-${offset}px;right:-${offset}px;
      width:${size}px;height:${size}px;
      background:${themeColor};border-radius:50%;
      display:flex;align-items:center;justify-content:center;
    "><span style="color:${fg};font-size:${20 * scale}px;font-weight:400;line-height:1;">${clusterCount}</span></div>`;
}

function motionWrap(
  inner: string,
  width: number,
  height: number,
  motion: MapNoteIconMotion | undefined
): string {
  const cls = `mapp-map-pin-motion${motion ? ` mapp-map-pin-motion--${motion}` : ''}`;
  return `<div class="${cls}" style="position:relative;width:${width}px;height:${height}px;transform-origin:${width / 2}px ${height}px;overflow:visible;">${inner}</div>`;
}

/**
 * 地图图钉 HTML：仅媒体（与 Board sticker 同判定）→ 圆角矩形缩略图；
 * 其余 → 主题色泪滴钉（可内嵌图 / emoji）。
 */
export function buildMapNoteIconModel(
  note: MapNoteIconSource,
  opts: {
    themeColor: string;
    clusterCount?: number;
    pinSize?: number;
    motion?: MapNoteIconMotion;
  }
): MapNoteIconModel {
  const { themeColor, clusterCount, pinSize, motion } = opts;
  const scale = mapPinScale(pinSize, note.isFavorite === true);
  const photoSrc = firstDisplayableMapPhotoSrc(note);
  const asPhotoSticker = noteRendersAsBoardSticker(note);
  const badge = clusterBadgeHtml(clusterCount, themeColor, scale, asPhotoSticker);

  if (asPhotoSticker) {
    const edge = photoThumbEdge(scale);
    const radius = Math.max(8, Math.round(edge * 0.16));
    const media = photoSrc
      ? `<img src="${escapeHtmlAttr(photoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;background:${themeColor};opacity:0.35;"></div>`;
    // 圆角裁切只包图片；角标探出右上角。
    const inner = `<div style="
          width:${edge}px;height:${edge}px;border-radius:${radius}px;overflow:hidden;
          background:#f3f4f6;box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);
          border:2px solid ${themeColor};
        ">${media}</div>${badge}`;
    return {
      html: motionWrap(inner, edge, edge, motion),
      size: [edge, edge],
      anchor: [edge / 2, edge]
    };
  }

  const size = 40 * scale;
  let content = '';
  if (photoSrc) {
    content = `<div style="position:absolute;inset:-25%;overflow:hidden;transform:rotate(45deg);transform-origin:center;">
      <img src="${escapeHtmlAttr(photoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;transform:scale(1.5);transform-origin:center;" />
    </div>`;
  } else if (note.emoji) {
    content = `<span style="transform:rotate(45deg);font-size:${20 * scale}px;line-height:1;z-index:1;position:relative;">${escapeHtmlAttr(note.emoji)}</span>`;
  }

  // 角标贴齐右上（不 hang）；泪滴本体 overflow:hidden 只裁切内嵌图。
  const teardrop = `<div style="
      background-color:${themeColor};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);
      border:3px solid ${themeColor};overflow:hidden;
    ">${content}</div>${badge}`;

  return {
    html: motionWrap(teardrop, size, size, motion),
    size: [size, size],
    anchor: [size / 2, size]
  };
}
