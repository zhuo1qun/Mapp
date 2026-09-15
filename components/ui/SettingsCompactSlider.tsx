import React from 'react';
import { ChromeCapsuleSlider, type ChromeCapsuleSliderWidth } from './ChromeCapsuleSlider';

/** 与图谱编辑工具条内固定宽度滑块一致（px），设置面板内默认用 `stretch` */
export const SETTINGS_COMPACT_SLIDER_TRACK_PX = 90;

type SettingsCompactSliderProps = {
  label: string;
  hint?: React.ReactNode;
  /** 标签行内、hint 右侧的附加控件（如与说明并列的警告图标） */
  labelExtra?: React.ReactNode;
  /** 保留以兼容既有调用方；轨道使用 chrome 凹槽/填充，不跟主题色 */
  themeColor?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** 抬起时触发一次；用于昂贵副作用（如力导重算） */
  onCommit?: (v: number) => void;
  formatValue: (v: number) => string;
  minCaption?: string;
  maxCaption?: string;
  /** 默认 `stretch`：在网格列内铺满宽度；传数字则与工具条固定宽一致 */
  trackWidth?: ChromeCapsuleSliderWidth;
  className?: string;
};

/**
 * 设置面板用紧凑滑块：标签 `text-xs`，轨道为共用胶囊滑块（主题 / 地图 / 图谱设置同一套）。
 */
export const SettingsCompactSlider: React.FC<SettingsCompactSliderProps> = ({
  label,
  hint,
  labelExtra,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  formatValue,
  minCaption,
  maxCaption,
  trackWidth = 'stretch',
  className = ''
}) => {
  const showCaptions = minCaption != null || maxCaption != null;
  return (
    <div className={`settings-compact-slider min-w-0 ${className}`.trim()}>
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <ChromeCapsuleSlider
          label={label}
          labelExtra={<>{hint}{labelExtra}</>}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          onCommit={onCommit}
          width={trackWidth}
          formatValue={formatValue}
          aria-label={label}
        />
        {showCaptions ? (
          <div className="settings-compact-slider-captions flex w-full min-w-0 justify-between px-2.5 text-[11px] leading-tight text-gray-400">
            <span>{minCaption ?? ''}</span>
            <span>{maxCaption ?? ''}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
