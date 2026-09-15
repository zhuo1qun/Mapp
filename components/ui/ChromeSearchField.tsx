import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useChromeAppearance } from './chromeAppearanceContext';

interface ChromeSearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  themeColor: string;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  trailing?: ReactNode;
}

/**
 * Chrome 面板与工具栏共用的搜索输入。
 * 比图标按钮略矮、圆角略小，并使用内凹边界来保持“输入框”语义。
 */
export const ChromeSearchField = forwardRef<HTMLInputElement, ChromeSearchFieldProps>(
  function ChromeSearchField(
    {
      themeColor,
      containerClassName = '',
      containerStyle,
      trailing,
      className = '',
      ...inputProps
    },
    ref
  ) {
    const appearance = useChromeAppearance();
    const dark = appearance === 'dark';

    return (
      <div
        className={`chrome-search-field relative flex h-9 min-w-0 items-center overflow-hidden rounded-[10px] border transition-[border-color,box-shadow,background-color] focus-within:ring-2 focus-within:ring-offset-0 sm:h-10 ${
          dark
            ? 'border-white/20 bg-black/10 text-white/90 shadow-[inset_0_1px_2px_rgb(0_0_0/0.22)]'
            : 'border-black/[0.14] bg-white/70 text-gray-900 shadow-[inset_0_1px_2px_rgb(17_24_39/0.07)]'
        } ${containerClassName}`.trim()}
        style={{
          ...containerStyle,
          ['--tw-ring-color' as string]: `${themeColor}2e`
        }}
      >
        <Search
          size={16}
          strokeWidth={2}
          className={`pointer-events-none ml-2.5 shrink-0 ${dark ? 'text-white/45' : 'text-gray-400'}`}
          aria-hidden
        />
        <input
          ref={ref}
          type="search"
          autoComplete="off"
          className={`h-full min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 py-0 text-sm leading-normal outline-none placeholder:text-current placeholder:opacity-45 focus:ring-0 ${className}`.trim()}
          {...inputProps}
        />
        {trailing}
      </div>
    );
  }
);
