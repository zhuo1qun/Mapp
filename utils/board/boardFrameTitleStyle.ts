export function resolveBoardFrameTitleTint({
  frameId,
  filterFrameIds,
  selectedFrameId,
  themeColor,
  frameTint
}: {
  frameId: string;
  filterFrameIds: Set<string>;
  selectedFrameId: string | null;
  themeColor: string;
  frameTint: (color: string, alpha: number) => string;
}): string {
  const filterActive = filterFrameIds.size > 0;
  const inFilter = filterFrameIds.has(frameId);
  if (filterActive && !inFilter) return 'rgba(107, 114, 128, 0.32)';
  if (inFilter) return frameTint(themeColor, 0.52);
  if (selectedFrameId === frameId) return frameTint(themeColor, 0.48);
  return 'rgba(107, 114, 128, 0.26)';
}
