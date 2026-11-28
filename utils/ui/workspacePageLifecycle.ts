/**
 * 页面从 bfcache 或外部 App 返回前台后，工作区只重新校正依赖视口的渲染；
 * 不触发项目重载，保留浏览器已经恢复的画布与编辑会话。
 */
export const WORKSPACE_PAGE_RESUME_EVENT = 'mapp:workspace-page-resume';

export type WorkspacePageResumeReason = 'bfcache' | 'visibility';

export function dispatchWorkspacePageResume(reason: WorkspacePageResumeReason): void {
  window.dispatchEvent(
    new CustomEvent<WorkspacePageResumeReason>(WORKSPACE_PAGE_RESUME_EVENT, { detail: reason })
  );
}
