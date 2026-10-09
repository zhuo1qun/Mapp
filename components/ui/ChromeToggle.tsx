import React from 'react';
import { useChromeAppearance } from './chromeAppearanceContext';

export type ChromeToggleProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  themeColor: string;
  label: string;
  disabled?: boolean;
  className?: string;
};

/** 所有 Chrome 开关共用的槽位、手柄与可访问性语义。 */
export function ChromeToggle({
  checked,
  onCheckedChange,
  themeColor,
  label,
  disabled = false,
  className = ''
}: ChromeToggleProps) {
  const appearance = useChromeAppearance();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`chrome-toggle-track chrome-toggle-track--${appearance} relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`.trim()}
      style={checked ? { backgroundColor: themeColor } : undefined}
    >
      <span
        className={`chrome-raised absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
