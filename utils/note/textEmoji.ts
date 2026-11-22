/** 匹配一个完整 emoji 字素：含旗帜、键帽、肤色和常见 ZWJ 组合。 */
const EMOJI_GRAPHEME = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)/u;

/** 正文第一行中由用户直接输入的第一个 emoji。 */
export function firstLineInputEmoji(text: string): string {
  const firstLine = String(text ?? '').split(/\r?\n/, 1)[0] ?? '';
  return firstLine.match(EMOJI_GRAPHEME)?.[0] ?? '';
}

/** 正文输入优先；只有第一行没有 emoji 时才使用独立字段。 */
export function resolveNoteEmoji(text: string, fieldEmoji: string): string {
  return firstLineInputEmoji(text) || String(fieldEmoji ?? '').trim();
}

