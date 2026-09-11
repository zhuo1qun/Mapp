import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Copy, Loader2 } from 'lucide-react';
import { ChromeIconButton } from '../../ui/ChromeIconButton';
import { ChromeSegmentedControl } from '../../ui/ChromeSegmentedControl';
import { useChromeMenuTop } from '../../../utils/ui/chromeMenuPosition';
import type { MapChromeAppearance } from '../../../utils/map/mapChromeStyle';

export interface BorderSearchState {
  borderSearchQuery: string;
  setBorderSearchQuery: (q: string) => void;
  borderSearchMode: 'region' | 'place';
  setBorderSearchMode: (m: 'region' | 'place') => void;
  borderSearchResults: any[];
  borderSearchError: string | null;
  isSearchingBorder: boolean;
  handleBorderSearch: () => void;
  handleSelectBorder: (result: any) => void;
  handleCopyBorder: (geoJSON: any) => void;
}

interface MapSearchPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  themeColor: string;
  chromeSurfaceStyle?: React.CSSProperties;
  /** 展开检索面板使用更稳定的材质，避免深色图标玻璃影响正文对比度。 */
  menuChromeSurfaceStyle?: React.CSSProperties;
  menuChromeAppearance?: MapChromeAppearance;
  chromeHoverBackground?: string;
  borderSearch: BorderSearchState;
  borderGeoJSON: any;
  onClearBorder: () => void;
  onClose: () => void;
}

export const MapSearchPanel: React.FC<MapSearchPanelProps> = ({
  isOpen,
  onToggle,
  themeColor,
  chromeSurfaceStyle,
  menuChromeSurfaceStyle,
  menuChromeAppearance = 'light',
  chromeHoverBackground,
  borderSearch,
  borderGeoJSON,
  onClearBorder,
  onClose
}) => {
  const {
    borderSearchQuery,
    setBorderSearchQuery,
    borderSearchMode,
    setBorderSearchMode,
    borderSearchResults,
    borderSearchError,
    isSearchingBorder,
    handleBorderSearch,
    handleSelectBorder,
    handleCopyBorder
  } = borderSearch;

  const wrapRef = useRef<HTMLDivElement>(null);
  const menuTop = useChromeMenuTop(isOpen, wrapRef, 8);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-map-search-chrome-panel]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [isOpen, onClose]);

  const panel =
    isOpen && menuTop != null ? (
      <div
        data-map-search-chrome-panel
        className={`map-chrome-content-${menuChromeAppearance} fixed z-[2000] ui-chrome-menu-page-right w-72 sm:w-80 rounded-2xl shadow-2xl border border-gray-100/80 p-4 animate-in fade-in slide-in-from-top-4 ${(menuChromeSurfaceStyle ?? chromeSurfaceStyle) ? '' : 'bg-white'}`}
        style={{ top: menuTop, ...(menuChromeSurfaceStyle ?? chromeSurfaceStyle) }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-gray-500">检索</h3>
          {borderGeoJSON ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyBorder(borderGeoJSON)}
                className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-100"
                title="Copy Border GeoJSON"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={onClearBorder}
                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100"
              >
                Clear Border
              </button>
            </div>
          ) : null}
        </div>

        <ChromeSegmentedControl
          className="mb-4"
          aria-label="检索模式"
          value={borderSearchMode}
          onChange={setBorderSearchMode}
          options={[
            { id: 'region', label: 'Region Border' },
            { id: 'place', label: 'Place' }
          ]}
        />

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              autoFocus
              type="text"
              value={borderSearchQuery}
              onChange={(e) => setBorderSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBorderSearch()}
              className="w-full pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {isSearchingBorder && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 size={14} className="animate-spin text-gray-400" />
              </div>
            )}
          </div>
          <button
            onClick={handleBorderSearch}
            disabled={isSearchingBorder || !borderSearchQuery.trim()}
            className="px-3 py-2 rounded-xl text-sm font-bold text-theme-chrome-fg transition-all disabled:opacity-50"
            style={{ backgroundColor: themeColor }}
          >
            Search
          </button>
        </div>

        {borderSearchError && (
          <div className="text-xs text-red-500 mb-3 px-1">{borderSearchError}</div>
        )}

        {borderSearchResults.length > 0 && (
          <div className="max-h-60 overflow-y-auto border-results-list pr-1">
            <style>{`
              .border-results-list::-webkit-scrollbar { width: 4px; }
              .border-results-list::-webkit-scrollbar-track { background: transparent; }
              .border-results-list::-webkit-scrollbar-thumb { background: ${themeColor}44; border-radius: 10px; }
              .border-results-list::-webkit-scrollbar-thumb:hover { background: ${themeColor}88; }
            `}</style>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Select a region:</div>
            <div className="space-y-1">
              {borderSearchResults.map((result: any) => (
                <button
                  key={`${result.osm_type}-${result.osm_id}`}
                  onClick={() => handleSelectBorder(result)}
                  className="w-full text-left p-2.5 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100 flex flex-col gap-0.5"
                >
                  <div className="text-sm font-medium text-gray-800 flex items-baseline gap-1 flex-wrap">
                    <span>{result.display_name.split(',')[0]}</span>
                    {(() => {
                      const addr = result.address;
                      const self = result.display_name.split(',')[0].trim();
                      const parts = result.display_name.split(',').map((p: string) => p.trim());
                      let parent = addr?.city || addr?.town || addr?.village ||
                        addr?.municipality || addr?.county ||
                        addr?.state_district || addr?.city_district ||
                        addr?.suburb || addr?.neighbourhood || addr?.state;
                      if (!parent || parent === self) {
                        parent = parts.find((p: string) =>
                          p !== self && !/^\d+$/.test(p) && p !== '中国' && p !== 'China'
                        );
                      }
                      if (parent && parent !== self) {
                        return (
                          <span className="text-xs text-gray-400 font-normal italic">, {parent}</span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className="relative">
      <ChromeIconButton
        themeColor={themeColor}
        chromeSurfaceStyle={chromeSurfaceStyle}
        chromeHoverBackground={chromeHoverBackground}
        active={isOpen}
        nonChromeIdleHover="none"
        className="transition-all hover:scale-105 active:scale-95"
        onClick={onToggle}
        tooltip="检索"
      >
        <Search size={18} className="sm:w-5 sm:h-5" />
      </ChromeIconButton>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
};
