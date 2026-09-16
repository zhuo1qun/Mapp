import React, { useEffect, useState } from 'react';

interface ModuleLoadProgressProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  themeColor: string;
  className?: string;
}

/**
 * Suspense cannot expose byte-level progress for a dynamic import. This indicator
 * therefore advances through a bounded preparation phase and disappears only when
 * the requested module has actually resolved and mounted.
 */
export const ModuleLoadProgress: React.FC<ModuleLoadProgressProps> = ({
  title,
  description = '首次使用时需要下载，后续打开会更快',
  icon,
  themeColor,
  className = ''
}) => {
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    const startedAt = performance.now();
    let frame = 0;

    const update = (now: number) => {
      const elapsed = now - startedAt;
      // 快速反馈后逐渐放缓，并停在 92%；组件真正完成加载时由 Suspense 卸载。
      const next = Math.min(92, 10 + 82 * (1 - Math.exp(-elapsed / 1900)));
      setProgress(Math.floor(next));
      frame = window.requestAnimationFrame(update);
    };

    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`module-load-progress flex h-full min-h-0 w-full flex-1 items-center justify-center px-6 ${className}`}
      style={{ backgroundColor: themeColor }}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="flex w-full max-w-[20rem] flex-col items-center text-center text-theme-chrome-fg">
        {icon ? (
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--theme-chrome-fg)_14%,transparent)]">
            {icon}
          </div>
        ) : null}
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs opacity-70">{description}</div>
        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--theme-chrome-fg)_20%,transparent)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${title}，正在准备`}
        >
          <div
            className="module-load-progress__fill relative h-full overflow-hidden rounded-full bg-[var(--theme-chrome-fg)]"
            style={{ width: `${progress}%` }}
          >
            <span className="module-load-progress__shine absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/55 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
};
