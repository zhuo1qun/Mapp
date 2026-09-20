import React from 'react';

type Props = {
  children: React.ReactNode;
  themeColor: string;
};

type State = { error: Error | null };

/**
 * 工作区是懒加载的大型运行时（地图/画布/图谱）。若某个浏览器能力或模块初始化失败，
 * 不应让 React 卸载整个根树并只露出主题背景。
 */
export class WorkspaceErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Workspace failed to initialize', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 px-6 text-center text-theme-chrome-fg"
        style={{ backgroundColor: this.props.themeColor }}
        role="alert"
      >
        <div className="text-base font-semibold">工作区未能启动</div>
        <p className="max-w-md text-sm opacity-80">
          {error.message || '初始化时发生未知错误'}
        </p>
        <button
          type="button"
          className="rounded-xl border border-current/30 px-4 py-2 text-sm font-medium"
          onClick={() => window.location.reload()}
        >
          重新加载
        </button>
      </div>
    );
  }
}
