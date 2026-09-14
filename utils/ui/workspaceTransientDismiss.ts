/**
 * 工作区级的瞬时窗口关闭信号。
 * 由 App 在非 Table 工作区的空白点击时派发；各视图只负责关闭自己的临时 UI。
 */
export const WORKSPACE_TRANSIENT_DISMISS_EVENT = 'mapp:workspace-dismiss-transients';

export function dismissWorkspaceTransients(): void {
  window.dispatchEvent(new Event(WORKSPACE_TRANSIENT_DISMISS_EVENT));
}
