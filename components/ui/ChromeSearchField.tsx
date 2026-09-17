import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useChromeAppearance } from './chromeAppearanceContext';

interface ChromeSearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  themeColor: string;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  trailing?: ReactNode;
  /** 默认显示左侧搜索图标；项目名称等普通输入可关掉 */
  showLeadingIcon?: boolean;
}

/**
 * Chrome 面板与工具栏共用的搜索/单行输入。
 * 比图标按钮略矮、圆角略小；表面复用 Chrome 槽位材质，而不是额外描边。
 */
export const ChromeSearchField = forwardRef<HTMLInputElement, ChromeSearchFieldProps>(
  function ChromeSearchField(
    {
      themeColor,
      containerClassName = '',
      containerStyle,
      trailing,
      showLeadingIcon = true,
      className = '',
      ...inputProps
    },
    ref
  ) {
    const appearance = useChromeAppearance();
    const dark = appearance === 'dark';

    return (
      <div
        className={`chrome-search-field chrome-input-well chrome-input-well--${appearance} relative flex h-9 min-w-0 items-center overflow-hidden rounded-[10px] transition-[box-shadow,background-color] sm:h-10 ${containerClassName}`.trim()}
        style={{
          ...containerStyle,
          ['--chrome-input-focus' as string]: `${themeColor}55`
        }}
      >
        {showLeadingIcon ? (
          <Search
            size={16}
            strokeWidth={2}
            className={`pointer-events-none ml-2.5 shrink-0 ${dark ? 'text-white/45' : 'text-gray-400'}`}
            aria-hidden
          />
        ) : null}
        <input
          ref={ref}
          type="search"
          autoComplete="off"
          className={`h-full min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-sm leading-normal outline-none placeholder:text-current placeholder:opacity-45 focus:ring-0 ${
            showLeadingIcon ? 'px-2' : 'px-2.5'
          } ${className}`.trim()}
          {...inputProps}
        />
        {trailing}
      </div>
    );
  }
);
