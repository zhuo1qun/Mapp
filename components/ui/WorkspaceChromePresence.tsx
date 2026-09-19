import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { MotionDiv } from './MotionDiv';

type WorkspaceChromeMotion = 'fade' | 'slide-up' | 'slide-left';

type Props = {
  visible: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  motion?: WorkspaceChromeMotion;
};

const motionStates: Record<WorkspaceChromeMotion, { initial: object; animate: object; exit: object }> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, pointerEvents: 'none' }
  },
  'slide-up': {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 12, pointerEvents: 'none' }
  },
  'slide-left': {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24, pointerEvents: 'none' }
  }
};

/** 工作区通用 chrome 的进出场壳，供 Map / Graph / Board 共享的全局控件使用。 */
export function WorkspaceChromePresence({
  visible,
  children,
  className,
  style,
  motion = 'fade'
}: Props) {
  const states = motionStates[motion];
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <MotionDiv
          className={className}
          style={style}
          initial={states.initial}
          animate={states.animate}
          exit={states.exit}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </MotionDiv>
      ) : null}
    </AnimatePresence>
  );
}
