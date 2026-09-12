/** 等待两帧，确保 React 提交后的首帧样式已参与浏览器绘制。 */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 语义化的动画阶段等待，避免流程内散落 Promise + setTimeout。 */
export function waitForAnimation(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
