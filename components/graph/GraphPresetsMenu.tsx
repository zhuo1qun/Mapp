import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bookmark, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { GraphViewPreset } from '../../utils/graph/graphPresets';
import { ChromeWindow } from '../ui/ChromeWindow';
import { PortalTooltip } from '../ui/PortalTooltip';

type Props = {
  themeColor: string;
  /** 底栏玻璃底，与 GraphLayoutModeBar 一致 */
  panelChromeStyle?: React.CSSProperties;
  presets: GraphViewPreset[];
  activePresetId?: string | null;
  onSaveCurrent: (name: string) => void;
  /** 用当前视图覆盖指定预设（保留名称与 id） */
  onUpdatePreset: (id: string) => void;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** 与时间线/力导同款的页签按钮 class */
  tabButtonClassName: string;
  /** 当前处于预设态（有 activePresetId）时高亮页签 */
  tabActive: boolean;
};

const MENU_WIDTH = 288;
const MENU_GAP = 8;

/**
 * 图谱视图底栏「预设」页签 + 浮层（保存 / 应用 / 改名 / 删除）。
 * 预设态与时间线 / 力导互斥：应用预设后高亮本页签。
 */
export const GraphPresetsMenu: React.FC<Props> = ({
  themeColor,
  panelChromeStyle,
  presets,
  activePresetId,
  onSaveCurrent,
  onUpdatePreset,
  onApply,
  onRename,
  onDelete,
  tabButtonClassName,
  tabActive
}) => {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, r.left + r.width / 2 - width / 2),
        window.innerWidth - width - 8
      );
      const bottom = Math.max(8, window.innerHeight - r.top + MENU_GAP);
      setMenuPos({ left, bottom });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraftName('');
    }
  }, [open]);

  useEffect(() => {
    if (open) nameInputRef.current?.focus();
  }, [open]);

  const handleSave = () => {
    const name = draftName.trim() || `预设 ${presets.length + 1}`;
    onSaveCurrent(name);
    setDraftName('');
  };

  const highlight = tabActive || open;

  return (
    <div ref={wrapRef} className="relative flex items-center shrink-0">
      <PortalTooltip content="预设" compact>
        <button
          type="button"
          aria-label="预设"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className={tabButtonClassName}
          style={highlight ? { backgroundColor: themeColor } : undefined}
        >
          <Bookmark size={20} />
        </button>
      </PortalTooltip>

      <ChromeWindow
        open={open}
        onClose={() => setOpen(false)}
        backdropLabel="关闭预设"
        surface="window"
        left={menuPos?.left ?? null}
        bottom={menuPos?.bottom ?? null}
        dismissIgnoreRefs={[wrapRef]}
        role="dialog"
        aria-label="图谱预设"
        className={`w-[min(18rem,calc(100vw-1.5rem))] ${
          panelChromeStyle ? '' : 'bg-white'
        }`}
        style={panelChromeStyle}
      >
              <div className="border-b border-gray-100/80 px-3 py-2.5">
                <div className="text-sm font-semibold text-gray-900">图谱预设</div>
                <p className="mt-0.5 text-[10px] leading-snug text-gray-400">
                  临时记录点位、图例颜色与图层显隐，不写入项目文件
                </p>
              </div>

              <div className="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-contain px-1.5 py-1.5">
                {presets.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-gray-400">暂无预设，保存当前视图开始</p>
                ) : (
                  <ul className="space-y-0.5">
                    {presets.map((p) => {
                      const active = p.id === activePresetId;
                      const editing = editingId === p.id;
                      return (
                        <li
                          key={p.id}
                          className={`rounded-lg px-1.5 py-1 ${active ? 'bg-gray-100/80' : 'hover:bg-gray-50'}`}
                        >
                          {editing ? (
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingId(null);
                                    return;
                                  }
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onRename(p.id, editDraft);
                                    setEditingId(null);
                                  }
                                }}
                                className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-2"
                                style={{ ['--tw-ring-color' as string]: themeColor }}
                              />
                              <button
                                type="button"
                                className="rounded-md p-1 text-gray-600 hover:bg-gray-100"
                                title="确认"
                                onClick={() => {
                                  onRename(p.id, editDraft);
                                  setEditingId(null);
                                }}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
                                title="取消"
                                onClick={() => setEditingId(null)}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-xs font-medium text-gray-800"
                                title="应用此预设"
                                onClick={() => onApply(p.id)}
                              >
                                {p.name}
                                {active ? (
                                  <span className="ml-1 text-[10px] font-normal text-gray-400">当前</span>
                                ) : null}
                              </button>
                              {active ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                  title="保存当前视图到此预设"
                                  onClick={() => onUpdatePreset(p.id)}
                                >
                                  <Save size={13} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="重命名"
                                onClick={() => {
                                  setEditingId(p.id);
                                  setEditDraft(p.name);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="删除"
                                onClick={() => {
                                  if (window.confirm(`删除预设「${p.name}」？`)) onDelete(p.id);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-gray-100/80 px-2.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={nameInputRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                    placeholder={`预设 ${presets.length + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200/90 bg-white/70 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-gray-300"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-theme-chrome-fg shadow-sm"
                    style={{ backgroundColor: themeColor }}
                    title="保存当前点位与图例"
                  >
                    <Plus size={14} />
                    保存
                  </button>
                </div>
              </div>
      </ChromeWindow>
    </div>
  );
};
