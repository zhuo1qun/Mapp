/** Homepage hero is shared by the DOM title and the physics easter egg. */
export const HOME_HERO_LINES = ['START', 'YOUR', 'MAPP📌NG'] as const;

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
  const rotations = [-2, -1, 0, 1, 2] as const;
  const offsets = [-4, -2, 2, 4] as const;
  return {
    rotateDeg: rotations[seed % rotations.length]!,
    translateYPx: offsets[seed % offsets.length]!
  };
}
