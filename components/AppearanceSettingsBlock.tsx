import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ThemeColorSettingRow } from './ThemeColorSettingRow';
import { HelpHint } from './ui/HelpHint';
import { PortalTooltip } from './ui/PortalTooltip';
import { SettingsCompactSlider } from './ui/SettingsCompactSlider';
import { SettingsToggleSwitch } from './ui/SettingsToggleSwitch';

/** 低于该不透明度时提示可能影响界面可读性（40%） */
const PANEL_OPACITY_READABILITY_WARN_BELOW = 0.4;

export interface AppearanceSettingsBlockProps {
  themeColor: string;
  onRequestThemeEdit: () => void;
  uiDarkMode: boolean;
  onUiDarkModeChange: (dark: boolean) => void;
  mapUiChromeOpacity: number;
  onMapUiChromeOpacityChange: (opacity: number) => void;
  mapUiChromeBlurPx: number;
  onMapUiChromeBlurPxChange: (blurPx: number) => void;
  easterEggGravityY?: number;
  onEasterEggGravityYChange?: (v: number) => void;
  easterEggMouseConstraintStiffness?: number;
  onEasterEggMouseConstraintStiffnessChange?: (v: number) => void;
}

/** 设置中与主页「设置」共用的「界面外观」表单（主题色、暗色模式、面板透明度、模糊） */
export const AppearanceSettingsBlock: React.FC<AppearanceSettingsBlockProps> = ({
  themeColor,
  onRequestThemeEdit,
  uiDarkMode,
  onUiDarkModeChange,
  mapUiChromeOpacity,
  onMapUiChromeOpacityChange,
  mapUiChromeBlurPx,
  onMapUiChromeBlurPxChange,
  easterEggGravityY,
  onEasterEggGravityYChange,
  easterEggMouseConstraintStiffness,
  onEasterEggMouseConstraintStiffnessChange
}) => (
  <div>
    <div className="space-y-3 pl-0.5">
      <ThemeColorSettingRow themeColor={themeColor} onRequestEdit={onRequestThemeEdit} />

      <SettingsToggleSwitch
        label="暗色模式"
        checked={uiDarkMode}
        onChange={onUiDarkModeChange}
        themeColor={themeColor}
      />

      <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
        <div className="min-w-0">
          <SettingsCompactSlider
            label="面板背景透明度"
            hint={
              <HelpHint>
                控制工具栏、设置、搜索等浮层的不透明度；越低越能透出背后画布，但文字可读性会下降。
              </HelpHint>
            }
            labelExtra={
              mapUiChromeOpacity < PANEL_OPACITY_READABILITY_WARN_BELOW ? (
                <PortalTooltip
                  tone="warning"
                  content={
                    <p>
                      当前透明度低于 40%，浮层上的文字与按钮可能
                      <strong className="font-semibold">难以辨认</strong>
                      。若看不清界面，请向右调高滑块。
                    </p>
                  }
                >
                  <button
                    type="button"
                    tabIndex={0}
                    className="inline-flex h-5 w-5 cursor-default items-center justify-center rounded-full text-amber-600 outline-none hover:text-amber-800 focus-visible:text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1"
                    aria-label="可读性提示：透明度偏低"
                  >
                    <AlertTriangle size={14} strokeWidth={2} />
                  </button>
                </PortalTooltip>
              ) : null
            }
            themeColor={themeColor}
            value={mapUiChromeOpacity}
            min={0.15}
            max={1}
            step={0.05}
            onChange={onMapUiChromeOpacityChange}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            minCaption="更透"
            maxCaption="更不透明"
          />
        </div>

        <div className="min-w-0">
          <SettingsCompactSlider
            label="背景模糊半径"
            hint={
              <HelpHint>
                对浮层背后内容做毛玻璃模糊（对应 CSS{' '}
                <code className="rounded bg-white/15 px-1 font-mono text-[11px] text-gray-100">backdrop-filter: blur()</code>
                ）。设为 0 可关闭模糊以省电或避免旧设备卡顿。
              </HelpHint>
            }
            themeColor={themeColor}
            value={mapUiChromeBlurPx}
            min={0}
            max={24}
            step={1}
            onChange={onMapUiChromeBlurPxChange}
            formatValue={(v) => `${v}px`}
            minCaption="0"
            maxCaption="24px"
          />
        </div>
      </div>

      {easterEggGravityY !== undefined &&
      onEasterEggGravityYChange &&
      easterEggMouseConstraintStiffness !== undefined &&
      onEasterEggMouseConstraintStiffnessChange ? (
        <>
          <div className="pt-2 text-xs font-medium text-gray-500">彩蛋模式</div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <div className="min-w-0">
              <SettingsCompactSlider
                label="Gravity"
                hint={<HelpHint>控制彩蛋物理世界的重力强度（越大下落越快）。</HelpHint>}
                themeColor={themeColor}
                value={easterEggGravityY}
                min={0}
                max={3}
                step={0.05}
                onChange={onEasterEggGravityYChange}
                formatValue={(v) => v.toFixed(2)}
                minCaption="0"
                maxCaption="3"
              />
            </div>
            <div className="min-w-0">
              <SettingsCompactSlider
                label="Mouse Constraint Stiffness"
                hint={<HelpHint>拖拽刚体时的“跟手”硬度；越大越紧，越小越软。</HelpHint>}
                themeColor={themeColor}
                value={easterEggMouseConstraintStiffness}
                min={0.02}
                max={0.5}
                step={0.01}
                onChange={onEasterEggMouseConstraintStiffnessChange}
                formatValue={(v) => v.toFixed(2)}
                minCaption="软"
                maxCaption="硬"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  </div>
);
