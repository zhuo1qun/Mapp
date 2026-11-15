import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, MapPinned, Share2 } from 'lucide-react';
import {
  externalMapShareUrl,
  listExternalMapApps,
  openExternalMapApp,
  type ExternalMapAppChoice,
  type ExternalMapAppId
} from '../../../utils/map/openExternalNavigation';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';
import { useChromeAppearance } from '../../ui/chromeAppearanceContext';
import { ChromeWindow } from '../../ui/ChromeWindow';
import { ChromeWindowHeader } from '../../ui/ChromeWindowHeader';
import { ChromeMenuItem } from '../../ui/ChromeMenuItem';
import { chromePanelGhostIconButtonClass } from '../../ui/chromePanelIconButton';

type Props = {
  open: boolean;
  lat: number;
  lng: number;
  label?: string;
  onClose: () => void;
  /** 与触发它的详情卡/编辑器共用同一层玻璃材质。 */
  panelChromeStyle?: React.CSSProperties;
  chromeAppearance?: MapChromeAppearance;
};

/**
 * 在地图 App 中标出点位。移动端优先唤起已安装应用；网页地图只作兜底。
 */
export const ExternalNavigationSheet: React.FC<Props> = ({
  open,
  lat,
  lng,
  label,
  onClose,
  panelChromeStyle,
  chromeAppearance: chromeAppearanceProp
}) => {
  const chromeAppearance = useChromeAppearance(chromeAppearanceProp);
  const apps = listExternalMapApps();
  const canUseSystemShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [copiedAppId, setCopiedAppId] = useState<ExternalMapAppId | null>(null);
  const copiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current != null) window.clearTimeout(copiedResetTimerRef.current);
    };
  }, []);

  const pick = (id: ExternalMapAppId) => {
    openExternalMapApp(id, lat, lng, { label });
    onClose();
  };

  const share = async (app: ExternalMapAppChoice) => {
    const url = externalMapShareUrl(app.id, lat, lng, { label });
    if (!url || !canUseSystemShare) return;
    try {
      await navigator.share({
        title: label || '点位',
        text: `在${app.label}中查看此点`,
        url
      });
    } catch (error) {
      // 关闭系统分享面板会抛 AbortError，属于用户的正常取消，不需要提示。
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('Unable to share map link', error);
      }
    }
  };

  const copyLink = async (app: ExternalMapAppChoice) => {
    const url = externalMapShareUrl(app.id, lat, lng, { label });
    if (!url) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard copy was rejected');
      }
      setCopiedAppId(app.id);
      if (copiedResetTimerRef.current != null) window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopiedAppId((current) => (current === app.id ? null : current));
        copiedResetTimerRef.current = null;
      }, 1500);
    } catch (error) {
      console.warn('Unable to copy map link', error);
    }
  };

  return (
    <ChromeWindow
      open={open}
      onClose={onClose}
      backdropLabel="关闭地图应用"
      placement="center"
      surface="window"
      appearance={chromeAppearance}
      compactBehavior="sheet"
      showBackdrop={false}
      elevation="above-note-slot"
      role="dialog"
      aria-modal="true"
      aria-label="在地图中打开"
      className={`w-full sm:max-w-sm ${panelChromeStyle ? '' : 'bg-white'}`}
      style={panelChromeStyle}
    >
        <ChromeWindowHeader title="在地图中打开" onClose={onClose} closeLabel="关闭地图应用" />
        <ul className="pb-2 pt-1" aria-label="可用地图服务">
          {apps.map((app) => (
            <li key={app.id} className="mx-1 my-px flex items-center gap-1">
              <ChromeMenuItem
                onClick={() => pick(app.id)}
                icon={<MapPinned size={16} strokeWidth={1.8} aria-hidden />}
                aria-label={`在${app.label}中查看此点`}
                className="!mx-0 !w-auto flex-1"
              >
                {app.label}
              </ChromeMenuItem>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void copyLink(app);
                }}
                className={chromePanelGhostIconButtonClass}
                title={copiedAppId === app.id ? '链接已复制' : `复制${app.label}点位链接`}
                aria-label={copiedAppId === app.id ? '链接已复制' : `复制${app.label}点位链接`}
              >
                {copiedAppId === app.id ? <Check size={15} strokeWidth={2} aria-hidden /> : <Copy size={15} strokeWidth={1.9} aria-hidden />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void share(app);
                }}
                className={chromePanelGhostIconButtonClass}
                title={canUseSystemShare ? `分享${app.label}点位链接` : '当前浏览器不支持系统分享'}
                aria-label={canUseSystemShare ? `分享${app.label}点位链接` : '当前浏览器不支持系统分享'}
                disabled={!canUseSystemShare}
              >
                <Share2 size={15} strokeWidth={1.9} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
    </ChromeWindow>
  );
};
