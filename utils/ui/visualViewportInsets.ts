type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandaloneDisplay(): boolean {
  return Boolean(
    (navigator as NavigatorWithStandalone).standalone ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

/**
 * 将浏览器动态工具栏占用的可视区域写入 CSS 变量。
 * 物理刘海 / Home Indicator 仍由 env(safe-area-inset-*) 提供；这里只补足普通浏览器模式。
 */
export function installVisualViewportInsets(): () => void {
  const root = document.documentElement;
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
  const viewport = window.visualViewport;

  const update = () => {
    const standalone = isStandaloneDisplay();
    root.dataset.displayMode = standalone ? 'standalone' : 'browser';

    if (standalone || !viewport) {
      root.style.setProperty('--app-browser-top-inset', '0px');
      root.style.setProperty('--app-browser-bottom-inset', '0px');
      return;
    }

    const layoutHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    const top = Math.max(0, viewport.offsetTop);
    const rawBottom = Math.max(0, layoutHeight - viewport.offsetTop - viewport.height);
    // 软键盘也会缩小 VisualViewport，但它不属于浏览器安全区；编辑器自行处理键盘布局。
    const keyboardLikely = viewport.height < layoutHeight * 0.72;
    const bottom = keyboardLikely ? 0 : rawBottom;
    root.style.setProperty('--app-browser-top-inset', `${Math.round(top * 100) / 100}px`);
    root.style.setProperty('--app-browser-bottom-inset', `${Math.round(bottom * 100) / 100}px`);
  };

  update();
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  standaloneQuery.addEventListener?.('change', update);
  fullscreenQuery.addEventListener?.('change', update);

  return () => {
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    window.removeEventListener('orientationchange', update);
    standaloneQuery.removeEventListener?.('change', update);
    fullscreenQuery.removeEventListener?.('change', update);
  };
}

