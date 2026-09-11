import React from 'react';

export type ChromeSegmentedOption<T extends string> = {
  id: T;
  label: React.ReactNode;
  title?: string;
  ariaLabel?: string;
};

type ChromeSegmentedControlProps<T extends string> = {
  value: T;
  options: readonly ChromeSegmentedOption<T>[];
  onChange: (id: T) => void;
  /** md：检索/图层主切换；sm：行内 AND/OR */
  size?: 'md' | 'sm';
  className?: string;
  'aria-label'?: string;
};

/**
 * 玻璃面板内的分段胶囊：凹槽轨道 + 滑动凸起块，与检索窗口 Region/Place 同款，
 * 随 `.map-chrome-content-light|dark` 换色。
 */
export function ChromeSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className = '',
  'aria-label': ariaLabel
}: ChromeSegmentedControlProps<T>) {
  const n = Math.max(1, options.length);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const padPx = size === 'sm' ? 2 : 4;
  const compact = size === 'sm';

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`chrome-inset relative flex overflow-hidden ${
        compact ? 'rounded-full p-0.5' : 'rounded-xl p-1'
      } ${className}`.trim()}
    >
      <div
        aria-hidden
        className={`chrome-raised pointer-events-none absolute transition-all duration-200 ${
          compact ? 'inset-y-0.5 rounded-full' : 'inset-y-1 rounded-lg'
        }`}
        style={{
          width: `calc((100% - ${padPx * 2}px) / ${n})`,
          left: `calc(${padPx}px + ${index} * (100% - ${padPx * 2}px) / ${n})`
        }}
      />
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            aria-label={opt.ariaLabel ?? opt.title}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 flex min-w-0 flex-1 items-center justify-center border-0 bg-transparent font-bold transition-colors ${
              compact ? 'min-w-[2.25rem] px-2 py-0.5 text-[10px] tracking-wide' : 'px-2 py-1.5 text-xs'
            } ${active ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
