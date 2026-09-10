import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  EditInspectorPanel,
  type EditInspectorPanelProps
} from '../map/overlays/MapEditInspectorPanel';
import { MotionDiv } from '../ui/MotionDiv';
import { applyWorkspaceRightEdgeForInspector } from '../../utils/ui/chromeMenuPosition';

type EditInspectorContextValue = {
  setPayload: (p: EditInspectorPanelProps | null) => void;
};

const EditInspectorContext = createContext<EditInspectorContextValue | null>(null);

/**
 * 右侧属性栏统一进出场壳。壳占满视口但不接管事件，实际 aside 自行恢复 pointer events；
 * 这样既能整体平移 fixed 侧栏，也不会挡住其余工作区。
 */
export function AnimatedEditInspectorPanel({
  payload
}: {
  payload: EditInspectorPanelProps | null;
}) {
  return (
    <AnimatePresence initial={false}>
      {payload ? (
        <MotionDiv
          key="edit-inspector-sidebar"
          className="pointer-events-none fixed inset-0 z-[440]"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{
            x: { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: 0.18, ease: 'easeOut' }
          }}
        >
          <EditInspectorPanel {...payload} />
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * 全局唯一右侧编辑属性面板：子视图通过 `useRegisterEditInspector` 注册内容，勿在各视图内再渲染 `EditInspectorPanel`。
 */
export function EditInspectorProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<EditInspectorPanelProps | null>(null);
  const setPayloadStable = useCallback((p: EditInspectorPanelProps | null) => {
    setPayload(p);
  }, []);

  useEffect(() => {
    const apply = () => applyWorkspaceRightEdgeForInspector(!!payload);
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      applyWorkspaceRightEdgeForInspector(false);
    };
  }, [payload]);

  return (
    <EditInspectorContext.Provider value={{ setPayload: setPayloadStable }}>
      {children}
      <AnimatedEditInspectorPanel payload={payload} />
    </EditInspectorContext.Provider>
  );
}

/** 当前激活视图在「编辑模式且应显示侧栏」为 true 时注册面板；卸载或 active 为 false 时自动清除。 */
export function useRegisterEditInspector(active: boolean, props: EditInspectorPanelProps) {
  const ctx = useContext(EditInspectorContext);
  if (!ctx) {
    throw new Error('useRegisterEditInspector must be used within EditInspectorProvider');
  }
  const { setPayload } = ctx;
  useEffect(() => {
    if (!active) {
      setPayload(null);
      return;
    }
    setPayload(props);
    return () => setPayload(null);
  }, [active, setPayload, props]);
}
