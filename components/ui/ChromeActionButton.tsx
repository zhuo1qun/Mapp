import React from 'react';

export type ChromeActionButtonTone = 'primary' | 'quiet' | 'danger';

export type ChromeActionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  themeColor?: string;
  tone?: ChromeActionButtonTone;
};

/** 主操作、次操作和危险操作共用的按钮状态；颜色仍由 Chrome 主题容器接管。 */
export const ChromeActionButton: React.FC<ChromeActionButtonProps> = ({
  themeColor,
  tone = 'quiet',
  className = '',
  style,
  type = 'button',
  children,
  ...props
}) => {
  const toneClass =
    tone === 'primary'
      ? 'bg-[var(--chrome-action-color)] text-theme-chrome-fg shadow-sm hover:opacity-90'
      : tone === 'danger'
        ? 'bg-red-500/12 text-red-600 hover:bg-red-500/18'
        : 'text-gray-600 hover:bg-gray-100';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border-0 px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${toneClass} ${className}`.trim()}
      style={{
        ...(themeColor ? ({ ['--chrome-action-color' as string]: themeColor } as React.CSSProperties) : null),
        ...style
      }}
      {...props}
    >
      {children}
    </button>
  );
};
