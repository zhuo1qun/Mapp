import { useEffect, useState } from 'react';

/** 与 `index.css` 中 `.ui-compact-bottom-sheet` 的断点一致。 */
export const COMPACT_VIEWPORT_QUERY = '(max-width: 639px)';

/**
 * 工作区紧凑视口：窄屏走底部 sheet，宽屏走锚定菜单。
 * 各工具栏不再各自 `matchMedia('(max-width: 639px)')`。
 */
export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_VIEWPORT_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}
