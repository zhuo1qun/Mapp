import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { useChromeAppearance } from './chromeAppearanceContext';

export interface ChromeTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  themeColor: string;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  leading?: ReactNode;
  trailing?: ReactNode;
}

/**
 * Chrome 单行输入的基础槽位。搜索、名称、年份等输入只在前后附属内容上不同，
 * 不再各自维护描边、深浅模式与聚焦环。
 */
export const ChromeTextField = forwardRef<HTMLInputElement, ChromeTextFieldProps>(
  function ChromeTextField(
    {
      themeColor,
      containerClassName = '',
      containerStyle,
      leading,
      trailing,
      className = '',
      type = 'text',
      ...inputProps
    },
    ref
  ) {
    const appearance = useChromeAppearance();
    return (
      <div
        className={`chrome-input-well chrome-input-well--${appearance} relative flex h-9 min-w-0 items-center overflow-hidden rounded-[10px] transition-[box-shadow,background-color] sm:h-10 ${containerClassName}`.trim()}
        style={{
          ...containerStyle,
          ['--chrome-input-focus' as string]: `${themeColor}55`
        }}
      >
        {leading}
        <input
          ref={ref}
          type={type}
          autoComplete="off"
          className={`h-full min-w-0 flex-1 appearance-none border-0 bg-transparent py-0 text-sm leading-normal outline-none placeholder:text-current placeholder:opacity-45 focus:ring-0 ${className}`.trim()}
          {...inputProps}
        />
        {trailing}
      </div>
    );
  }
);
