import React, { useEffect, useRef } from 'react';
import { Tag as TagIcon } from 'lucide-react';
import { TAG_COLORS } from '../../constants';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from './chromeAppearanceContext';
import { ChromeTextField } from './ChromeTextField';
import { ChromeActionButton } from './ChromeActionButton';
import { ChromePropertyPopover } from './ChromePropertyPopover';

export interface TagAddPanelProps {
  themeColor: string;
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  /** 标题说明（如「为 3 个便签添加标签」）；编辑器内可省略以避免重复层级。 */
  title?: string;
  label: string;
  onLabelChange: (v: string) => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
  onApply: () => void | Promise<void>;
  /** 点击面板外：与「应用」一致（通常即保存/提交；空标签则取消），并收起面板 */
  onDismissOutside?: () => void;
  /**
   * 若点击目标在该选择器匹配的元素内，不触发 onDismissOutside（如画板批量工具栏整列含按钮，避免与标签按钮 toggle 冲突）
   */
  dismissIgnoreClosestSelector?: string;
  /**
   * 传入时通过 portal 渲染到 document.body，fixed 定位于视口（便签编辑器内与 Emoji 浮层同级）
   */
  portalPlacement?: { top: number; left: number; maxHeight?: number } | null;
  /** portal 内容层 z-index，默认与 EmojiPicker 内容一致 */
  portalZIndex?: number;
  /** 便签编辑器内使用：同 EmojiPicker 一样以全屏点击层关闭，而非文档级 outside handler。 */
  portalBackdrop?: boolean;
  /** 供锚定调用方在实际尺寸变化后重新计算位置。 */
  portalPanelRef?: React.RefObject<HTMLDivElement | null>;
  placeholder?: string;
  applyLabel?: string;
  autoFocus?: boolean;
  className?: string;
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  closeOnInteractOutside?: boolean;
  /** 隐藏标签输入（仅用于颜色等场景） */
  hideLabelInput?: boolean;
  /** 只读标签输入（避免误改标签名） */
  labelReadOnly?: boolean;
}

const PORTAL_Z = 10000;

/**
 * 画板批量加标签与便签编辑器共用：标签图标 + 名称 + 全色盘 + 应用
 */
export const TagAddPanel: React.FC<TagAddPanelProps> = ({
  themeColor,
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp,
  title,
  label,
  onLabelChange,
  selectedColor,
  onColorChange,
  onApply,
  onDismissOutside,
  dismissIgnoreClosestSelector,
  portalPlacement,
  portalZIndex = PORTAL_Z,
  portalBackdrop = false,
  portalPanelRef,
  placeholder,
  applyLabel = '应用',
  autoFocus,
  className = '',
  onInputKeyDown,
  closeOnInteractOutside = true,
  hideLabelInput = false,
  labelReadOnly = false,
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const rootRef = useRef<HTMLDivElement>(null);
  const outsideRef = useRef(onDismissOutside ?? onApply);
  outsideRef.current = onDismissOutside ?? onApply;
  const ignoreSelRef = useRef(dismissIgnoreClosestSelector);
  ignoreSelRef.current = dismissIgnoreClosestSelector;

  useEffect(() => {
    if (!closeOnInteractOutside || portalBackdrop) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const t = e.target as Node;
      if (!root || root.contains(t)) return;
      const sel = ignoreSelRef.current;
      if (sel && t instanceof Element && t.closest(sel)) return;
      outsideRef.current();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [closeOnInteractOutside]);

  const shellClass = `map-chrome-content-${chromeAppearance} rounded-xl border border-gray-100/80 p-2 shadow-lg ${panelChromeStyle ? '' : 'bg-white'} ${className}`;
  const panelRef = portalPanelRef ?? rootRef;

  const body = (
    <>
      {title ? (
        <div className="mb-1.5 flex items-start gap-2">
          <TagIcon size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
          <div className="min-w-0 flex-1 text-xs leading-snug text-gray-500">{title}</div>
        </div>
      ) : null}
      {!hideLabelInput && (
        <ChromeTextField
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          readOnly={labelReadOnly}
          containerClassName={`mb-2 h-8 w-full ${
            labelReadOnly ? 'bg-gray-50 cursor-not-allowed text-gray-600' : ''
          }`}
          className="px-2 text-sm"
          themeColor={themeColor}
          onKeyDown={onInputKeyDown}
        />
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className="w-5 h-5 rounded-full shrink-0 cursor-pointer p-0 border-0 transition-transform"
            style={{
              backgroundColor: c,
              // Selected color dot should be visually distinct.
              // Use a larger scale factor while reducing base size,
              // so both dots are smaller but the selected one stands out more.
              transform: selectedColor === c ? 'scale(1.25)' : undefined,
            }}
            title={c}
          />
        ))}
      </div>
      <ChromeActionButton
        themeColor={themeColor}
        tone="primary"
        onClick={(e) => {
          e.stopPropagation();
          void onApply();
        }}
        className="w-full py-1.5 text-sm"
      >
        {applyLabel}
      </ChromeActionButton>
    </>
  );

  if (portalPlacement != null) {
    return (
      <ChromePropertyPopover
        open
        onClose={() => void outsideRef.current()}
        placement={portalPlacement}
        panelRef={panelRef}
        panelChromeStyle={panelChromeStyle}
        chromeAppearance={chromeAppearance}
        width="min(100vw - 16px, 260px)"
        maxWidth="min(100vw - 16px, 260px)"
        zIndex={portalZIndex}
        backdrop={portalBackdrop}
        surface="tag"
        className={`overflow-y-auto p-2 ${className}`}
      >
        {body}
      </ChromePropertyPopover>
    );
  }

  return (
    <div
      ref={panelRef}
      data-tag-add-panel
      className={`w-full max-w-[min(100vw-24px,260px)] ${shellClass}`}
      style={panelChromeStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {body}
    </div>
  );
};
