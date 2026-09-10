import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { EMOJI_CATEGORIES, THEME_COLOR } from '../../constants';
import { computeAnchoredPanelPlacement } from '../ui/anchoredPanelPlacement';

export const EMOJI_PICKER_EST_W = 320;
export const EMOJI_PICKER_EST_H = 400;

interface EmojiPickerProps {
  isOpen: boolean;
  /** 锚点元素；打开时按其位置计算面板 placement（含视口钳制） */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  panelChromeStyle?: React.CSSProperties;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  isOpen,
  anchorRef,
  onClose,
  onSelectEmoji,
  panelChromeStyle
}) => {
  const [selectedCategory, setSelectedCategory] =
    useState<keyof typeof EMOJI_CATEGORIES>('Recent');
  const categoryTabsRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const updatePlacement = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    // 首次打开使用估算值；已渲染后用实际尺寸重新锚定，避免面板偏移。
    const panelRect = panelRef.current?.getBoundingClientRect();
    const next = computeAnchoredPanelPlacement(el.getBoundingClientRect(), {
      panelWidth: panelRect?.width || EMOJI_PICKER_EST_W,
      panelHeight: panelRect?.height || EMOJI_PICKER_EST_H,
      align: 'end'
    });
    setPosition((current) =>
      current?.left === next.left && current.top === next.top ? current : next
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePlacement();
  }, [isOpen, updatePlacement]);

  useEffect(() => {
    if (!isOpen) return;
    const onReposition = () => updatePlacement();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen, updatePlacement]);

  useLayoutEffect(() => {
    if (!isOpen || !position || !panelRef.current) return;
    const panel = panelRef.current;
    const reposition = () => updatePlacement();
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(panel);
    // Emoji 按钮在打开时会展开标签；同时观察锚点，跟随这段过渡后的新位置。
    if (anchorRef.current) observer.observe(anchorRef.current);
    return () => observer.disconnect();
  }, [anchorRef, isOpen, position, updatePlacement]);

  const checkScrollPosition = () => {
    if (!categoryTabsRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = categoryTabsRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  const scrollCategoryTabs = (direction: 'left' | 'right') => {
    if (!categoryTabsRef.current) return;
    const scrollAmount = 200;
    const currentScroll = categoryTabsRef.current.scrollLeft;
    const newScroll =
      direction === 'left'
        ? Math.max(0, currentScroll - scrollAmount)
        : Math.min(
            categoryTabsRef.current.scrollWidth - categoryTabsRef.current.clientWidth,
            currentScroll + scrollAmount
          );
    categoryTabsRef.current.scrollTo({ left: newScroll, behavior: 'smooth' });
    setTimeout(checkScrollPosition, 300);
  };

  useEffect(() => {
    if (isOpen && categoryTabsRef.current) {
      checkScrollPosition();
      const container = categoryTabsRef.current;
      container.addEventListener('scroll', checkScrollPosition);
      window.addEventListener('resize', checkScrollPosition);
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [isOpen, selectedCategory]);

  const emojis = useMemo(() => {
    return (EMOJI_CATEGORIES[selectedCategory] || EMOJI_CATEGORIES['Recent']) as string[];
  }, [selectedCategory]);

  if (!isOpen || !position) return null;

  return createPortal(
    <>
      <div className="fixed inset-0" style={{ zIndex: 9999 }} onClick={onClose} />
      <div
        ref={panelRef}
        className={`fixed rounded-xl border border-gray-100/80 shadow-lg overflow-hidden ${
          panelChromeStyle ? '' : 'bg-white'
        }`}
        style={{
          ...(panelChromeStyle || {}),
          width: EMOJI_PICKER_EST_W,
          maxWidth: 'min(100vw - 16px, 320px)',
          maxHeight: EMOJI_PICKER_EST_H,
          display: 'flex',
          flexDirection: 'column',
          left: position.left,
          top: position.top,
          zIndex: 10000,
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-gray-100">
          {canScrollLeft && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollCategoryTabs('left');
              }}
              className="absolute left-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors border-0 cursor-pointer"
              style={{ backdropFilter: 'blur(4px)' }}
            >
              <ArrowLeft size={16} className="text-gray-600" />
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollCategoryTabs('right');
              }}
              className="absolute right-0 top-0 bottom-0 z-10 px-2 bg-white/80 hover:bg-white flex items-center transition-colors border-0 cursor-pointer"
              style={{ backdropFilter: 'blur(4px)' }}
            >
              <ArrowRight size={16} className="text-gray-600" />
            </button>
          )}
          <div
            ref={categoryTabsRef}
            className="flex gap-1 p-1.5 overflow-x-auto scrollbar-hide"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x'
            }}
          >
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCategory(category as keyof typeof EMOJI_CATEGORIES);
                }}
                className={`px-2 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex-shrink-0 border-0 cursor-pointer ${
                  selectedCategory === category
                    ? 'text-gray-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 overflow-y-auto" style={{ maxHeight: 320 }}>
          <div className="grid grid-cols-8 gap-1" key={selectedCategory}>
            {emojis.map((e, index) => (
              <button
                key={`${selectedCategory}-${index}-${e}`}
                type="button"
                onClick={() => {
                  onSelectEmoji(e);
                  onClose();
                  if (selectedCategory !== 'Recent') {
                    const recent = EMOJI_CATEGORIES['Recent'];
                    if (!recent.includes(e)) {
                      EMOJI_CATEGORIES['Recent'] = [e, ...recent.slice(0, 19)];
                    }
                  }
                }}
                className="text-2xl p-2 rounded-lg transition-colors flex items-center justify-center border-0 cursor-pointer"
                style={{ backgroundColor: 'transparent' }}
                onMouseEnter={(ev) => (ev.currentTarget.style.backgroundColor = `${THEME_COLOR}1A`)}
                onMouseLeave={(ev) => (ev.currentTarget.style.backgroundColor = 'transparent')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};
