import React, { type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MapChromeAppearance } from '../../utils/map/mapChromeStyle';
import { useChromeAppearance } from './chromeAppearanceContext';

export type ChromePropertyPopoverPlacement = {
  top: number;
  left: number;
  maxHeight?: number;
};

type ChromePropertyPopoverProps = {
  open: boolean;
  onClose: () => void;
  placement: ChromePropertyPopoverPlacement | null;
  children: ReactNode;
  panelRef?: RefObject<HTMLDivElement | null>;
  panelChromeStyle?: CSSProperties;
  chromeAppearance?: MapChromeAppearance;
  width?: number | string;
  maxWidth?: string;
  className?: string;
  zIndex?: number;
  backdrop?: boolean;
  surface?: 'emoji' | 'time' | 'tag';
};

/**
 * 编辑器属性浮层的共同外壳：统一 portal、玻璃表面、遮罩关闭和视口安全边界。
 * 内容只管理自身字段，锚定位置仍由各业务控件计算。
 */
export const ChromePropertyPopover: React.FC<ChromePropertyPopoverProps> = ({
  open,
  onClose,
  placement,
  children,
  panelRef,
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp,
  width,
  maxWidth = 'calc(100vw - 16px)',
  className = '',
  zIndex = 10000,
  backdrop = true,
  surface
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  if (!open || !placement || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-chrome-window-nested=""
      data-note-emoji-picker={surface === 'emoji' ? '' : undefined}
      data-note-time-range-panel={surface === 'time' ? '' : undefined}
      data-tag-add-panel={surface === 'tag' ? '' : undefined}
    >
      {backdrop ? (
        <div className="fixed inset-0" style={{ zIndex: zIndex - 1 }} onClick={onClose} />
      ) : null}
      <div
        ref={panelRef}
        data-chrome-property-popover=""
        className={`fixed map-chrome-content-${chromeAppearance} overflow-hidden rounded-xl border border-gray-100/80 shadow-lg ${
          panelChromeStyle ? '' : 'bg-white'
        } ${className}`.trim()}
        style={{
          ...(panelChromeStyle || {}),
          width,
          maxWidth,
          maxHeight: placement.maxHeight,
          top: placement.top,
          left: placement.left,
          zIndex,
          pointerEvents: 'auto'
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
