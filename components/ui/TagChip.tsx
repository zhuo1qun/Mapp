import React from 'react';

interface TagChipProps {
  label: string;
  color: string;
  /** 点击标签主体（不含 ×）时触发，例如进入编辑 */
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export const TagChip: React.FC<TagChipProps> = ({
  label,
  color,
  onClick,
  onRemove,
  className = '',
}) => {
  const classes = [
    'flex-shrink-0 min-w-0 h-6 px-2.5 rounded-full text-xs font-bold text-white shadow-sm',
    'flex items-center gap-1 whitespace-nowrap select-none',
    onClick || onRemove ? 'cursor-pointer hover:opacity-80 transition-opacity' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      style={{ backgroundColor: color }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="min-w-0 truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          className="shrink-0 border-0 bg-transparent p-0 text-[inherit] leading-none cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
};

