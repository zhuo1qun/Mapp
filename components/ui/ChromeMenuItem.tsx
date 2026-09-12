import React, { useState } from 'react';

export type ChromeMenuItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  icon?: React.ReactNode;
  /** 玻璃菜单的悬停色；不传则采用标准浅灰 hover。 */
  hoverBackground?: string;
  destructive?: boolean;
  className?: string;
};

/** 所有轻量选项菜单共用的菜单项：采用与工作区页签一致的内缩玻璃胶囊 hover。 */
export const ChromeMenuItem: React.FC<ChromeMenuItemProps> = ({
  icon,
  hoverBackground,
  destructive = false,
  className = '',
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  disabled,
  children,
  ...props
}) => {
  const [isActive, setIsActive] = useState(false);
  const themedHoverStyle = isActive && hoverBackground && !disabled
    ? { ...style, backgroundColor: hoverBackground }
    : style;

  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={disabled}
      style={themedHoverStyle}
      onMouseEnter={(event) => {
        setIsActive(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setIsActive(false);
        onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setIsActive(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsActive(false);
        onBlur?.(event);
      }}
      className={`chrome-menu-item mx-1 my-px flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? 'chrome-menu-item--destructive text-red-500' : 'text-gray-700'
      } ${className}`.trim()}
    >
      {icon}
      {children}
    </button>
  );
};
