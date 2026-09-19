/** Homepage hero is shared by the DOM title and the physics easter egg. */
export const HOME_HERO_LINES = ['START', 'YOUR', 'MAPP📌NG'] as const;

/**
 * 标题字距节奏：1 = 一个点（小加宽），2 = 两个点（更大加宽）。
 * 对应：S..TA..R.T / Y.O..U..R / M.A.P.PI.N..G；图钉代表 I。
 */
const HOME_HERO_GAP_UNITS = [
  [1, -1, 1, 0, 0],
  [0, 1, 1, 0],
  [2, 1, 1, -5, -4, 1, 0]
] as const;

export function getHomeHeroCharacterGapEm(lineIndex: number, characterIndex: number) {
  return (HOME_HERO_GAP_UNITS[lineIndex]?.[characterIndex] ?? 0) * 0.04;
}

export const HOME_HERO_CHARACTER_SELECTOR = '[data-home-hero-character="true"]';

export function isHomeHeroPinCharacter(character: string) {
  return character === '📌';
}

/**
 * Stable, deliberately subtle irregularity for the static title.
 * It must not be random: the physics handoff reads the rendered glyph geometry.
 */
export function getHomeHeroCharacterPose(lineIndex: number, characterIndex: number) {
  const seed = lineIndex * 11 + characterIndex * 7;
  const rotations = [8, -2, 0, 2, 6] as const;
  const offsets = [-4, -2, 2, 6] as const;
  return {
    rotateDeg: rotations[seed % rotations.length]!,
    translateYPx: offsets[seed % offsets.length]!
  };
}
