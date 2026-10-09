import React from 'react';
import { ChromeToggle } from './ChromeToggle';

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
      <ChromeToggle checked={checked} onCheckedChange={onChange} themeColor={themeColor} label={label} />
    </div>
  );
}
