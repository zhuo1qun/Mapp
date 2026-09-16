/**
 * 为项目复制生成稳定、可读且不重复的名称。
 * 同时收敛旧版可能遗留的「(Copy) (Copy)」形式。
 */
export function buildCopyProjectName(sourceName: string, existingNames: Iterable<string>): string {
  const trimmed = sourceName.trim() || 'Untitled Project';
  const base = trimmed.replace(/(?:\s+\(Copy(?:\s+\d+)?\))+$/i, '').trim() || trimmed;
  const used = new Set([...existingNames].map((name) => name.trim()));
  const firstCopy = `${base} (Copy)`;

  if (!used.has(firstCopy)) return firstCopy;

  let index = 2;
  while (used.has(`${base} (Copy ${index})`)) index += 1;
  return `${base} (Copy ${index})`;
}
