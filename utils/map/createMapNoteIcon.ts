import type { Note } from '../../types';
import {
  noteOrderedDisplayMediaSources,
  noteHasActiveFirstMediaCrop,
  noteRendersAsMapMediaPin
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
> & { hasActiveMediaCrop?: boolean };

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

/** 媒体贴纸边长：与泪滴图钉分开控制，允许承担地图上的主要视觉内容。 */
function mapImageScale(imageSize: number | undefined, isFavorite: boolean): number {
  const size = imageSize ?? 1;
  return (isFavorite ? 2 : 1) * size;
}

function photoThumbEdge(scale: number): number {
  return Math.max(24, Math.round(96 * scale));
}

export function firstDisplayableMapPhotoSrc(
  note: Pick<Note, 'images' | 'media' | 'sketch'>
): string | null {
  return noteOrderedDisplayMediaSources(note)[0] || null;
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
 * 地图图钉 HTML：有媒体 → 保留图片 Alpha 轮廓；其余 → 主题色泪滴钉（可内嵌 emoji）。
 */
export function buildMapNoteIconModel(
  note: MapNoteIconSource,
  opts: {
    themeColor: string;
    clusterCount?: number;
    pinSize?: number;
    imageSize?: number;
    motion?: MapNoteIconMotion;
  }
): MapNoteIconModel {
  const { themeColor, clusterCount, pinSize, imageSize, motion } = opts;
  const pinScale = mapPinScale(pinSize, note.isFavorite === true);
  const photoSrc = firstDisplayableMapPhotoSrc(note);
  const asPhotoSticker = noteRendersAsMapMediaPin(note);
  const usesImageOutline = note.hasActiveMediaCrop ?? noteHasActiveFirstMediaCrop(note);

  if (asPhotoSticker) {
    const imageScale = mapImageScale(imageSize, note.isFavorite === true);
    const edge = photoThumbEdge(imageScale);
    const radius = Math.max(8, Math.round(edge * 0.16));
    const image = photoSrc
      ? `<img src="${escapeHtmlAttr(photoSrc)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:${usesImageOutline ? 'contain' : 'cover'};display:block;" />`
      : `<div style="width:${Math.max(10, Math.round(edge * 0.18))}px;height:${Math.max(10, Math.round(edge * 0.18))}px;background:${themeColor};border-radius:50%;opacity:0.4;"></div>`;
    const media = usesImageOutline
      ? `<div style="
          width:${edge}px;height:${edge}px;display:flex;align-items:center;justify-content:center;
          overflow:visible;background:transparent;
          filter:
            drop-shadow(1.25px 0 0 ${themeColor}) drop-shadow(-1.25px 0 0 ${themeColor})
            drop-shadow(0 1.25px 0 ${themeColor}) drop-shadow(0 -1.25px 0 ${themeColor})
            drop-shadow(0 8px 7px rgba(15,23,42,0.24)) drop-shadow(0 1px 1px rgba(15,23,42,0.12));
        ">${image}</div>`
      : `<div style="
          width:${edge}px;height:${edge}px;border-radius:${radius}px;overflow:hidden;
          background:#f3f4f6;border:2px solid ${themeColor};box-sizing:border-box;
          box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);
        ">${image}</div>`;
    const inner = `${media}${clusterBadgeHtml(clusterCount, themeColor, imageScale, true)}`;
    return {
      html: motionWrap(inner, edge, edge, motion),
      size: [edge, edge],
      anchor: [edge / 2, edge]
    };
  }

  const size = 40 * pinScale;
  let content = '';
  if (photoSrc) {
    content = `<div style="position:absolute;inset:-25%;overflow:hidden;transform:rotate(45deg);transform-origin:center;">
      <img src="${escapeHtmlAttr(photoSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;transform:scale(1.5);transform-origin:center;" />
    </div>`;
  } else if (note.emoji) {
    content = `<span style="transform:rotate(45deg);font-size:${20 * pinScale}px;line-height:1;z-index:1;position:relative;">${escapeHtmlAttr(note.emoji)}</span>`;
  }

  // 角标贴齐右上（不 hang）；泪滴本体 overflow:hidden 只裁切内嵌图。
  const teardrop = `<div style="
      background-color:${themeColor};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 6px -1px rgba(0,0,0,0.2);
      border:3px solid ${themeColor};overflow:hidden;
    ">${content}</div>${clusterBadgeHtml(clusterCount, themeColor, pinScale, false)}`;

  return {
    html: motionWrap(teardrop, size, size, motion),
    size: [size, size],
    anchor: [size / 2, size]
  };
}
