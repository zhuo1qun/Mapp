import React from 'react';
import { NoteEditorAddPillLabel } from './addPillStyles';

type NoteIconButtonVariant = 'neutral' | 'primary' | 'danger' | 'success';

interface NoteIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NoteIconButtonVariant;
  themeColor?: string;
  active?: boolean;
  /** 与 NoteEditor 小胶囊一致：默认只显示 icon，交互时展开文字。 */
  label?: string;
  children: React.ReactNode;
}

const baseClasses =
  'rounded-full p-2 min-h-9 min-w-9 box-border transition-colors active:scale-95 inline-flex items-center justify-center';

const variantClasses: Record<NoteIconButtonVariant, string> = {
  neutral: 'text-gray-700 hover:text-gray-900 hover:bg-black/5',
  primary: 'text-theme-chrome-fg',
  danger: 'text-red-600 hover:text-red-700 hover:bg-red-50',
  success: 'text-green-600 hover:text-green-700 hover:bg-green-50',
};

export const NoteIconButton: React.FC<NoteIconButtonProps> = ({
  variant = 'neutral',
  themeColor,
  active = false,
  label,
  className = '',
  style,
  type = 'button',
  children,
  ...rest
}) => {
  const isPrimary = variant === 'primary';

  const mergedStyle: React.CSSProperties = {
    ...(style || {}),
    ...(isPrimary && active && themeColor
      ? { backgroundColor: themeColor }
      : {}),
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={`${classes} group gap-0`} style={mergedStyle} {...rest}>
      {label ? <NoteEditorAddPillLabel>{label}</NoteEditorAddPillLabel> : null}
      {children}
    </button>
  );
};
