import React from 'react';

export interface ChromeIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  themeColor?: string;
  chromeSurfaceStyle?: React.CSSProperties;
  chromeHoverBackground?: string;
  /** 选中 / 开启态 */
  active?: boolean;
  /** `active` 时：theme=主题色底；muted=灰底（Board 工具切换） */
  activeVariant?: 'theme' | 'muted';
  /** 未选中时按下瞬间显示主题色（如图层按钮） */
  pressThemeFlash?: boolean;
  /**
   * 无玻璃底（chrome）时的空闲悬停：
   * - tailwind：hover:bg-gray-50（定位、label 等）
   * - imperative-gray100：与旧「设置」按钮一致（#F3F4F6）
   * - none：仅背景类名，无悬停变色（如搜索按钮仅保留 scale 动画）
   */
  nonChromeIdleHover?: 'tailwind' | 'imperative-gray100' | 'none';
  /** 悬停 / 键盘聚焦时在按钮内展开的短中文名。 */
  tooltip?: string;
}

const baseClass =
  'p-2 sm:p-3 rounded-xl shadow-lg transition-colors transition-transform transform-gpu hover:scale-[1.04] motion-reduce:hover:scale-100 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-gray-100/80';

/**
 * 地图 / Board 顶栏共用的「玻璃或白底 + 细边框」图标按钮，悬停与主题态与 MapLayerControl 一致。
 */
export const ChromeIconButton = React.forwardRef<HTMLButtonElement, ChromeIconButtonProps>(
  function ChromeIconButton(
    {
      themeColor,
      chromeSurfaceStyle: ch,
      chromeHoverBackground: chHover,
      active = false,
      activeVariant = 'theme',
      pressThemeFlash = false,
      nonChromeIdleHover = 'tailwind',
      tooltip,
      title,
      'aria-label': ariaLabel,
      className = '',
      children,
      onClick,
      onPointerDown,
      onPointerUp,
      onMouseEnter,
      onMouseLeave,
      type = 'button',
      ...rest
    },
    ref
  ) {
    const resetInactiveBackground = (el: HTMLButtonElement) => {
      if (ch?.backgroundColor) {
        el.style.backgroundColor = String(ch.backgroundColor);
        el.style.backgroundImage = typeof ch.backgroundImage === 'string' ? ch.backgroundImage : '';
      } else {
        el.style.backgroundColor = '';
        el.style.backgroundImage = '';
      }
    };

    const activeTheme = active && activeVariant === 'theme';
    const activeMuted = active && activeVariant === 'muted';

    const idleSurfaceClass = activeMuted
      ? 'bg-gray-100 border-gray-200/80 text-gray-900'
      : activeTheme
        ? 'text-theme-chrome-fg'
        : ch
          ? 'text-gray-700'
          : nonChromeIdleHover === 'tailwind'
            ? 'bg-white text-gray-700 hover:bg-gray-50'
            : 'bg-white text-gray-700';

    const surfaceStyle: React.CSSProperties | undefined = activeTheme && themeColor
      ? {
          backgroundColor: themeColor,
          // 保留深色地图工具栏传入的低对比描边，避免选中后露出默认的亮白边框。
          ...(ch?.borderColor ? { borderColor: ch.borderColor } : {})
        }
      : activeMuted
        ? undefined
        : ch || undefined;

    const label = ariaLabel || tooltip || (typeof title === 'string' ? title : undefined);
    const inlineLabel = tooltip;

    const button = (
      <button
        ref={ref}
        type={type}
        className={`${baseClass} ${inlineLabel ? 'ui-chrome-icon-button-expands' : ''} ${idleSurfaceClass} ${className}`.trim()}
        style={surfaceStyle}
        title={tooltip ? undefined : title}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.(e);
          if (pressThemeFlash && !active && themeColor) {
            (e.currentTarget as HTMLButtonElement).style.backgroundImage = 'none';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = themeColor;
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onPointerUp?.(e);
          if (pressThemeFlash && !active) {
            resetInactiveBackground(e.currentTarget as HTMLButtonElement);
          }
        }}
        onMouseEnter={(e) => {
          onMouseEnter?.(e);
          if (active) return;
          if (ch && chHover) {
            e.currentTarget.style.backgroundImage = 'none';
            e.currentTarget.style.backgroundColor = chHover;
            return;
          }
          if (!ch && nonChromeIdleHover === 'imperative-gray100') {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
          }
        }}
        onMouseLeave={(e) => {
          onMouseLeave?.(e);
          if (active) return;
          if (ch?.backgroundColor) {
            resetInactiveBackground(e.currentTarget);
            return;
          }
          if (!ch && nonChromeIdleHover === 'imperative-gray100') {
            e.currentTarget.style.backgroundColor = '';
          }
        }}
        {...rest}
      >
        {children}
        {inlineLabel ? <span className="ui-chrome-icon-button-label">{inlineLabel}</span> : null}
      </button>
    );

    return button;
  }
);
