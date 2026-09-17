/** OS 文件拖拽（Finder / 资源管理器） */
export function isFileDragTypes(types: DataTransfer['types'] | undefined) {
  return !!types && Array.from(types).includes('Files');
}

/** 拖出浏览器窗口：坐标落到视口外。 */
export function isFileDragLeavingViewport(clientX: number, clientY: number) {
  return (
    clientX <= 0 ||
    clientY <= 0 ||
    clientX >= window.innerWidth ||
    clientY >= window.innerHeight
  );
}

export function pickJsonFile(files: FileList | File[] | null | undefined): File | undefined {
  if (!files) return undefined;
  return Array.from(files).find(
    (file) => file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')
  );
}
