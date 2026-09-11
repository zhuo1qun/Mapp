import React from 'react';

/** 设置面板共用：标签 + 胶囊开关（与地图「显示标签」同款） */
export function SettingsToggleSwitch({
  label,
  checked,
  onChange,
  themeColor,
  className = ''
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  themeColor: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`.trim()}>
      <span className="text-xs font-medium text-gray-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full border-0 cursor-pointer transition-colors ${
          checked ? '' : 'chrome-inset'
        }`}
        style={checked ? { backgroundColor: themeColor } : undefined}
      >
        <span
          className={`chrome-raised absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
