import type { Note } from '../../types';

export type BoardLayerOrderCommand = 'forward' | 'backward' | 'front' | 'back';

const orderValue = (note: Note) => note.layerStackOrder ?? note.createdAt;

/** 从底到顶返回稳定顺序；不使用画布坐标、对象类型或当前选中状态。 */
export function sortNotesByBoardLayer(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const delta = orderValue(a) - orderValue(b);
    return delta || a.id.localeCompare(b.id);
  });
}

/**
 * Figma 风格层级命令。每次写回紧凑的显式顺序，清除创建时间等隐式回退对后续操作的影响。
 * 多选时把选中对象视作一个保持内部顺序的块。
 */
export function reorderBoardNoteLayers(
  notes: Note[],
  selectedNoteIds: ReadonlySet<string>,
  command: BoardLayerOrderCommand
): Note[] {
  if (!selectedNoteIds.size) return notes;
  const ordered = sortNotesByBoardLayer(notes);
  const selected = ordered.filter((note) => selectedNoteIds.has(note.id));
  if (!selected.length) return notes;
  const rest = ordered.filter((note) => !selectedNoteIds.has(note.id));
  const selectedIndexes = ordered
    .map((note, index) => selectedNoteIds.has(note.id) ? index : -1)
    .filter((index) => index >= 0);
  const first = selectedIndexes[0];
  const last = selectedIndexes[selectedIndexes.length - 1];

  let nextOrdered: Note[];
  if (command === 'front') {
    nextOrdered = [...rest, ...selected];
  } else if (command === 'back') {
    nextOrdered = [...selected, ...rest];
  } else if (command === 'forward') {
    const nextAbove = ordered.findIndex((note, index) => index > last && !selectedNoteIds.has(note.id));
    if (nextAbove < 0) nextOrdered = ordered;
    else {
      const target = ordered[nextAbove];
      const targetIndex = rest.findIndex((note) => note.id === target.id);
      nextOrdered = [...rest.slice(0, targetIndex + 1), ...selected, ...rest.slice(targetIndex + 1)];
    }
  } else {
    let previousBelow = -1;
    for (let index = first - 1; index >= 0; index -= 1) {
      if (!selectedNoteIds.has(ordered[index].id)) { previousBelow = index; break; }
    }
    if (previousBelow < 0) nextOrdered = ordered;
    else {
      const target = ordered[previousBelow];
      const targetIndex = rest.findIndex((note) => note.id === target.id);
      nextOrdered = [...rest.slice(0, targetIndex), ...selected, ...rest.slice(targetIndex)];
    }
  }

  const explicitOrder = new Map(nextOrdered.map((note, index) => [note.id, index]));
  return notes.map((note) => ({ ...note, layerStackOrder: explicitOrder.get(note.id) ?? 0 }));
}
